import http from "http";
import path from "path";

import express from "express";
import { Server } from "socket.io";

import { publisher, redis, subscriber } from "./redis-connection.js";

const box = 100;
const checkBoxKey = "checkboxState";
const rateLimitingHashMap = new Map();
const state = {
  checkboxes: new Array(box).fill(false),
};

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT ?? 8000;

  const io = new Server();
  io.attach(server);

  await subscriber.subscribe("internal-server:checkbox:change");
  subscriber.on("message", (channel, message) => {
    if (channel === "internal-server:checkbox:change") {
      const { index, checked } = JSON.parse(message);
      state.checkboxes[index] = checked;
      io.emit("server:checkbox:change", { index, checked });
    }
  });

  io.on("connection", (socket) => {
    console.log("socket connected", { id: socket.id });

    socket.on("client:checkbox:changes", async (data) => {
      console.log(`[Socket:${socket.id}]:client:checkbox:changes`, data);

      const lastOperationTime = await redis.get(`rate-limit:${socket.id}`);

      if (lastOperationTime) {
        const timeDiff = Date.now() - lastOperationTime;
        if (timeDiff < 5 * 1000) {
          socket.emit("server:rate-limit", {
            message:
              "You are doing this too frequently. Please wait before trying again.",
          });
          return;
        }
      } 
        await redis.set(`rate-limit:${socket.id}`, Date.now());
      

      const existing = await redis.get(checkBoxKey);
      if (existing) {
        const remoteData = JSON.parse(existing);
        remoteData[data.index] = data.checked;
        await redis.set(checkBoxKey, JSON.stringify(remoteData));
      } else {
        await redis.set(
          checkBoxKey,
          JSON.stringify(new Array(box).fill(false)),
        );
      }
      await publisher.publish(
        "internal-server:checkbox:change",
        JSON.stringify(data),
      );
    });

    socket.on("disconnect", () => {
      rateLimitingHashMap.delete(socket.id);
      console.log("socket disconnected", { id: socket.id });
    });
  });

  app.use(express.static(path.resolve("public")));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/checkboxes", async (req, res) => {
    const existing = await redis.get(checkBoxKey);
    if (existing) {
      const remoteData = JSON.parse(existing);
      return res.json({ checkboxes: remoteData });
    }
    return res.json({ checkboxes: new Array(box).fill(false) });
  });

  server.listen(PORT, (req, res) => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();

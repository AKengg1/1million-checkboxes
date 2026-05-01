import http from "http";
import path from "path";
import express from "express";
import { Server } from "socket.io";
import { publisher, redis, subscriber } from "./redis-connection.js";

const box         = 1_000_000;
const checkBoxKey = "checkboxState";
const CHANNEL     = "internal-server:checkbox:change";
const RATE_MS     = 500;

// Load full state from Redis into memory on boot
async function loadState() {
  const existing = await redis.get(checkBoxKey);
  return existing
    ? JSON.parse(existing)
    : new Array(box).fill(false);
}

async function startServer() {
  const app    = express();
  const server = http.createServer(app);
  const PORT   = process.env.PORT ?? 8000;
  const io     = new Server();
  io.attach(server);

  // ── Boot: load state from Redis ──────────────────────────────
  const state = { checkboxes: await loadState() };
  console.log("State loaded from Redis");

  // ── Pub/Sub: broadcast changes to all WS clients ─────────────
  await subscriber.subscribe(CHANNEL);
  subscriber.on("message", (channel, message) => {
    if (channel !== CHANNEL) return;
    const { index, checked } = JSON.parse(message);
    state.checkboxes[index] = checked;                    // keep in-memory in sync
    io.emit("server:checkbox:change", { index, checked });
  });

  // ── WebSocket ─────────────────────────────────────────────────
  io.on("connection", (socket) => {
    console.log("socket connected", { id: socket.id });

    socket.on("client:checkbox:changes", async (data) => {
      // Rate limit check
      const lastTime = await redis.get(`rate-limit:${socket.id}`);
      if (lastTime && Date.now() - Number(lastTime) < RATE_MS) {
        socket.emit("server:rate-limit", {
          message: "Too fast. Please wait before trying again.",
        });
        return;
      }
      await redis.set(`rate-limit:${socket.id}`, Date.now(), "EX", 5); // ✅ TTL

      // Apply toggle — fix: works even when Redis has no state
      const existing   = await redis.get(checkBoxKey);
      const remoteData = existing
        ? JSON.parse(existing)
        : new Array(box).fill(false);

      remoteData[data.index] = data.checked;              // ✅ applied in both branches
      await redis.set(checkBoxKey, JSON.stringify(remoteData));

      await publisher.publish(CHANNEL, JSON.stringify(data));
    });

    socket.on("disconnect", () => {
      console.log("socket disconnected", { id: socket.id });
    });
  });

  // ── HTTP ──────────────────────────────────────────────────────
  app.use(express.static(path.resolve("public")));

  app.get("/health", (_, res) => res.json({ status: "ok" }));

  // Range endpoint — frontend requests only what's visible
  app.get("/checkboxes", async (req, res) => {
    const from = Math.max(0,       parseInt(req.query.from ?? "0",   10));
    const to   = Math.min(box - 1, parseInt(req.query.to   ?? "999", 10));

    const existing = await redis.get(checkBoxKey);
    const full     = existing
      ? JSON.parse(existing)
      : new Array(box).fill(false);

    return res.json({
      checkboxes: full.slice(from, to + 1),  // ✅ only the requested slice
      from,
      to,
      total: box,
    });
  });

  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
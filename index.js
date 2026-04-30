import http from "http";
import path from "path";

import express from "express";
import { Server } from "socket.io";
import { Socket } from "dgram";

const box =100

const state={
    checkboxes:new Array(box).fill(false)
}


async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = process.env.PORT ?? 8000;

  const io = new Server();
  io.attach(server);

  io.on("connection", (socket) => {
    console.log("socket connected", { id: socket.id });

    socket.on("client:checkbox:changes", (data)=>{
        console.log(`[Socket:${socket.id}]:client:checkbox:changes`, data)
        io.emit("server:checkbox:change", data)
        state.checkboxes[data.index]=data.checked
    })
  });

  app.use(express.static(path.resolve("public")));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/checkboxes",(req,res)=>{
    return res.json({checkbox:state.checkboxes})
  })

  server.listen(PORT, (req, res) => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();

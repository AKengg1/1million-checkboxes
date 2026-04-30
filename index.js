import http from 'http';
import path from "path"

import express from "express"
import { Server } from 'socket.io';
import { Socket } from 'dgram';

async function startServer() {
const app =express()
const server = http.createServer(app)
const PORT =process.env.PORT ?? 8000


const io = new Server()
io.attach(server)

io.on("connection",(socket)=>{
console.log("socket connected", {id:socket.id})
})


app.use(express.static(path.resolve('public')))

app.get("/health",(req,res)=>{
    res.json({status:'ok'})
})

server.listen(PORT,(req, res)=>{
    console.log(`Server running at http://localhost:${PORT}`)
})
}

startServer()
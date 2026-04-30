import http from 'http';
import express from "express"
import path from "path"

async function startServer() {
const app =express()
const server = http.createServer(app)
const PORT =process.env.PORT ?? 8000

app.use(express.static(path.resolve('public')))

app.get("/health",(req,res)=>{
    res.json({status:'ok'})
})

server.listen(PORT,(req, res)=>{
    console.log(`Server running at http://localhost:${PORT}`)
})
}

startServer()
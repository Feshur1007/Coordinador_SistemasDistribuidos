const webSocket= require ("ws")

const PORT = 3000
const TIMEOUT = 5000

const wss = new webSocket.Server({  port: PORT })

let servers = {}
let totalTimeouts = 0 

console.log(`Coordinator WS corriendo en puerto ${PORT}`)

wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        let data 

        try {
            data = JSON.parse(msg)
        } catch {
            return ws.send(JSON.stringify({ error: "Ese Json ta paila mk"}))

        }

        switch (data.type) {
            case "register":
            handleRegister(ws,data)
            break;

            case "pulse":
            handlePulse(ws,data)
            break;

            case "get-servers":
            handleGetServers(ws)
            break;

            case "get-metrics":
            handleGetMetrics(ws)
            break;
            

        }
    })
})

function handleRegister(ws, data) {
    const {id, url} =data

    if (!id || !url) {
        return escape.send(JSON.stringify({
            type: "error",
            message: "Faltaron datos"
        }))
    }

    servers[id] = {
        id,
        url,
        lastPulse: Date.now()
    }

    console.log(`Servidor registrado: ${id} -> ${url}`)

    ws.send(JSON.stringify({
        type: "registered",
        id
    }))
}

function handlePulse(ws,data) {
    const { id } = data

    if (!servers[id]) {
        return ws.send(JSON.stringify({
            type: "error",
            message: "Servidor no registrado, estudie"
        }))
    }

    server[id].lastPulse = DataTransfer.now()

    ws.send(JSON.stringify({
        type: "pulse-received",
        id
    }))

}

setInterval(()=> {
    const now = Date.now()

    for(let id in servers) {
        if (now - servers[id].lastPulse > TIMEOUT) {
            console.log(`Worker eliminado por TIMEOUT: ${id}`)
            delete servers[id]
            totalTimeouts++
        }
    }
}, 2000)
const webSocket = require("ws");

const PORT = 3000; // Cambiado a 4000 para que coincida con tu ngrok
const TIMEOUT = 5000;

const wss = new webSocket.Server({ port: PORT });

let servers = {};
let totalTimeouts = 0;

console.log(`Coordinator WS corriendo en puerto ${PORT}`);

wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        let data;
        try {
            // Convertimos a string por si llega como Buffer
            data = JSON.parse(msg.toString());
        } catch (e) {
            return ws.send(JSON.stringify({ error: "Ese Json ta paila mk" }));
        }

        switch (data.type) {
            case "register":
                handleRegister(ws, data);
                break;
            case "pulse":
                handlePulse(ws, data);
                break;
            case "get-servers":
                // Evitamos que falle si no has creado la función
                ws.send(JSON.stringify({ type: "servers-list", servers }));
                break;
            default:
                console.log("Tipo de mensaje no reconocido:", data.type);
        }
    });
});

function handleRegister(ws, data) {
    const { id, url } = data;

    if (!id || !url) {
        return ws.send(JSON.stringify({ // CORREGIDO: de escape a ws
            type: "error",
            message: "Faltaron datos"
        }));
    }

    servers[id] = {
        id,
        url,
        lastPulse: Date.now()
    };

    console.log(`Servidor registrado: ${id} -> ${url}`);
    ws.send(JSON.stringify({ type: "registered", id }));
}

function handlePulse(ws, data) {
    const { id } = data;

    if (!servers[id]) { // CORREGIDO: servers en plural
        return ws.send(JSON.stringify({
            type: "error",
            message: "Servidor no registrado, estudie"
        }));
    }

    // CORREGIDO: servers en plural y Date.now()
    servers[id].lastPulse = Date.now();

    ws.send(JSON.stringify({
        type: "pulse-received",
        id
    }));
}

// Limpiador de servidores muertos
setInterval(() => {
    const now = Date.now();
    for (let id in servers) {
        if (now - servers[id].lastPulse > TIMEOUT) {
            console.log(`Worker eliminado por TIMEOUT: ${id}`);
            delete servers[id];
            totalTimeouts++;
        }
    }
}, 2000);
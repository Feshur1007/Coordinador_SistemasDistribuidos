const webSocket = require("ws");
const express = require("express");

const PORT = 4000; 
const HTTP_PORT = 3000;
const TIMEOUT = 5000;

const wss = new webSocket.Server({ port: PORT });
const app = express();

app.use(express.json());

let servers = {};
let backups = {};
let totalTimeouts = 0;
let isPrimary = true;

console.log(`Coordinator WS corriendo en puerto ${PORT}`);



wss.on("connection", (ws) => {
    ws.on("message", (msg) => {
        let data;

        try {
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
                ws.send(JSON.stringify({ 
                    type: "servers-list", 
                    servers 
                }));
                break;

            case "register-backup":
                handleRegisterBackup(ws, data);
                break;

            case "get-workers":
                ws.send(JSON.stringify({
                    type: "workers-data",
                    servers
                }));
                break;

            default:
                console.log("Tipo no reconocido:", data.type);
        }
    });
});



function handleRegister(ws, data) {
    const { id, url } = data;

    if (!id || !url) {
        return ws.send(JSON.stringify({ 
            type: "error",
            message: "Faltaron datos"
        }));
    }

    servers[id] = {
        id,
        url,
        lastPulse: Date.now()
    };

    console.log(`Worker registrado: ${id} -> ${url}`);

    ws.send(JSON.stringify({ 
        type: "registered", 
        id,
        backups
    }));
}


function handlePulse(ws, data) {
    const { id } = data;

    if (!servers[id]) {
        return ws.send(JSON.stringify({
            type: "error",
            message: "Servidor no registrado"
        }));
    }

    servers[id].lastPulse = Date.now();

    ws.send(JSON.stringify({
        type: "pulse-received",
        id,
        backups 
    }));
}



function handleRegisterBackup(ws, data) {
    const { id, url } = data;

    if (!id || !url) {
        return ws.send(JSON.stringify({
            type: "error",
            message: "Datos incompletos"
        }));
    }

    backups[id] = {
        id,
        url,
        lastSync: null
    };

    console.log(`Backup registrado: ${id} -> ${url}`);

    ws.send(JSON.stringify({
        type: "backup-registered",
        backups
    }));
}



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


function syncBackups() {
    Object.values(backups).forEach(backup => {
        const ws = new webSocket(backup.url);

        ws.on("open", () => {
            ws.send(JSON.stringify({
                type: "sync-data",
                servers
            }));

            backup.lastSync = Date.now();
        });

        ws.on("error", () => {
            console.log(`Error conectando backup ${backup.id}`);
        });
    });
}



app.get("/status", (req, res) => {
    res.json({
        workers: servers,
        backups,
        totalWorkers: Object.keys(servers).length,
        isPrimary
    });
});

// registrar backup
app.post("/backup", (req, res) => {
    const { id, url } = req.body;

    if (!id || !url) {
        return res.json({ error: "Faltan datos" });
    }

    backups[id] = { id, url };

    res.json({ message: "Backup registrado" });
});

// sync manual
app.post("/sync", (req, res) => {
    syncBackups();
    res.json({ message: "Sync ejecutado" });
});



app.get("/", (req, res) => {
    res.send(`
    <html>
    <head>
        <title>Coordinator Dashboard</title>
        <style>
            body {
                font-family: Arial;
                background: #0f172a;
                color: white;
                margin: 0;
                padding: 20px;
            }

            h1 {
                text-align: center;
            }

            .container {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 20px;
            }

            .card {
                background: #1e293b;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 0 10px rgba(0,0,0,0.5);
            }

            .status {
                text-align: center;
                margin-bottom: 20px;
            }

            .status span {
                padding: 5px 10px;
                border-radius: 5px;
            }

            .primary {
                background: green;
            }

            .secondary {
                background: red;
            }

            ul {
                list-style: none;
                padding: 0;
            }

            li {
                background: #334155;
                margin: 5px 0;
                padding: 10px;
                border-radius: 5px;
            }

            input {
                padding: 10px;
                margin: 5px;
                border-radius: 5px;
                border: none;
            }

            button {
                padding: 10px;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                background: #3b82f6;
                color: white;
            }

            button:hover {
                background: #2563eb;
            }
        </style>
    </head>

    <body>

        <h1>🚀 Coordinator Dashboard</h1>

        <div class="status">
            <p>
                Estado: 
                <span id="role"></span>
            </p>
            <p>Total Workers: <b id="count"></b></p>
        </div>

        <div class="container">

            <div class="card">
                <h2>🖥️ Workers Activos</h2>
                <ul id="workers"></ul>
            </div>

            <div class="card">
                <h2>🗄️ Backups</h2>
                <ul id="backups"></ul>
            </div>

            <div class="card">
                <h3>➕ Registrar Backup</h3>
                <input id="id" placeholder="ID del backup">
                <input id="url" placeholder="wss://ngrok-url">
                <button onclick="addBackup()">Registrar</button>
            </div>

            <div class="card">
                <h3>🔄 Sincronización</h3>
                <button onclick="sync()">Forzar Sync</button>
            </div>

        </div>

        <script>
            async function load() {
                const res = await fetch('/status');
                const data = await res.json();

                document.getElementById('count').innerText = data.totalWorkers;

                const role = document.getElementById('role');
                role.innerText = data.isPrimary ? "PRIMARIO" : "BACKUP";
                role.className = data.isPrimary ? "primary" : "secondary";

                const workers = document.getElementById('workers');
                workers.innerHTML = "";

                Object.values(data.workers).forEach(w => {
                    const lastSeen = Date.now() - w.lastPulse;
                    workers.innerHTML += 
                        "<li><b>" + w.id + "</b><br/>" +
                        "URL: " + w.url + "<br/>" +
                        "Último pulse: " + lastSeen + " ms</li>";
                });

                const backups = document.getElementById('backups');
                backups.innerHTML = "";

                Object.values(data.backups).forEach(b => {
                    backups.innerHTML += 
                        "<li><b>" + b.id + "</b><br/>" +
                        "URL: " + b.url + "</li>";
                });
            }

            async function addBackup() {
                const id = document.getElementById('id').value;
                const url = document.getElementById('url').value;

                await fetch('/backup', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ id, url })
                });

                load();
            }

            async function sync() {
                await fetch('/sync', { method: 'POST' });
                alert("Sincronización enviada");
            }

            setInterval(load, 2000);
            load();
        </script>

    </body>
    </html>
    `);
});


// ========================
app.listen(HTTP_PORT, () => {
    console.log("Web corriendo en puerto " + HTTP_PORT);
});
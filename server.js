// backend/server.js
const express = require('express');
const cors = require('cors');
const http = require('http');           
const WebSocket = require('ws');        
require('dotenv').config();

const sensorRoutes = require('./routes/sensor');
const sensorController = require('./controllers/sensorController');

const app = express();
const PORT = process.env.PORT || 5003; 

// CORS
app.use(cors({ origin: true, credentials: true }));
app.use(express.json()); 
app.use(express.static('public')); 

app.use((req, res, next) => {
    const origin = req.headers.origin || req.headers.host || 'Unknown';
    console.log(`[Req] ${req.method} ${req.url} | Origin: ${origin}`);
    next();
});

// Server Setup
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let espSocket = null; 
let deviceStatus = { r1: false, r2: false, r1Start: null, r2Start: null };

// Broadcast function
function broadcastStatus() {
    const payload = JSON.stringify({ type: 'STATUS_UPDATE', data: deviceStatus });
    wss.clients.forEach(client => {
        if (client !== espSocket && client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Heartbeat
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 5000);

wss.on('close', function close() { clearInterval(interval); });

// WebSocket Logic
wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[WebSocket] New Connection from: ${ip}`);
    
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Send status to new clients immediately
    ws.send(JSON.stringify({ type: 'STATUS_UPDATE', data: deviceStatus }));

    ws.on('message', (message) => {
        try {
            const msgStr = message.toString();
            const data = JSON.parse(msgStr);

            // 1. RELAY STATUS UPDATE
            if (data.type === 'STATUS') {
                espSocket = ws; 
                let changed = false;
                
                if (data.r1 !== deviceStatus.r1) {
                    deviceStatus.r1 = data.r1;
                    deviceStatus.r1Start = data.r1 ? Date.now() : null;
                    changed = true;
                }
                if (data.r2 !== deviceStatus.r2) {
                    deviceStatus.r2 = data.r2;
                    deviceStatus.r2Start = data.r2 ? Date.now() : null;
                    changed = true;
                }
                if (changed) broadcastStatus();
            }
            
            // 2. SENSOR DATA STREAM
            else if (data.type === 'SENSOR_DATA') {
                // Save to SQLite
                sensorController.saveSensorData(data);

                // Broadcast live to Dashboard
                const livePayload = JSON.stringify({ type: 'SENSOR_UPDATE', data: data });
                wss.clients.forEach(client => {
                    if (client !== espSocket && client.readyState === WebSocket.OPEN) {
                        client.send(livePayload);
                    }
                });
            }

        } catch (e) { 
            console.error(`[Error] Bad JSON or Logic: ${e.message}`); 
        }
    });

    ws.on('close', () => {
        if (espSocket === ws) {
            console.log('[WebSocket] ESP8266 Disconnected');
            espSocket = null;
        }
    });
});

// Routes
app.use('/api', sensorRoutes);

// Legacy API Endpoints
app.get('/api/status', (req, res) => res.json({ online: !!espSocket, data: deviceStatus }));

app.get('/api/relay/:id/:action', (req, res) => {
    const { id, action } = req.params;
    handleRelayCommand(id, action === 'on', res);
});

app.post('/api/relays/:id/toggle', (req, res) => {
    const { id } = req.params;
    const { state } = req.body; 
    if (typeof state !== 'boolean') return res.status(400).json({ error: "Invalid body" });
    handleRelayCommand(id, state, res);
});

// Command Handler
function handleRelayCommand(id, state, res) {
    if (!espSocket) return res.status(503).json({ error: "Device Offline" });

    let targetRelay = parseInt(id); 
    const command = { type: 'COMMAND', relay: targetRelay, state: state };

    try {
        espSocket.send(JSON.stringify(command));
        
        let changed = false;
        if (id == '1' && deviceStatus.r1 !== state) {
            deviceStatus.r1 = state;
            deviceStatus.r1Start = state ? Date.now() : null;
            changed = true;
        }
        if (id == '2' && deviceStatus.r2 !== state) {
            deviceStatus.r2 = state;
            deviceStatus.r2Start = state ? Date.now() : null;
            changed = true;
        }

        if (changed) {
            broadcastStatus();
            // Log to SQLite
            sensorController.logRelayActivity(targetRelay, state, 'App/Web');
        }

        res.json({ success: true, newState: state });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Transmission Failed" });
    }
}

app.get('/', (req, res) => res.send('PowerSense Backend Online'));

server.listen(PORT, () => {
    console.log(`PowerSense Backend running on port ${PORT}`);
});
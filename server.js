const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const http = require('http');
const WebSocket = require('ws');
require('dotenv').config();

const sensorRoutes = require('./routes/sensor');
const sensorController = require('./controllers/sensorController');

const app = express();
const PORT = process.env.PORT || 5003;

// --- MIDDLEWARE ---
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// Request Logger
app.use((req, res, next) => {
    const origin = req.headers.origin || req.headers.host || 'Unknown';
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} | Origin: ${origin}`);
    next();
});

// --- SERVER & WEBSOCKET SETUP ---
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let espSocket = null; // Pointer to the ESP8266 connection
let deviceStatus = { r1: false, r2: false, r1Start: null, r2Start: null };

/**
 * Syncs all connected clients (Web/Android) with the latest relay states.
 * Excludes the ESP8266 itself to prevent command loops.
 */
function broadcastStatus() {
    const payload = JSON.stringify({ type: 'STATUS_UPDATE', data: deviceStatus });
    wss.clients.forEach(client => {
        if (client !== espSocket && client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// WebSocket Heartbeat (Cleanup dead connections every 5s)
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 5000);

wss.on('close', () => clearInterval(interval));

// --- WEBSOCKET EVENT LOGIC ---
wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`📡 New WebSocket connection from: ${ip}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Send immediate state to new client
    ws.send(JSON.stringify({ type: 'STATUS_UPDATE', data: deviceStatus }));

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());

            // 1. HARDWARE STATUS UPDATE (From ESP8266)
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
                if (changed) {
                    console.log(`🔄 State Change: R1:${deviceStatus.r1} R2:${deviceStatus.r2}`);
                    broadcastStatus();
                }
            }

            // 2. SENSOR DATA STREAM (From ESP8266)
            else if (data.type === 'SENSOR_DATA') {
                // Persistent storage (Async fire-and-forget)
                sensorController.saveSensorData(data).catch(e => console.error("❌ DB Write Error:", e));

                // Real-time broadcast to Dashboard/App
                const livePayload = JSON.stringify({ type: 'SENSOR_UPDATE', data: data });
                wss.clients.forEach(client => {
                    if (client !== espSocket && client.readyState === WebSocket.OPEN) {
                        client.send(livePayload);
                    }
                });
            }

        } catch (e) {
            console.error(`⚠️ [WS Error] Protocol violation: ${e.message}`);
        }
    });

    ws.on('close', () => {
        if (espSocket === ws) {
            console.log('🔌 ESP8266 Disconnected');
            espSocket = null;
        }
    });
});

// --- HTTP API ROUTES ---
app.use('/api', sensorRoutes);

// Get real-time device health
app.get('/api/status', (req, res) => res.json({ online: !!espSocket, data: deviceStatus }));

// Legacy/Simple Relay Control
app.get('/api/relay/:id/:action', (req, res) => {
    const { id, action } = req.params;
    handleRelayCommand(id, action === 'on', res);
});

// Standard Toggle Endpoint (Used by Android)
app.post('/api/relays/:id/toggle', (req, res) => {
    const { id } = req.params;
    const { state } = req.body;
    if (typeof state !== 'boolean') return res.status(400).json({ error: "State must be boolean" });
    handleRelayCommand(id, state, res);
});

// --- CORE COMMAND HANDLER ---
function handleRelayCommand(id, state, res) {
    if (!espSocket) {
        return res.status(503).json({ error: "Hardware device (ESP8266) is offline" });
    }

    const targetRelay = parseInt(id);
    const command = JSON.stringify({ type: 'COMMAND', relay: targetRelay, state: state });

    try {
        espSocket.send(command);

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
            // Log to Database using the unified query interface
            sensorController.logRelayActivity(targetRelay, state, 'App/Web')
                .catch(err => console.error("❌ Activity Log Error:", err.message));
        }

        res.json({ success: true, newState: state });
    } catch (err) {
        console.error("❌ Transmission error:", err.message);
        res.status(500).json({ error: "Failed to send command to device" });
    }
}

app.get('/', (req, res) => res.send('⚡ PowerSense Backend is Online'));

server.listen(PORT, async () => {
    // Call it here to ensure DB is ready before clients connect
    await db.initDB(); 
    console.log(`🚀 PowerSense Server active on port ${PORT}`);
});
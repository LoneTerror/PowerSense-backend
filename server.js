// backend/server.js

const express = require('express');
const cors = require('cors');
const http = require('http');           // Required for WebSocket
const WebSocket = require('ws');        // WebSocket library
require('dotenv').config();

const sensorRoutes = require('./routes/sensor'); 

const app = express();
// Updated Port Logic: Uses process.env.PORT or defaults to 5003
const PORT = process.env.PORT || 5003; 

// ==========================================
//  CORS CONFIGURATION
// ==========================================
// Allow your main domain and localhost
const allowedOrigins = [
    'https://backend.powersense.site', 
    'https://relay.backend.site',      // Kept just in case you still use this frontend
    `http://localhost:${PORT}`
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true 
}));

app.use(express.json()); 
app.use(express.static('public')); // Serves the Relay Dashboard UI

// ==========================================
//  SERVER SETUP (Single Instance)
// ==========================================
const server = http.createServer(app);

// Attach WebSocket to the SAME server instance
const wss = new WebSocket.Server({ server });

// ==========================================
//  WEBSOCKET & RELAY LOGIC
// ==========================================

// State Management
let espSocket = null; 
let deviceStatus = { 
    r1: false, 
    r2: false,
    r1Start: null,
    r2Start: null
};

// Heartbeat System
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) {
            console.log('[Heartbeat] Client dead, terminating.');
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 5000);

wss.on('close', function close() {
    clearInterval(interval);
});

// WebSocket Handler
wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`[WebSocket] New Connection from: ${ip}`);
    
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // In a single-port setup, regular browser clients might try to connect via WS too.
    // We assume the ESP is the one sending "STATUS" messages.
    // You could add a simple auth check here if needed.
    espSocket = ws;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            if (data.type === 'STATUS') {
                if (data.r1 !== deviceStatus.r1) {
                    deviceStatus.r1 = data.r1;
                    deviceStatus.r1Start = data.r1 ? Date.now() : null;
                }
                if (data.r2 !== deviceStatus.r2) {
                    deviceStatus.r2 = data.r2;
                    deviceStatus.r2Start = data.r2 ? Date.now() : null;
                }
                console.log(`[Sync] Relay State: R1=${data.r1}, R2=${data.r2}`);
            }
        } catch (e) { console.error(`[Error] Bad JSON from ESP`); }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Device Disconnected');
        if (espSocket === ws) espSocket = null;
    });
});

// ==========================================
//  API ROUTES
// ==========================================

// 1. Sensor Routes
app.use('/api', sensorRoutes);

// 2. Relay Control Routes
app.get('/api/status', (req, res) => {
    if (!espSocket) {
        return res.status(200).json({ online: false, data: deviceStatus });
    }
    res.json({ online: true, data: deviceStatus });
});

app.get('/api/relay/:id/:action', (req, res) => {
    const { id, action } = req.params;

    if (!espSocket) return res.status(503).json({ error: "Device Offline" });

    const state = action === 'on';
    const command = { type: 'COMMAND', relay: parseInt(id), state: state };

    try {
        espSocket.send(JSON.stringify(command));
        
        // Optimistic Update
        if (id === '1') {
            deviceStatus.r1 = state;
            deviceStatus.r1Start = state ? Date.now() : null;
        }
        if (id === '2') {
            deviceStatus.r2 = state;
            deviceStatus.r2Start = state ? Date.now() : null;
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Transmission Failed" });
    }
});

// Basic Test Route
app.get('/', (req, res) => {
    res.send('PowerSense Unified Backend is running!');
});

// ==========================================
//  START SERVER
// ==========================================
server.listen(PORT, () => {
    console.log(`PowerSense Backend running on port ${PORT}`);
});
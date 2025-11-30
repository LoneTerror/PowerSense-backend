// backend/server.js

const express = require('express');
const cors = require('cors');
const http = require('http');           
const WebSocket = require('ws');        
require('dotenv').config();

const sensorRoutes = require('./routes/sensor'); 

const app = express();
const PORT = process.env.PORT || 5003; 

// ==========================================
//  CORS CONFIGURATION
// ==========================================
app.use(cors({
    origin: true, 
    credentials: true 
}));

app.use(express.json()); 
app.use(express.static('public')); 

app.use((req, res, next) => {
    const origin = req.headers.origin || req.headers.host || 'Unknown';
    console.log(`[Req] ${req.method} ${req.url} | Origin: ${origin}`);
    next();
});

// ==========================================
//  SERVER SETUP
// ==========================================
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ==========================================
//  WEBSOCKET & RELAY LOGIC
// ==========================================

let espSocket = null; 
let deviceStatus = { 
    r1: false, 
    r2: false,
    r1Start: null,
    r2Start: null
};

// --- BROADCAST FUNCTION (New) ---
// Sends the latest status to all connected web/react clients
function broadcastStatus() {
    const payload = JSON.stringify({
        type: 'STATUS_UPDATE',
        data: deviceStatus
    });

    wss.clients.forEach(client => {
        // Don't send to the ESP itself, only to browsers/apps
        if (client !== espSocket && client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Heartbeat System
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        if (ws.isAlive === false) return ws.terminate();
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

    // Identify if this is the ESP8266 or a Web Client
    // Simple heuristic: ESP usually doesn't send browser headers, or you can add a protocol check
    // For now, we assume the first message identifies it, or we treat the one sending 'STATUS' updates as ESP.
    
    // Send current status immediately to new web clients
    ws.send(JSON.stringify({ type: 'STATUS_UPDATE', data: deviceStatus }));

    ws.on('message', (message) => {
        try {
            const msgStr = message.toString();
            // console.log(`[WS Msg] ${msgStr}`);
            const data = JSON.parse(msgStr);

            // 1. If message is from ESP (Status Report)
            if (data.type === 'STATUS') {
                espSocket = ws; // Register this connection as the ESP
                
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
                
                // If ESP reports a change, tell React Frontend!
                if (changed) broadcastStatus();
            }
        } catch (e) { console.error(`[Error] Bad JSON or Logic: ${e.message}`); }
    });

    ws.on('close', () => {
        if (espSocket === ws) {
            console.log('[WebSocket] ESP8266 Disconnected');
            espSocket = null;
        }
    });
});

// ==========================================
//  API ROUTES
// ==========================================

app.use('/api', sensorRoutes);

// 2. Legacy Relay Status
app.get('/api/status', (req, res) => {
    // Return status even if ESP is offline, so UI doesn't break
    res.json({ online: !!espSocket, data: deviceStatus });
});

// 3. Legacy Web Control (GET)
app.get('/api/relay/:id/:action', (req, res) => {
    const { id, action } = req.params;
    handleRelayCommand(id, action === 'on', res);
});

// 4. ANDROID APP COMPATIBILITY (POST)
app.post('/api/relays/:id/toggle', (req, res) => {
    const { id } = req.params;
    const { state } = req.body; 

    if (typeof state !== 'boolean') {
        return res.status(400).json({ error: "Invalid body. Expected { state: boolean }" });
    }
    
    handleRelayCommand(id, state, res);
});

// --- Central Command Handler ---
function handleRelayCommand(id, state, res) {
    if (!espSocket) return res.status(503).json({ error: "Device Offline" });

    let targetRelay = parseInt(id); 
    if (isNaN(targetRelay)) {
        console.warn(`[API] Warning: Received non-numeric Relay ID: ${id}`);
        // If your React app uses strings like "light1", map them here
    }

    const command = { type: 'COMMAND', relay: targetRelay, state: state };

    try {
        espSocket.send(JSON.stringify(command));
        
        // Optimistic Update
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

        // Notify React Frontend of the change triggered by Android/API
        if (changed) broadcastStatus();

        res.json({ success: true, newState: state });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Transmission Failed" });
    }
}

app.get('/', (req, res) => {
    res.send('PowerSense Unified Backend is Online!');
});

server.listen(PORT, () => {
    console.log(`PowerSense Backend running on port ${PORT}`);
});
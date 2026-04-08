const express = require('express');
const sensorController = require('../controllers/sensorController'); 
const router = express.Router();

// ==========================================
// RELAY CONFIGURATION (Dynamic)
// ==========================================

// GET /api/relays/config - Get detailed metadata for all relays
router.get('/relays/config', async (req, res) => {
    try {
        const data = await sensorController.getRelayConfig();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch relay configuration" });
    }
});

// POST /api/relays/:id/config - Update names/descriptions from App/Web
router.post('/relays/:id/config', async (req, res) => {
    const { name, description } = req.body;
    const { id } = req.params;
    
    if (!name) return res.status(400).json({ error: "Name is required" });

    try {
        await sensorController.updateRelayConfig(id, name, description);
        res.json({ success: true, message: `Relay ${id} updated` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==========================================
// SENSOR DATA & ANALYTICS
// ==========================================

// GET /api/sensor-data - Web Dashboard History
router.get('/sensor-data', async (req, res) => {
    const intervalHours = parseInt(req.query.interval || '24', 10);
    try {
        const data = await sensorController.getSensorData(intervalHours);
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/avg-power-consumption - Specific time-window calculation
router.get('/avg-power-consumption', async (req, res) => {
    const periodMinutes = parseInt(req.query.period, 10);
    if (isNaN(periodMinutes)) return res.status(400).json({ error: "Invalid period" });

    try {
        const avgPower = await sensorController.getSpecificAveragePower(periodMinutes);
        res.json({ avgPower }); 
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ==========================================
// ANDROID SPECIFIC ENDPOINTS
// ==========================================

// GET /api/sensors/latest - Real-time metrics for Android Home Screen
router.get('/sensors/latest', async (req, res) => {
    try {
        const data = await sensorController.getLatestSensorDataForAndroid();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch android sensor data" });
    }
});

// GET /api/relay-usage - Usage hours for Android Pie Chart
router.get('/relay-usage', async (req, res) => {
    const interval = parseInt(req.query.interval || '24', 10);
    try {
        const usageData = await sensorController.getRelayUsageStats(interval);
        res.json(usageData);
    } catch (error) {
        res.status(500).json({ error: "Failed to calculate relay usage" });
    }
});

// GET /api/relays - Unified list of relays with current config
router.get('/relays', async (req, res) => {
    try {
        const config = await sensorController.getRelayConfig();
        // Map DB results to the format the UI expects
        const formatted = config.map(r => ({
            id: r.id.toString(),
            name: r.name,
            description: r.description,
            isOn: false // State is usually handled via MQTT/WebSockets, not DB config
        }));
        res.json(formatted);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch relays" });
    }
});

module.exports = router;
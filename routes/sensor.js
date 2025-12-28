// backend/routes/sensor.js
const express = require('express');
const sensorController = require('../controllers/sensorController'); 
const router = express.Router();

// NEW: Get Relay Names
router.get('/relays/config', async (req, res) => {
    const data = await sensorController.getRelayConfig();
    res.json(data);
});

// NEW: Update Relay Name (Called by Android App)
router.post('/relays/:id/config', async (req, res) => {
    const { name, description } = req.body;
    await sensorController.updateRelayConfig(req.params.id, name, description);
    res.json({ success: true });
});

// GET /api/sensor-data (Web Dashboard)
router.get('/sensor-data', async (req, res) => {
  const intervalHours = parseInt(req.query.interval || '24', 10);
  try {
    const data = await sensorController.getSensorData(intervalHours);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/avg-power-consumption
router.get('/avg-power-consumption', async (req, res) => {
  const periodMinutes = parseInt(req.query.period, 10);
  try {
    const avgPower = await sensorController.getSpecificAveragePower(periodMinutes);
    res.json({ avgPower: avgPower }); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET /api/sensors/latest (Android App)
router.get('/sensors/latest', async (req, res) => {
    try {
        const data = await sensorController.getLatestSensorDataForAndroid();
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch android sensor data" });
    }
});

// NEW: GET /api/relay-usage (For Android Pie Chart)
router.get('/relay-usage', async (req, res) => {
    const interval = parseInt(req.query.interval || '24', 10);
    try {
        const usageData = await sensorController.getRelayUsageStats(interval);
        res.json(usageData);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch relay usage" });
    }
});

// GET /api/relays (Fallback/Metadata)
router.get('/relays', (req, res) => {
    res.json([
        { id: "1", name: "Living Room", description: "Main Light", isOn: false },
        { id: "2", name: "Bedroom", description: "Fan", isOn: false }
    ]);
});

module.exports = router;
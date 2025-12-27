// backend/routes/sensor.js
const express = require('express');
const sensorController = require('../controllers/sensorController'); 
const router = express.Router();

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

// GET /api/relays (Fallback for Android)
router.get('/relays', (req, res) => {
    res.json([
        { id: "1", name: "Living Room", description: "Main Light", isOn: false },
        { id: "2", name: "Bedroom", description: "Fan", isOn: false }
    ]);
});

module.exports = router;
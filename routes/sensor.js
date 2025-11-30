// backend/routes/sensor.js

const express = require('express');
const sensorController = require('../controllers/sensorController'); 
const router = express.Router();

// GET /api/sensor-data (Web Dashboard)
router.get('/sensor-data', async (req, res) => {
  const intervalHours = parseInt(req.query.interval || '24', 10);
  if (isNaN(intervalHours) || intervalHours <= 0) {
    return res.status(400).json({ message: 'Invalid interval parameter.' });
  }
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
  if (isNaN(periodMinutes) || periodMinutes <= 0) {
    return res.status(400).json({ message: 'Invalid period parameter.' });
  }
  try {
    const avgPower = await sensorController.getSpecificAveragePower(periodMinutes);
    res.json({ avgPower: avgPower }); 
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// --- NEW ROUTE FOR ANDROID APP ---
// GET /api/sensors/latest
// Matches PowerSenseClient: client.get("$BASE_URL/api/sensors/latest")
router.get('/sensors/latest', async (req, res) => {
    try {
        const data = await sensorController.getLatestSensorDataForAndroid();
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch android sensor data" });
    }
});

// --- NEW ROUTE FOR RELAY LIST (Optional) ---
// Matches PowerSenseClient: client.get("$BASE_URL/api/relays")
// Since Android defines switches in Firestore, this just returns an empty list or the hardwired ones to prevent 404 errors.
router.get('/relays', (req, res) => {
    // We return the hardwired configuration so the client doesn't error out.
    // The Android app mostly relies on Firestore for the list, so this is a fallback.
    res.json([
        { id: "1", name: "Living Room", description: "Main Light", isOn: false },
        { id: "2", name: "Bedroom", description: "Fan", isOn: false }
    ]);
});

module.exports = router;
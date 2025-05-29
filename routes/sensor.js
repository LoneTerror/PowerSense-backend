// backend/routes/sensor.js

const express = require('express');
const sensorController = require('../controllers/sensorController'); // Import the controller
const router = express.Router();

// GET /api/sensor-data (EXISTING ROUTE - NO CHANGES HERE)
// Fetches the latest and historical sensor data.
// Query parameter: interval (optional, default: 24 hours)
router.get('/sensor-data', async (req, res) => {
  const intervalHours = parseInt(req.query.interval || '24', 10); // Default to 24 hours if not provided

  // Validate intervalHours if necessary
  if (isNaN(intervalHours) || intervalHours <= 0) {
    return res.status(400).json({ message: 'Invalid interval parameter. Must be a positive number.' });
  }

  try {
    const data = await sensorController.getSensorData(intervalHours);
    res.json(data);
  } catch (error) {
    // Error is already logged in controller, just send a generic server error response
    res.status(500).json({ message: error.message || 'Internal server error while fetching sensor data.' });
  }
});

// --- NEW ROUTE FOR SPECIFIC AVERAGE POWER CONSUMPTION ---
// GET /api/avg-power-consumption
// Fetches the average instantaneous power consumption over a specified period in minutes.
// Query parameter: period (required, e.g., 1, 5, 10, 30)
router.get('/avg-power-consumption', async (req, res) => {
  const periodMinutes = parseInt(req.query.period, 10);

  // Validate periodMinutes
  if (isNaN(periodMinutes) || periodMinutes <= 0) {
    return res.status(400).json({ message: 'Invalid period parameter. Must be a positive number.' });
  }

  try {
    const avgPower = await sensorController.getSpecificAveragePower(periodMinutes);
    res.json({ avgPower: avgPower }); // Return as an object for clarity
  } catch (error) {
    console.error('Error in /api/avg-power-consumption route:', error);
    res.status(500).json({ message: error.message || 'Internal server error while fetching average power.' });
  }
});

module.exports = router;
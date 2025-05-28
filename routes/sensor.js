// backend/routes/sensor.js

const express = require('express');
const sensorController = require('../controllers/sensorController'); // Import the controller
const router = express.Router();

// GET /api/sensor-data
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

module.exports = router;
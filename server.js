// backend/server.js

const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env file

const sensorRoutes = require('./routes/sensor'); // Import your sensor routes

const app = express();
const PORT = process.env.PORT || 5000; // Use port from .env or default to 5000

// Middleware
app.use(cors()); // Enable CORS for all routes (adjust origins in production for security)
app.use(express.json()); // Parse JSON request bodies

// Routes
app.use('/api', sensorRoutes); // Mount sensor routes under the /api path

// Basic route for testing server status
app.get('/', (req, res) => {
  res.send('PowerSense Backend API is running!');
});

// Start the server
app.listen(PORT, () => {
  console.log(`PowerSense Backend server running on port ${PORT}`);
  console.log(`Access at: http://localhost:${PORT}`);
});
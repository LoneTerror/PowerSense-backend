// backend/controllers/sensorController.js

const pool = require('../config/db'); // Import the PostgreSQL connection pool

/**
 * Fetches the latest sensor data and historical data from the database.
 * @param {number} intervalHours - The number of hours for historical data.
 * @returns {Promise<object>} An object containing current metrics and historical data arrays.
 */
exports.getSensorData = async (intervalHours) => {
  try {
    // 1. Fetch the latest sensor data (most recent entry)
    const latestDataQuery = `
      SELECT
        current_val AS current,
        avg_current_val AS "avgCurrent",
        voltage_val AS voltage,
        inst_power_val AS "instPower",
        avg_power_val AS "avgPower"
      FROM sensor_data
      ORDER BY timestamp DESC
      LIMIT 1;
    `;
    const latestResult = await pool.query(latestDataQuery);
    const latestMetrics = latestResult.rows[0] || {}; // Handle case where no data exists

    // 2. Fetch historical data for the specified interval
    // Adjust the WHERE clause to fetch data within the last 'intervalHours'
    // Ensure the timestamp is formatted as an ISO string for consistency with frontend
    const historicalQueryBase = (column) => `
      SELECT
        timestamp,
        ${column} AS value
      FROM sensor_data
      WHERE timestamp >= NOW() - INTERVAL '${intervalHours} hours'
      ORDER BY timestamp ASC;
    `;

    const [
      currentHistoryResult,
      avgCurrentHistoryResult,
      voltageHistoryResult,
      powerHistoryResult
    ] = await Promise.all([
      pool.query(historicalQueryBase('current_val')),
      pool.query(historicalQueryBase('avg_current_val')),
      pool.query(historicalQueryBase('voltage_val')),
      pool.query(historicalQueryBase('inst_power_val')) // Assuming 'powerHistory' uses inst_power_val
    ]);

    // Helper to format history rows
    const formatHistory = (rows) => rows.map(row => ({
      timestamp: new Date(row.timestamp).toISOString(),
      value: parseFloat(row.value) // Ensure value is a number
    }));

    const responseData = {
      ...latestMetrics,
      currentHistory: formatHistory(currentHistoryResult.rows),
      avgCurrentHistory: formatHistory(avgCurrentHistoryResult.rows),
      voltageHistory: formatHistory(voltageHistoryResult.rows),
      powerHistory: formatHistory(powerHistoryResult.rows),
    };

    return responseData;

  } catch (error) {
    console.error('Error fetching sensor data from database:', error);
    throw new Error('Failed to retrieve sensor data.'); // Propagate error for route handler
  }
};
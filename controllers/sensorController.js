// backend/controllers/sensorController.js

const pool = require('../config/db'); 

/**
 * Fetches the latest sensor data and historical data from the database.
 * (EXISTING FUNCTION)
 */
exports.getSensorData = async (intervalHours) => {
  // ... (Keep existing code for getSensorData logic same as before) ...
    try {
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
    const latestMetrics = latestResult.rows[0] || {}; 

    const historicalQueryBase = (column) => `
      SELECT timestamp, ${column} AS value
      FROM sensor_data
      WHERE timestamp >= NOW() - INTERVAL '${intervalHours} hours'
      ORDER BY timestamp ASC;
    `;

    const [
      currentHistory, avgCurrentHistory, voltageHistory, powerHistory
    ] = await Promise.all([
      pool.query(historicalQueryBase('current_val')),
      pool.query(historicalQueryBase('avg_current_val')),
      pool.query(historicalQueryBase('voltage_val')),
      pool.query(historicalQueryBase('inst_power_val'))
    ]);

    const formatHistory = (rows) => rows.map(r => ({
      timestamp: new Date(r.timestamp).toISOString(),
      value: parseFloat(r.value)
    }));

    return {
      ...latestMetrics,
      currentHistory: formatHistory(currentHistory.rows),
      avgCurrentHistory: formatHistory(avgCurrentHistory.rows),
      voltageHistory: formatHistory(voltageHistory.rows),
      powerHistory: formatHistory(powerHistory.rows),
    };

  } catch (error) {
    console.error('Error fetching sensor data:', error);
    throw new Error('Failed to retrieve sensor data.');
  }
};

/**
 * (EXISTING FUNCTION)
 */
exports.getSpecificAveragePower = async (periodMinutes) => {
  try {
    const avgPowerQuery = `
      SELECT AVG(inst_power_val) AS average_power
      FROM sensor_data
      WHERE timestamp >= NOW() - INTERVAL '${periodMinutes} minutes';
    `;
    const result = await pool.query(avgPowerQuery);
    return parseFloat(result.rows[0]?.average_power || '0');
  } catch (error) {
    console.error(`Error fetching average power:`, error);
    throw new Error('Failed to retrieve specific average power data.');
  }
};

// --- NEW FUNCTION FOR ANDROID APP ---
/**
 * Fetches latest data specifically formatted for the Android App's "SensorData" class.
 * Android Expects: { voltage, current, power, energy, timestamp }
 */
exports.getLatestSensorDataForAndroid = async () => {
    try {
        const query = `
            SELECT
                voltage_val,
                current_val,
                inst_power_val,
                avg_power_val, 
                timestamp
            FROM sensor_data
            ORDER BY timestamp DESC
            LIMIT 1;
        `;
        const result = await pool.query(query);
        const row = result.rows[0];

        if (!row) {
            return { voltage: 0.0, current: 0.0, power: 0.0, energy: 0.0, timestamp: "" };
        }

        return {
            voltage: parseFloat(row.voltage_val),
            current: parseFloat(row.current_val),
            power: parseFloat(row.inst_power_val),
            // Mapping 'avg_power_val' to 'energy' as a placeholder, or you can calculate kWh if available
            energy: parseFloat(row.avg_power_val), 
            timestamp: new Date(row.timestamp).toISOString()
        };
    } catch (error) {
        console.error('Error fetching android sensor data:', error);
        throw error;
    }
};
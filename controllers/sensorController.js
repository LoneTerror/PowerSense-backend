// backend/controllers/sensorController.js
const { sqlite, neon } = require('../config/db'); 

// ==========================================
// WRITE OPERATIONS (SQLite Only)
// ==========================================

exports.saveSensorData = async (data) => {
  try {
    const query = `
      INSERT INTO sensor_data 
      (voltage_val, current_val, inst_power_val, avg_current_val, avg_power_val)
      VALUES (?, ?, ?, ?, ?)
    `;
    const values = [data.voltage, data.current, data.power, data.avg_current, data.avg_power];
    
    await sqlite(query, values);
    
  } catch (error) {
    console.error('Error saving to SQLite:', error.message);
  }
};

exports.logRelayActivity = async (relayId, state, source = 'User') => {
  try {
    let tableName = (relayId == 1) ? 'relay1_log' : (relayId == 2) ? 'relay2_log' : null;
    if (!tableName) return;

    const query = `INSERT INTO ${tableName} (state, action_by) VALUES (?, ?)`;
    await sqlite(query, [state ? 1 : 0, source]);
    // console.log(`Logged relay ${relayId} to SQLite`);

  } catch (error) {
    console.error(`Error logging relay ${relayId}:`, error.message);
  }
};

// ==========================================
// READ OPERATIONS (SQLite - "Store & Fetch")
// ==========================================

exports.getSensorData = async (intervalHours) => {
  try {
    // 1. Fetch Latest
    const latestQ = `
      SELECT current_val AS current, avg_current_val AS "avgCurrent",
             voltage_val AS voltage, inst_power_val AS "instPower", avg_power_val AS "avgPower"
      FROM sensor_data ORDER BY timestamp DESC LIMIT 1
    `;
    const latestRes = await sqlite(latestQ);
    const latestMetrics = latestRes.rows[0] || {}; 

    // 2. Fetch History (SQLite Syntax: datetime)
    const histQ = (col) => `
      SELECT timestamp, ${col} AS value FROM sensor_data
      WHERE timestamp >= datetime('now', '-${intervalHours} hours')
      ORDER BY timestamp ASC
    `;

    const [curH, avgCurH, voltH, powH] = await Promise.all([
      sqlite(histQ('current_val')),
      sqlite(histQ('avg_current_val')),
      sqlite(histQ('voltage_val')),
      sqlite(histQ('inst_power_val'))
    ]);

    const format = (rows) => rows.map(r => ({
      timestamp: new Date(r.timestamp).toISOString(),
      value: parseFloat(r.value)
    }));

    return {
      ...latestMetrics,
      currentHistory: format(curH.rows),
      avgCurrentHistory: format(avgCurH.rows),
      voltageHistory: format(voltH.rows),
      powerHistory: format(powH.rows),
    };
  } catch (error) {
    console.error('SQLite Fetch Error:', error);
    throw new Error('Failed to retrieve sensor data.');
  }
};

exports.getSpecificAveragePower = async (periodMinutes) => {
  try {
    const avgPowerQuery = `
      SELECT AVG(inst_power_val) AS average_power
      FROM sensor_data
      WHERE timestamp >= datetime('now', '-${periodMinutes} minutes');
    `;
    const result = await sqlite(avgPowerQuery);
    return parseFloat(result.rows[0]?.average_power || '0');
  } catch (error) {
    console.error(`Error fetching avg power:`, error);
    throw new Error('Failed to retrieve specific average power data.');
  }
};

// --- ANDROID API (Fixed to use SQLite) ---
exports.getLatestSensorDataForAndroid = async () => {
    try {
        const query = `
            SELECT voltage_val, current_val, inst_power_val, avg_power_val, timestamp
            FROM sensor_data ORDER BY timestamp DESC LIMIT 1
        `;
        
        // Use 'sqlite' here to avoid ETIMEDOUT errors
        const result = await sqlite(query);
        const row = result.rows[0];

        if (!row) return { voltage: 0.0, current: 0.0, power: 0.0, energy: 0.0, timestamp: "" };

        return {
            voltage: parseFloat(row.voltage_val),
            current: parseFloat(row.current_val),
            power: parseFloat(row.inst_power_val),
            energy: parseFloat(row.avg_power_val), 
            timestamp: new Date(row.timestamp).toISOString()
        };
    } catch (error) {
        console.error("Android Fetch Error:", error.message);
        throw error;
    }
};
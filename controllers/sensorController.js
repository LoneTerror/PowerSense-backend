// backend/controllers/sensorController.js
const { sqlite, neon } = require('../config/db'); 

// ==========================================
// WRITE OPERATIONS (SQLite Only)
// ==========================================

exports.saveSensorData = async (data) => {
  try {
    // 1. FILTER: Keep it within 6000 Watts
    if (data.power > 6000) {
        console.warn('⚠️ Ignored unrealistic power reading (> 6000W):', data.power);
        return; 
    }

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
    // 2. SEPARATE TABLES: Mapping logic
    let tableName = (relayId == 1) ? 'relay1_log' : (relayId == 2) ? 'relay2_log' : null;
    if (!tableName) return;

    const query = `INSERT INTO ${tableName} (state, action_by) VALUES (?, ?)`;
    await sqlite(query, [state ? 1 : 0, source]);
  } catch (error) {
    console.error(`Error logging relay ${relayId}:`, error.message);
  }
};

// ==========================================
// READ OPERATIONS (SQLite)
// ==========================================

exports.getSensorData = async (intervalHours) => {
  try {
    // Fetch Latest
    const latestQ = `
      SELECT current_val AS current, avg_current_val AS "avgCurrent",
             voltage_val AS voltage, inst_power_val AS "instPower", avg_power_val AS "avgPower"
      FROM sensor_data ORDER BY timestamp DESC LIMIT 1
    `;
    const latestRes = await sqlite(latestQ);
    const latestMetrics = latestRes.rows[0] || {};

    // Fetch History with 6000W Limit
    const histQ = (col, maxVal) => `
      SELECT timestamp, ${col} AS value FROM sensor_data
      WHERE timestamp >= datetime('now', '-${intervalHours} hours')
      AND ${col} < ${maxVal} 
      ORDER BY timestamp ASC
    `;

    const [curH, avgCurH, voltH, powH] = await Promise.all([
      sqlite(histQ('current_val', 100)),       
      sqlite(histQ('avg_current_val', 100)),   
      sqlite(histQ('voltage_val', 500)),       
      sqlite(histQ('inst_power_val', 6000))    // <--- Limit set to 6000W
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
      WHERE timestamp >= datetime('now', '-${periodMinutes} minutes')
      AND inst_power_val < 6000; 
    `;
    const result = await sqlite(avgPowerQuery);
    return parseFloat(result.rows[0]?.average_power || '0');
  } catch (error) {
    console.error(`Error fetching avg power:`, error);
    throw new Error('Failed to retrieve specific average power data.');
  }
};

// --- NEW: Manage Relay Names ---
exports.updateRelayConfig = async (id, name, description) => {
    try {
        // Check if exists
        const check = await sqlite("SELECT id FROM relay_config WHERE id = ?", [id]);
        if (check.rows.length > 0) {
            await sqlite("UPDATE relay_config SET name = ?, description = ? WHERE id = ?", [name, description, id]);
        } else {
            await sqlite("INSERT INTO relay_config (id, name, description) VALUES (?, ?, ?)", [id, name, description]);
        }
        console.log(`✅ Updated Relay ${id} name to: ${name}`);
    } catch (e) {
        console.error("Failed to update relay config:", e.message);
    }
};

exports.getRelayConfig = async () => {
    try {
        const result = await sqlite("SELECT * FROM relay_config ORDER BY id ASC");
        return result.rows;
    } catch (e) {
        return [];
    }
};

exports.getLatestSensorDataForAndroid = async () => {
    try {
        const query = `
            SELECT voltage_val, current_val, inst_power_val, avg_power_val, timestamp
            FROM sensor_data ORDER BY timestamp DESC LIMIT 1
        `;
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

// --- NEW: Calculate Relay On-Time for Pie Chart ---
exports.getRelayUsageStats = async (intervalHours = 24) => {
    try {
        // Helper to calculate hours from logs
        const calcDuration = async (tableName) => {
            const query = `
                SELECT state, timestamp FROM ${tableName}
                WHERE timestamp >= datetime('now', '-${intervalHours} hours')
                ORDER BY timestamp ASC
            `;
            const result = await sqlite(query);
            const logs = result.rows;

            let totalMilliseconds = 0;
            let lastOnTime = null;

            // If no logs but relay might be ON, we assume OFF for safety unless persisted state exists
            // Simple logic: Sum duration between ON and subsequent OFF
            
            for (const log of logs) {
                const time = new Date(log.timestamp).getTime();
                if (log.state === 1) {
                    // Switch turned ON
                    lastOnTime = time;
                } else if (log.state === 0 && lastOnTime !== null) {
                    // Switch turned OFF
                    totalMilliseconds += (time - lastOnTime);
                    lastOnTime = null;
                }
            }

            // If still ON at the end (current time)
            if (lastOnTime !== null) {
                totalMilliseconds += (Date.now() - lastOnTime);
            }

            // Convert to Hours
            return parseFloat((totalMilliseconds / (1000 * 60 * 60)).toFixed(2));
        };

        const [r1Hours, r2Hours] = await Promise.all([
            calcDuration('relay1_log'),
            calcDuration('relay2_log')
        ]);

        return {
            relay1: r1Hours,
            relay2: r2Hours
        };

    } catch (error) {
        console.error("Relay Usage Stats Error:", error.message);
        return { relay1: 0, relay2: 0 };
    }
};
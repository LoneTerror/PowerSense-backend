const db = require('../config/db');

// Helper to handle Date/Time differences between SQL dialects
const getIntervalSQL = (hours) => {
    const type = process.env.DB_TYPE?.toUpperCase() || 'SQLITE';
    if (type === 'SQLITE') return `datetime('now', '-${hours} hours')`;
    if (type === 'MYSQL') return `NOW() - INTERVAL ${hours} HOUR`;
    if (type === 'NEON') return `NOW() - INTERVAL '${hours} hours'`;
    return `datetime('now', '-${hours} hours')`;
};

// ==========================================
// WRITE OPERATIONS
// ==========================================

exports.saveSensorData = async (data) => {
    try {
        if (data.power > 6000) {
            console.warn('⚠️ Ignored unrealistic power reading:', data.power);
            return;
        }

        const sql = `
            INSERT INTO sensor_data 
            (voltage_val, current_val, inst_power_val, avg_current_val, avg_power_val)
            VALUES (?, ?, ?, ?, ?)
        `;
        const values = [data.voltage, data.current, data.power, data.avg_current, data.avg_power];
        
        await db.query(sql, values);
    } catch (error) {
        console.error('❌ Error saving sensor data:', error.message);
    }
};

exports.logRelayActivity = async (relayId, state, source = 'User') => {
    try {
        let tableName = (relayId == 1) ? 'relay1_log' : (relayId == 2) ? 'relay2_log' : null;
        if (!tableName) return;

        const sql = `INSERT INTO ${tableName} (state, action_by) VALUES (?, ?)`;
        await db.query(sql, [state ? 1 : 0, source]);
    } catch (error) {
        console.error(`❌ Error logging relay ${relayId}:`, error.message);
    }
};

// ==========================================
// READ OPERATIONS
// ==========================================

exports.getSensorData = async (intervalHours) => {
    try {
        const latestQ = `
            SELECT current_val AS current, avg_current_val AS "avgCurrent",
                   voltage_val AS voltage, inst_power_val AS "instPower", avg_power_val AS "avgPower"
            FROM sensor_data ORDER BY timestamp DESC LIMIT 1
        `;
        const latestRes = await db.query(latestQ);
        const latestMetrics = latestRes.rows[0] || {};

        const timeConstraint = getIntervalSQL(intervalHours);

        const fetchHistory = async (col, maxVal) => {
            const sql = `
                SELECT timestamp, ${col} AS value FROM sensor_data
                WHERE timestamp >= ${timeConstraint}
                AND ${col} < ${maxVal} 
                ORDER BY timestamp ASC
            `;
            const result = await db.query(sql);
            return result.rows.map(r => ({
                timestamp: new Date(r.timestamp).toISOString(),
                value: parseFloat(r.value)
            }));
        };

        const [currentHistory, avgCurrentHistory, voltageHistory, powerHistory] = await Promise.all([
            fetchHistory('current_val', 100),
            fetchHistory('avg_current_val', 100),
            fetchHistory('voltage_val', 500),
            fetchHistory('inst_power_val', 6000)
        ]);

        return {
            ...latestMetrics,
            currentHistory,
            avgCurrentHistory,
            voltageHistory,
            powerHistory,
        };
    } catch (error) {
        console.error('❌ Database Fetch Error:', error);
        throw new Error('Failed to retrieve sensor data.');
    }
};

exports.getSpecificAveragePower = async (periodMinutes) => {
    try {
        // Converting minutes to hours for our interval helper
        const hours = periodMinutes / 60;
        const timeConstraint = getIntervalSQL(hours);

        const sql = `
            SELECT AVG(inst_power_val) AS average_power
            FROM sensor_data
            WHERE timestamp >= ${timeConstraint}
            AND inst_power_val < 6000
        `;
        const result = await db.query(sql);
        return parseFloat(result.rows[0]?.average_power || '0');
    } catch (error) {
        console.error(`❌ Error fetching avg power:`, error);
        throw new Error('Failed to retrieve average power data.');
    }
};

exports.updateRelayConfig = async (id, name, description) => {
    try {
        const check = await db.query("SELECT id FROM relay_config WHERE id = ?", [id]);
        if (check.rows.length > 0) {
            await db.query("UPDATE relay_config SET name = ?, description = ? WHERE id = ?", [name, description, id]);
        } else {
            await db.query("INSERT INTO relay_config (id, name, description) VALUES (?, ?, ?)", [id, name, description]);
        }
        console.log(`✅ Updated Relay ${id} name to: ${name}`);
    } catch (e) {
        console.error("❌ Failed to update relay config:", e.message);
    }
};

exports.getRelayConfig = async () => {
    try {
        const result = await db.query("SELECT * FROM relay_config ORDER BY id ASC");
        return result.rows;
    } catch (e) {
        return [];
    }
};

exports.getLatestSensorDataForAndroid = async () => {
    try {
        const sql = `
            SELECT voltage_val, current_val, inst_power_val, avg_power_val, timestamp
            FROM sensor_data ORDER BY timestamp DESC LIMIT 1
        `;
        const result = await db.query(sql);
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
        console.error("❌ Android Fetch Error:", error.message);
        throw error;
    }
};

exports.getRelayUsageStats = async (intervalHours = 24) => {
    try {
        const timeConstraint = getIntervalSQL(intervalHours);

        const calcDuration = async (tableName) => {
            const sql = `
                SELECT state, timestamp FROM ${tableName}
                WHERE timestamp >= ${timeConstraint}
                ORDER BY timestamp ASC
            `;
            const result = await db.query(sql);
            const logs = result.rows;

            let totalMilliseconds = 0;
            let lastOnTime = null;

            for (const log of logs) {
                const time = new Date(log.timestamp).getTime();
                if (log.state === 1) {
                    lastOnTime = time;
                } else if (log.state === 0 && lastOnTime !== null) {
                    totalMilliseconds += (time - lastOnTime);
                    lastOnTime = null;
                }
            }

            if (lastOnTime !== null) {
                totalMilliseconds += (Date.now() - lastOnTime);
            }

            return parseFloat((totalMilliseconds / (1000 * 60 * 60)).toFixed(2));
        };

        const [r1Hours, r2Hours] = await Promise.all([
            calcDuration('relay1_log'),
            calcDuration('relay2_log')
        ]);

        return { relay1: r1Hours, relay2: r2Hours };
    } catch (error) {
        console.error("❌ Relay Usage Stats Error:", error.message);
        return { relay1: 0, relay2: 0 };
    }
};
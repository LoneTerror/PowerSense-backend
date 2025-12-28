// backend/config/db.js
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Pool } = require('pg');

// 1. SQLITE CONNECTION
const dbPath = path.resolve(__dirname, '../powersense.db');
const localDb = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('❌ Error opening SQLite:', err.message);
  else {
    console.log('✅ Connected to SQLite (Local).');
    initSqlite();
  }
});

// Auto-create SQLite tables
function initSqlite() {
  localDb.serialize(() => {
    // Sensor Table
    localDb.run(`CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voltage_val REAL, current_val REAL, inst_power_val REAL, 
      avg_current_val REAL, avg_power_val REAL, 
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Relay Logs
    localDb.run(`CREATE TABLE IF NOT EXISTS relay1_log (id INTEGER PRIMARY KEY AUTOINCREMENT, state INTEGER, action_by TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    localDb.run(`CREATE TABLE IF NOT EXISTS relay2_log (id INTEGER PRIMARY KEY AUTOINCREMENT, state INTEGER, action_by TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // --- NEW: Relay Configuration Table (Stores Names) ---
    localDb.run(`CREATE TABLE IF NOT EXISTS relay_config (
      id INTEGER PRIMARY KEY,
      name TEXT,
      description TEXT
    )`);

    // Insert Default Names if table is empty
    localDb.get("SELECT count(*) as count FROM relay_config", (err, row) => {
        if (row && row.count === 0) {
            const stmt = localDb.prepare("INSERT INTO relay_config (id, name, description) VALUES (?, ?, ?)");
            stmt.run(1, 'Relay 1', 'Main Output');
            stmt.run(2, 'Relay 2', 'Secondary Output');
            stmt.finalize();
            console.log("✅ Initialized default relay names.");
        }
    });
  });
}

// SQLite Query Wrapper
const querySQLite = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      localDb.all(sql, params, (err, rows) => {
        if (err) reject(err); else resolve({ rows: rows });
      });
    } else {
      localDb.run(sql, params, function (err) {
        if (err) reject(err); else resolve({ rows: [], lastID: this.lastID });
      });
    }
  });
};

// 2. NEON CONNECTION (Optional)
const neonPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
neonPool.connect().then(c => { c.release(); }).catch(e => console.error('⚠️ Neon Disabled:', e.message));

module.exports = { sqlite: querySQLite, neon: (t, p) => neonPool.query(t, p) };
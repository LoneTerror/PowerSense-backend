// backend/config/db.js
require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Pool } = require('pg');

// ==========================================
// 1. SQLITE CONNECTION (Local - Primary)
// ==========================================
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
      voltage_val REAL,
      current_val REAL,
      inst_power_val REAL,
      avg_current_val REAL,
      avg_power_val REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Relay Logs
    localDb.run(`CREATE TABLE IF NOT EXISTS relay1_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, state INTEGER, action_by TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    localDb.run(`CREATE TABLE IF NOT EXISTS relay2_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, state INTEGER, action_by TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });
}

// SQLite Query Wrapper (Promisified)
const querySQLite = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (sql.trim().toUpperCase().startsWith('SELECT')) {
      localDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve({ rows: rows });
      });
    } else {
      localDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ rows: [], lastID: this.lastID });
      });
    }
  });
};

// ==========================================
// 2. NEON CONNECTION (Cloud - Optional/Parallel)
// ==========================================
const neonPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Test Neon Connection silently (don't crash if it fails)
neonPool.connect().then(client => {
  console.log('✅ Connected to Neon (Cloud).');
  client.release();
}).catch(err => console.error('⚠️ Neon Connection Failed (Cloud features disabled):', err.message));

// Neon Query Wrapper
const queryNeon = (text, params) => neonPool.query(text, params);

// Export both
module.exports = { 
  sqlite: querySQLite, 
  neon: queryNeon 
};
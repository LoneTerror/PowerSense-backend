require('dotenv').config();
const path = require('path');

// Determine which database to use from .env
const DB_TYPE = process.env.DB_TYPE ? process.env.DB_TYPE.toUpperCase() : 'SQLITE';

let pool;
let query;

// --- 1. DRIVER INITIALIZATION ---

switch (DB_TYPE) {
    case 'NEON':
        const { Pool } = require('pg');
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        // PostgreSQL returns results in a .rows property
        query = (text, params) => pool.query(text, params);
        console.log('🚀 DB: Connected to Neon (PostgreSQL)');
        break;

    case 'MYSQL':
        const mysql = require('mysql2/promise');
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE
        });
        // Wrap MySQL result to match the { rows: [] } format
        query = async (text, params) => {
            const [rows] = await pool.execute(text, params);
            return { rows };
        };
        console.log('🐬 DB: Connected to MySQL');
        break;

    case 'SQLITE':
    default:
        const sqlite3 = require('sqlite3').verbose();
        const dbPath = path.resolve(__dirname, process.env.SQLITE_PATH || '../powersense.db');
        const localDb = new sqlite3.Database(dbPath);
        console.log('📁 DB: Connected to SQLite Local');

        // SQLite query wrapper to handle both SELECT and RUN
        query = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                const isSelect = sql.trim().toUpperCase().startsWith('SELECT');
                if (isSelect) {
                    localDb.all(sql, params, (err, rows) => {
                        if (err) reject(err); else resolve({ rows });
                    });
                } else {
                    localDb.run(sql, params, function (err) {
                        if (err) reject(err); else resolve({ rows: [], lastID: this.lastID });
                    });
                }
            });
        };
        break;
}

// --- 2. SCHEMA INITIALIZATION ---

/**
 * Initializes tables if they don't exist and seeds default relay names.
 * This is designed to be idempotent (can run multiple times without error).
 */
async function initDB() {
    // Syntax adjustments for different SQL dialects
    const idType = DB_TYPE === 'NEON' ? 'SERIAL' : 'INTEGER';
    const autoInc = DB_TYPE === 'MYSQL' ? 'AUTO_INCREMENT' : (DB_TYPE === 'SQLITE' ? 'AUTOINCREMENT' : '');
    const tsDefault = DB_TYPE === 'SQLITE' ? "DATETIME DEFAULT CURRENT_TIMESTAMP" : "TIMESTAMP DEFAULT CURRENT_TIMESTAMP";

    const schema = [
        `CREATE TABLE IF NOT EXISTS sensor_data (
            id ${idType} PRIMARY KEY ${autoInc},
            voltage_val REAL, 
            current_val REAL, 
            inst_power_val REAL, 
            avg_current_val REAL, 
            avg_power_val REAL, 
            timestamp ${tsDefault}
        )`,
        `CREATE TABLE IF NOT EXISTS relay1_log (
            id ${idType} PRIMARY KEY ${autoInc}, 
            state INTEGER, 
            action_by TEXT, 
            timestamp ${tsDefault}
        )`,
        `CREATE TABLE IF NOT EXISTS relay2_log (
            id ${idType} PRIMARY KEY ${autoInc}, 
            state INTEGER, 
            action_by TEXT, 
            timestamp ${tsDefault}
        )`,
        `CREATE TABLE IF NOT EXISTS relay_config (
            id INTEGER PRIMARY KEY, 
            name TEXT, 
            description TEXT
        )`
    ];

    try {
        // Execute table creations
        for (const tableSql of schema) {
            await query(tableSql);
        }

        // Seed default relay configurations if they don't exist
        if (DB_TYPE === 'SQLITE') {
            await query("INSERT OR IGNORE INTO relay_config (id, name, description) VALUES (1, 'Relay 1', 'Main Output')");
            await query("INSERT OR IGNORE INTO relay_config (id, name, description) VALUES (2, 'Relay 2', 'Secondary Output')");
        } else {
            // Neon/Postgres & MySQL syntax for handling existing IDs
            const relay1 = "INSERT INTO relay_config (id, name, description) VALUES (1, 'Relay 1', 'Main Output')";
            const relay2 = "INSERT INTO relay_config (id, name, description) VALUES (2, 'Relay 2', 'Secondary Output')";
            
            const suffix = DB_TYPE === 'NEON' ? " ON CONFLICT (id) DO NOTHING" : " ON DUPLICATE KEY UPDATE id=id";
            await query(relay1 + suffix);
            await query(relay2 + suffix);
        }

        console.log(`✅ ${DB_TYPE} Schema verified.`);
    } catch (err) {
        console.error('❌ Schema Init Error:', err.message);
    }
}

// --- 3. EXPORTS ---

module.exports = {
    query,
    initDB
};
require('dotenv').config();
const path = require('path');

const DB_TYPE = process.env.DB_TYPE ? process.env.DB_TYPE.toUpperCase() : 'SQLITE';

let pool;
let query;

// --- DATABASE INITIALIZATION LOGIC ---

async function initDB() {
    const sensorTable = `
        CREATE TABLE IF NOT EXISTS sensor_data (
            id ${DB_TYPE === 'NEON' ? 'SERIAL' : 'INTEGER'} PRIMARY KEY ${DB_TYPE === 'MYSQL' ? 'AUTO_INCREMENT' : (DB_TYPE === 'SQLITE' ? 'AUTOINCREMENT' : '')},
            voltage_val REAL, 
            current_val REAL, 
            inst_power_val REAL, 
            avg_current_val REAL, 
            avg_power_val REAL, 
            timestamp DATETIME DEFAULT ${DB_TYPE === 'NEON' ? 'CURRENT_TIMESTAMP' : 'CURRENT_TIMESTAMP'}
        )`;

    // Run initialization for local/new DBs
    try {
        await query(sensorTable);
        // Add other table creations here...
        console.log(`✅ ${DB_TYPE} Schema verified/initialized.`);
    } catch (err) {
        console.error('❌ Schema Init Error:', err.message);
    }
}

// --- DRIVER SELECTION ---

switch (DB_TYPE) {
    case 'NEON':
        const { Pool } = require('pg');
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false }
        });
        query = (text, params) => pool.query(text, params);
        console.log('🚀 Connected to Neon (PostgreSQL)');
        break;

    case 'MYSQL':
        const mysql = require('mysql2/promise');
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST,
            user: process.env.MYSQL_USER,
            password: process.env.MYSQL_PASSWORD,
            database: process.env.MYSQL_DATABASE
        });
        query = async (text, params) => {
            const [rows] = await pool.execute(text, params);
            return { rows };
        };
        console.log('🐬 Connected to MySQL');
        break;

    case 'SQLITE':
    default:
        const sqlite3 = require('sqlite3').verbose();
        const dbPath = path.resolve(__dirname, process.env.SQLITE_PATH || '../powersense.db');
        const localDb = new sqlite3.Database(dbPath);
        
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
        console.log('📁 Connected to SQLite');
        break;
}

// Trigger Schema Init
initDB();

module.exports = { query };
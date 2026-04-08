require('dotenv').config({ path: '../.env' });
const db = require('../config/db');

async function seed() {
    console.log("🌱 Starting Database Seeding...");

    try {
        // IMPORTANT: Ensure tables exist before seeding
        await db.initDB();

        const entries = 96; 
        const now = Date.now();
        const fifteenMins = 15 * 60 * 1000;

        console.log(`📊 Generating ${entries} sensor entries...`);

        for (let i = 0; i < entries; i++) {
            const timestamp = new Date(now - (i * fifteenMins)).toISOString().replace('T', ' ').replace('Z', '');
            
            const voltage = (225 + Math.random() * 10).toFixed(2);
            const power = (50 + Math.random() * 1950).toFixed(2); // Up to 2k Watts
            const current = (power / voltage).toFixed(2);

            const sql = `
                INSERT INTO sensor_data 
                (voltage_val, current_val, inst_power_val, avg_current_val, avg_power_val, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            
            await db.query(sql, [voltage, current, power, current, power, timestamp]);
        }

        console.log("🔌 Seeding Relay Logs...");
        const fiveHoursAgo = new Date(now - (5 * 60 * 60 * 1000)).toISOString().replace('T', ' ').replace('Z', '');
        const oneHourAgo = new Date(now - (1 * 60 * 60 * 1000)).toISOString().replace('T', ' ').replace('Z', '');

        await db.query("INSERT INTO relay1_log (state, action_by, timestamp) VALUES (?, ?, ?)", [1, 'Seed', fiveHoursAgo]);
        await db.query("INSERT INTO relay1_log (state, action_by, timestamp) VALUES (?, ?, ?)", [0, 'Seed', oneHourAgo]);

        console.log("✅ Seeding complete!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Seeding failed:", error.message);
        process.exit(1);
    }
}

seed();
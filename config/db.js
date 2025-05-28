// backend/config/db.js

const { Pool } = require('pg');
require('dotenv').config(); // Load environment variables from .env file

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Neon requires SSL. 'require' is usually sufficient.
    // For local development, if you encounter issues, you might need:
    // rejectUnauthorized: false
    // But for production, always ensure proper certificate validation.
    rejectUnauthorized: false // This line might be necessary for local testing, remove or adjust for production.
  }
});

// Test the database connection
pool.connect()
  .then(client => {
    console.log('Successfully connected to Neon Tech PostgreSQL database!');
    client.release(); // Release the client back to the pool
  })
  .catch(err => {
    console.error('Error connecting to Neon Tech PostgreSQL database:', err.message);
    // In a real application, you might want more robust error handling here,
    // like gracefully exiting the process if the database connection is critical.
  });

module.exports = pool;

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'cesium_discovery',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

async function removeSampleData() {
    try {
        const res = await pool.query("DELETE FROM spatial_features WHERE name LIKE 'Sample %'");
        console.log(`Deleted ${res.rowCount} sample rows.`);
    } catch (err) {
        console.error("Error removing sample data:", err);
    } finally {
        pool.end();
    }
}

removeSampleData();

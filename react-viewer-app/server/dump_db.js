
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'cesium_discovery',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

async function dumpFeatures() {
    try {
        const res = await pool.query('SELECT id, name, type, category, ST_AsGeoJSON(geom) as geom FROM spatial_features');
        console.log("Total rows:", res.rowCount);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error(err);
    } finally {
        pool.end();
    }
}

dumpFeatures();

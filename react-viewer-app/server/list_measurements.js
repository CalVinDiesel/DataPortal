const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function listMeasurements() {
    try {
        console.log('Connecting to DB:', process.env.DB_NAME);

        // Check recent entries
        const res = await pool.query("SELECT id, name, type, category FROM spatial_features ORDER BY type, id");
        console.log(`Found ${res.rows.length} total features.`);
        console.log('--- Recent Features ---');
        for (const row of res.rows) {
            process.stdout.write(`ID: ${row.id} | Type: ${row.type} | Name: "${row.name}" | Cat: ${row.category}\n`);
        }

        // Explicit Point 7 check
        const point7Res = await pool.query("SELECT * FROM spatial_features WHERE name = 'Point 7'");
        if (point7Res.rows.length > 0) {
            console.log('CRITICAL: "Point 7" FOUND in database!', point7Res.rows[0]);
        } else {
            console.log('CONFIRMED: "Point 7" is NOT in the database.');
        }

        // Explicit circle check
        const circleRes = await pool.query("SELECT * FROM spatial_features WHERE type = 'circle'");
        console.log(`\nExplicit Circle Count: ${circleRes.rows.length}`);
        if (circleRes.rows.length > 0) {
            console.log('Circles found:', circleRes.rows.map(r => r.name).join(', '));
        } else {
            console.log('No circles found.');
        }

    } catch (err) {
        console.error('Error executing query', err.stack);
    } finally {
        await pool.end();
    }
}

listMeasurements();

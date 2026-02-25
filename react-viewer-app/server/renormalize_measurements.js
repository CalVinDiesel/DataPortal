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

async function renormalizeMeasurements() {
    try {
        // 1. Fetch all measurements ordered by type and id (to preserve creation order)
        const res = await pool.query("SELECT id, name, type FROM spatial_features WHERE category = 'measurement' ORDER BY type, id");
        const measurements = res.rows;

        console.log(`Found ${measurements.length} measurements to renormalize.`);

        // 2. Group by type
        const byType = {};
        measurements.forEach(m => {
            if (!byType[m.type]) byType[m.type] = [];
            byType[m.type].push(m);
        });

        // 3. Update names sequentially
        for (const type in byType) {
            const items = byType[type];
            console.log(`Renormalizing ${items.length} items of type '${type}'...`);

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const newName = `${type.charAt(0).toUpperCase() + type.slice(1)} ${i + 1}`;

                if (item.name !== newName) {
                    console.log(`  Renaming [${item.id}] "${item.name}" -> "${newName}"`);
                    await pool.query('UPDATE spatial_features SET name = $1 WHERE id = $2', [newName, item.id]);
                } else {
                    console.log(`  Skipping [${item.id}] "${item.name}" (already correct)`);
                }
            }
        }

        console.log('Renormalization complete.');

    } catch (err) {
        console.error('Error executing query', err.stack);
    } finally {
        await pool.end();
    }
}

renormalizeMeasurements();

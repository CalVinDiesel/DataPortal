const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function renormalizeAll() {
    try {
        // Fetch all spatial features
        const res = await pool.query("SELECT id, name, type, category FROM spatial_features ORDER BY type, id");
        const features = res.rows;
        console.log(`Found ${features.length} features to renormalize.`);

        const byType = {};
        features.forEach(f => {
            if (!byType[f.type]) byType[f.type] = [];
            byType[f.type].push(f);
        });

        for (const type in byType) {
            const items = byType[type];
            console.log(`Renormalizing ${items.length} items of type '${type}'...`);

            // Determine base name
            let baseName = type.charAt(0).toUpperCase() + type.slice(1);
            if (type === 'marker') baseName = 'Point';

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const newName = `${baseName} ${i + 1}`;

                if (item.name !== newName) {
                    console.log(`  Renaming [${item.id}] "${item.name}" -> "${newName}"`);
                    await pool.query('UPDATE spatial_features SET name = $1 WHERE id = $2', [newName, item.id]);
                }
            }
        }
        console.log('Renormalization complete.');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

renormalizeAll();

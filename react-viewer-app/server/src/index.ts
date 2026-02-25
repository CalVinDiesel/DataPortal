import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'cesium_discovery',
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || '5432'),
});

// Test DB Connection
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error acquiring client', err.stack);
    }
    console.log('Connected to PostgreSQL database');
    release();
});

// --- API Routes ---

// GET /api/features - Retrieve all features
app.get('/api/features', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, description, type, category, ST_AsGeoJSON(geom) as geom, created_at, updated_at FROM spatial_features ORDER BY id ASC');

        // Transform geom string to object
        const features = result.rows.map(row => ({
            ...row,
            geom: JSON.parse(row.geom)
        }));

        res.json(features);
    } catch (err: any) { // Use any to bypass TS unknown type error on err.message
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/features - Create a new feature
app.post('/api/features', async (req, res) => {
    const { name, description, type, category, geom } = req.body;
    console.log(`[POST] Received feature: ${name} (${type})`, JSON.stringify(geom));

    if (!name || !type || !category || !geom) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    try {
        const query = `
            INSERT INTO spatial_features (name, description, type, category, geom)
            VALUES ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))
            RETURNING id, name, description, type, category, ST_AsGeoJSON(geom) as geom, created_at, updated_at
        `;
        const values = [name, description, type, category, JSON.stringify(geom)];
        const result = await pool.query(query, values);

        const newFeature = {
            ...result.rows[0],
            geom: JSON.parse(result.rows[0].geom)
        };

        res.status(201).json(newFeature);
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/features/:id - Update a feature (metadata only for now)
app.put('/api/features/:id', async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    try {
        const query = `
            UPDATE spatial_features
            SET name = $1, description = $2, updated_at = NOW()
            WHERE id = $3
            RETURNING id, name, description, type, category, ST_AsGeoJSON(geom) as geom, created_at, updated_at
        `;
        const values = [name, description, id];
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Feature not found' });
            return;
        }

        const updatedFeature = {
            ...result.rows[0],
            geom: JSON.parse(result.rows[0].geom)
        };

        res.json(updatedFeature);
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// DELETE /api/features/:id - Delete a feature
app.delete('/api/features/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const query = 'DELETE FROM spatial_features WHERE id = $1 RETURNING id';
        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Feature not found' });
            return;
        }

        res.json({ message: 'Feature deleted successfully', id });
    } catch (err: any) {
        console.error(err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

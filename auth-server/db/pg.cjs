/**
 * PostgreSQL connection pool for Temadigital_Data_Portal.
 * Used when PG_DATABASE is set in .env (MapData, ClientUploads, ProcessingRequests).
 */
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (pool) return pool;
  const db = process.env.PG_DATABASE;
  if (!db) return null;
  pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || '5432', 10),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    database: db,
    max: 10,
    idleTimeoutMillis: 30000
  });
  pool.on('error', (err) => console.error('PG pool error:', err));
  return pool;
}

async function query(text, params) {
  const p = getPool();
  if (!p) return null;
  const client = await p.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

module.exports = { getPool, query };

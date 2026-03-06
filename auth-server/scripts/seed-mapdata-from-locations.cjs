/**
 * Seed MapData table from data/locations.json (overview map + showcases).
 * Run from auth-server: node scripts/seed-mapdata-from-locations.cjs
 * Requires PG_DATABASE in .env and existing MapData table.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });
const { query: pgQuery } = require('../db/pg.cjs');

const LOCATIONS_JSON = path.join(__dirname, '..', '..', 'data', 'locations.json');

async function run() {
  if (!process.env.PG_DATABASE) {
    console.error('PG_DATABASE is not set. Configure PostgreSQL in .env and run again.');
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(LOCATIONS_JSON, 'utf8'));
  } catch (e) {
    console.error('Could not read data/locations.json:', e.message);
    process.exit(1);
  }
  const locations = data.locations || [];
  if (!locations.length) {
    console.log('No locations in data/locations.json. Nothing to seed.');
    process.exit(0);
  }
  let inserted = 0;
  for (const loc of locations) {
    const mapDataID = (loc.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
    if (!mapDataID) continue;
    const title = (loc.name || mapDataID).trim();
    const description = (loc.description || '').trim();
    const lat = loc.coordinates && loc.coordinates.latitude != null ? Number(loc.coordinates.latitude) : null;
    const lon = loc.coordinates && loc.coordinates.longitude != null ? Number(loc.coordinates.longitude) : null;
    const tileset = (loc.dataPaths && loc.dataPaths.tileset) || (loc.tileset) || '';
    const thumb = (loc.previewImage || loc.thumbNailUrl || '').trim() || null;
    if (!tileset || lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
      console.warn('Skipping', mapDataID, '(missing tileset or coordinates)');
      continue;
    }
    try {
      await pgQuery(
        `INSERT INTO public."MapData" ("mapDataID", title, description, "xAxis", "yAxis", "3dTiles", "thumbNailUrl", "updateDateTime")
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT ("mapDataID") DO UPDATE SET
           title = EXCLUDED.title, description = EXCLUDED.description, "xAxis" = EXCLUDED."xAxis", "yAxis" = EXCLUDED."yAxis",
           "3dTiles" = EXCLUDED."3dTiles", "thumbNailUrl" = EXCLUDED."thumbNailUrl", "updateDateTime" = EXCLUDED."updateDateTime"`,
        [mapDataID, title, description, lon, lat, tileset, thumb]
      );
      inserted++;
      console.log('Upserted MapData:', mapDataID);
    } catch (e) {
      console.error('Error upserting', mapDataID, e.message);
    }
  }
  console.log('Done. MapData rows upserted:', inserted);
  process.exit(0);
}

run();

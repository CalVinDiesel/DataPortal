/**
 * Creates database Temadigital_Data_Portal (SQLite file) and table MapData.
 * Seeds from data/map-data.json. Run: npm run create-db
 * Output: auth-server/data/Temadigital_Data_Portal.sqlite
 */
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'Temadigital_Data_Portal.sqlite');
const MAPDATA_JSON = path.join(DATA_DIR, 'map-data.json');
const SQLJS_DIST = path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');

async function run() {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(SQLJS_DIST, file)
  });
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS MapData (
      mapDataID TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      xAxis REAL,
      yAxis REAL,
      "3dTiles" TEXT NOT NULL,
      thumbNailUrl TEXT,
      updateDateTime TEXT
    );
  `);

  let rows = [];
  try {
    const json = fs.readFileSync(MAPDATA_JSON, 'utf8');
    rows = JSON.parse(json);
  } catch (e) {
    console.warn('Could not read map-data.json, using default seed.');
    rows = [
      { mapDataID: 'KK_OSPREY', title: 'KK OSPREY', description: '3D model from GeoSabah 3D Hub (Kota Kinabalu area).', xAxis: 116.070466, yAxis: 5.957839, '3dTiles': 'https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json', thumbNailUrl: '', updateDateTime: new Date().toISOString() }
    ];
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO MapData (mapDataID, title, description, xAxis, yAxis, "3dTiles", thumbNailUrl, updateDateTime)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const row of rows) {
    stmt.run([
      row.mapDataID || '',
      row.title || '',
      row.description || '',
      row.xAxis != null ? row.xAxis : null,
      row.yAxis != null ? row.yAxis : null,
      row['3dTiles'] != null ? row['3dTiles'] : '',
      row.thumbNailUrl != null ? row.thumbNailUrl : '',
      row.updateDateTime != null ? row.updateDateTime : null
    ]);
  }
  stmt.free();

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const buffer = Buffer.from(db.export());
  fs.writeFileSync(DB_PATH, buffer);
  db.close();

  console.log('Created database:', DB_PATH);
  console.log('Table MapData with', rows.length, 'row(s).');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

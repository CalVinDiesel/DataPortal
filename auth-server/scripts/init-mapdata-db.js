/**
 * Ensures MapData seed exists in data/map-data.json (Temadigital_Data_Portal / MapData).
 * Run: npm run init-mapdata  (or node scripts/init-mapdata-db.js)
 */
const path = require('path');
const fs = require('fs');

const MAPDATA_FILE = path.join(__dirname, '..', 'data', 'map-data.json');
const seed = [
  {
    mapDataID: 'KK_OSPREY',
    title: 'KK OSPREY',
    description: '3D model from GeoSabah 3D Hub (Kota Kinabalu area).',
    xAxis: 116.070466,
    yAxis: 5.957839,
    '3dTiles': 'https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json',
    thumbNailUrl: '',
    updateDateTime: new Date().toISOString()
  }
];

fs.mkdirSync(path.dirname(MAPDATA_FILE), { recursive: true });
fs.writeFileSync(MAPDATA_FILE, JSON.stringify(seed, null, 2), 'utf8');
console.log('MapData seed written to data/map-data.json (KK_OSPREY).');

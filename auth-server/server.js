/**
 * TemaDataPortal Auth server
 * - Google & Facebook OAuth (redirect flow)
 * - Email/password register and login (stored in data/users.json)
 * - MapData API (PostgreSQL or SQLite or JSON)
 * - Admin: create 3D models, view client uploads, request image processing
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const { query: pgQuery } = require('./db/pg');

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const MAPDATA_FILE = path.join(__dirname, 'data', 'map-data.json');
const MAPDATA_DB_PATH = path.join(__dirname, 'data', 'Temadigital_Data_Portal.sqlite');
const PROJECT_ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(PROJECT_ROOT, process.env.UPLOAD_DIR || 'uploads');

let mapDataDb = null; // SQLite (sql.js) instance when DB file exists

function readUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}
function writeUsers(users) {
  fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// ---- MapData (Temadigital_Data_Portal.MapData – from SQLite table or map-data.json) ----
// These ids were used as temporary demo locations and should never appear on the live overview map.
const REMOVED_MAPDATA_IDS = new Set([
  'kk-city-centre',
  'kk-waterfront',
  'kk-likas-bay',
  'kk-tanjung-aru',
  'kk-teleuk-layang'
]);

function filterMapDataRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.filter(r => !REMOVED_MAPDATA_IDS.has(String(r.mapDataID || '').trim()));
}

function readMapDataFromDb() {
  if (!mapDataDb) return null;
  try {
    const stmt = mapDataDb.prepare('SELECT mapDataID, title, description, xAxis, yAxis, "3dTiles" as threeDTiles, thumbNailUrl, updateDateTime FROM MapData ORDER BY updateDateTime DESC');
    const rows = [];
    while (stmt.step()) {
      const r = stmt.getAsObject();
      rows.push({
        mapDataID: r.mapDataID,
        title: r.title,
        description: r.description || '',
        xAxis: r.xAxis,
        yAxis: r.yAxis,
        '3dTiles': r.threeDTiles || '',
        thumbNailUrl: r.thumbNailUrl || '',
        updateDateTime: r.updateDateTime || null
      });
    }
    stmt.free();
    return filterMapDataRows(rows);
  } catch (e) {
    console.error('readMapDataFromDb', e);
    return null;
  }
}

function readMapData() {
  const fromDb = readMapDataFromDb();
  if (fromDb && fromDb.length > 0) return fromDb;
  try {
    const data = fs.readFileSync(MAPDATA_FILE, 'utf8');
    return filterMapDataRows(JSON.parse(data));
  } catch (e) {
    fs.mkdirSync(path.dirname(MAPDATA_FILE), { recursive: true });
    const seed = [{
      mapDataID: 'KK_OSPREY',
      title: 'KK OSPREY',
      description: '3D model from GeoSabah 3D Hub (Kota Kinabalu area).',
      xAxis: 116.070466,
      yAxis: 5.957839,
      '3dTiles': 'https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json',
      thumbNailUrl: '',
      updateDateTime: new Date().toISOString()
    }];
    fs.writeFileSync(MAPDATA_FILE, JSON.stringify(seed, null, 2), 'utf8');
    return seed;
  }
}

// ---- PostgreSQL MapData (when PG_DATABASE is set) ----
async function readMapDataFromPg() {
  if (!process.env.PG_DATABASE) return null;
  try {
    const res = await pgQuery(
      'SELECT "mapDataID", title, description, "xAxis" as "xAxis", "yAxis" as "yAxis", "3dTiles" as "3dTiles", "thumbNailUrl", "updateDateTime" FROM public."PortalMapData" ORDER BY "updateDateTime" DESC'
    );
    if (!res || !res.rows || res.rows.length === 0) return null;
    const rows = res.rows.map(r => ({
      mapDataID: r.mapDataID,
      title: r.title,
      description: r.description || '',
      xAxis: r.xAxis,
      yAxis: r.yAxis,
      '3dTiles': r['3dTiles'] || '',
      thumbNailUrl: r.thumbNailUrl || '',
      updateDateTime: r.updateDateTime ? new Date(r.updateDateTime).toISOString() : null
    }));
    return filterMapDataRows(rows);
  } catch (e) {
    console.error('readMapDataFromPg', e);
    return null;
  }
}

async function getMapDataForApi() {
  const fromPg = await readMapDataFromPg();
  if (fromPg && fromPg.length > 0) return fromPg;
  return readMapData();
}

const PORT = process.env.PORT || 3000;
const FRONT_END_URL = process.env.FRONT_END_URL || 'http://localhost:5501/html/front-pages/landing-page.html';

// Full callback URL so token exchange uses same redirect_uri as Google Cloud (avoids TokenError: Unauthorized)
const AUTH_SERVER_BASE = process.env.AUTH_SERVER_BASE || `http://localhost:${PORT}`;
const GOOGLE_CALLBACK_URL = `${AUTH_SERVER_BASE}/api/auth/google/callback`;

// Trim credentials (stray spaces or Windows \\r from copy-paste cause "TokenError: Unauthorized")
function cleanEnv(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/\r$/, '').trim();
}
const GOOGLE_CLIENT_ID = cleanEnv(process.env.GOOGLE_CLIENT_ID);
const GOOGLE_CLIENT_SECRET = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Session (required for Passport and email login; use a proper store in production)
app.use(session({
  secret: process.env.SESSION_SECRET || 'temadataportal-auth-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// ---- Google ---- 
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL,  // full URL so token exchange matches Google Cloud
    tokenURL: 'https://oauth2.googleapis.com/token',  // recommended endpoint (avoids v4 quirks)
    scope: ['profile', 'email']
  }, (accessToken, refreshToken, profile, done) => {
    const user = {
      provider: 'google',
      id: profile.id,
      email: profile.emails && profile.emails[0] && profile.emails[0].value,
      name: profile.displayName
    };
    return done(null, user);
  }));

  app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  app.get('/api/auth/google/callback',
    (req, res, next) => {
      passport.authenticate('google', { session: true }, (err, user) => {
        if (err) {
          console.error('Google OAuth error:', err.message || err, '| code:', err.code, '| status:', err.status);
          if (err.code === 'invalid_client' || (err.message && err.message.includes('Unauthorized'))) {
            console.error('>>> Fix: In Google Cloud use Credentials → your OAuth 2.0 Client ID (type "Web application"). Copy Client ID and Client secret again, or Reset secret and paste the NEW secret into .env. Ensure both are from the same row.');
          }
          const url = new URL(FRONT_END_URL);
          url.searchParams.set('error', 'google_auth_failed');
          return res.redirect(url.toString());
        }
        req.logIn(user, (loginErr) => {
          if (loginErr) {
            console.error('Login error:', loginErr);
            const url = new URL(FRONT_END_URL);
            url.searchParams.set('error', 'google_auth_failed');
            return res.redirect(url.toString());
          }
          const url = new URL(FRONT_END_URL);
          url.searchParams.set('logged_in', '1');
          if (user && user.email) url.searchParams.set('email', user.email);
          res.redirect(url.toString());
        });
      })(req, res, next);
    }
  );
} else {
  app.get('/api/auth/google', (req, res) => res.status(503).send('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'));
}

// ---- Facebook ----
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: `/api/auth/facebook/callback`,
    profileFields: ['id', 'displayName', 'emails']
  }, (accessToken, refreshToken, profile, done) => {
    const user = {
      provider: 'facebook',
      id: profile.id,
      email: profile.emails && profile.emails[0] && profile.emails[0].value,
      name: profile.displayName
    };
    return done(null, user);
  }));

  app.get('/api/auth/facebook', passport.authenticate('facebook', { scope: ['email', 'public_profile'] }));
  app.get('/api/auth/facebook/callback',
    passport.authenticate('facebook', { session: true }),
    (req, res) => {
      const url = new URL(FRONT_END_URL);
      url.searchParams.set('logged_in', '1');
      if (req.user && req.user.email) url.searchParams.set('email', req.user.email);
      res.redirect(url.toString());
    }
  );
} else {
  app.get('/api/auth/facebook', (req, res) => res.status(503).send('Facebook OAuth not configured. Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env'));
}

// ---- Email/password register and login ----
app.post('/api/auth/register', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  const name = (req.body.name || '').trim() || email.split('@')[0];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }
  const users = readUsers();
  if (users.some(u => (u.email || '').toLowerCase() === email)) {
    return res.status(400).json({ success: false, message: 'An account with this email already exists. Log in or use a different email.' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  users.push({ email, passwordHash, name, provider: 'local' });
  writeUsers(users);
  res.json({ success: true, message: 'Account created. You can now log in.' });
});

app.post('/api/auth/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }
  const users = readUsers();
  const user = users.find(u => (u.email || '').toLowerCase() === email);
  if (!user || user.provider !== 'local') {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  if (!bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  const sessionUser = { provider: 'local', email: user.email, name: user.name };
  req.logIn(sessionUser, (err) => {
    if (err) return res.status(500).json({ success: false, message: 'Login failed.' });
    res.json({ success: true, redirect: FRONT_END_URL });
  });
});

// Current user (for portal pages that need to show logged-in state)
app.get('/api/auth/me', (req, res) => {
  if (req.user && (req.user.email || req.user.id)) {
    return res.json({ loggedIn: true, email: req.user.email, name: req.user.name });
  }
  res.json({ loggedIn: false });
});

// ---- MapData API (for overview map and 3D viewer by id) ----
app.get('/api/map-data', async (req, res) => {
  try {
    const rows = await getMapDataForApi();
    const sorted = [...rows].sort((a, b) => (b.updateDateTime || '').localeCompare(a.updateDateTime || ''));
    res.json(sorted);
  } catch (e) {
    console.error('GET /api/map-data', e);
    res.status(500).json({ error: 'Failed to load map data.' });
  }
});

app.get('/api/map-data/:id', async (req, res) => {
  const id = (req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing id.' });
  try {
    const rows = await getMapDataForApi();
    const row = rows.find(r => (r.mapDataID || '').toString() === id);
    if (!row) return res.status(404).json({ error: 'Map data not found.' });
    res.json(row);
  } catch (e) {
    console.error('GET /api/map-data/:id', e);
    res.status(500).json({ error: 'Failed to load map data.' });
  }
});

// ---- Admin: create 3D model (add to MapData for overview map / showcases) ----
app.post('/api/map-data', express.json(), async (req, res) => {
  const body = req.body || {};
  const mapDataID = (body.mapDataID || body.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  const title = (body.title || '').trim() || mapDataID;
  const description = (body.description || '').trim();
  const xAxis = body.xAxis != null ? Number(body.xAxis) : null;
  const yAxis = body.yAxis != null ? Number(body.yAxis) : null;
  const tilesUrl = (body['3dTiles'] || body.tilesetUrl || body.tileset || '').trim();
  const thumbNailUrl = (body.thumbNailUrl || body.thumbnailUrl || '').trim();
  if (!mapDataID) return res.status(400).json({ success: false, message: 'mapDataID is required.' });
  if (!tilesUrl) return res.status(400).json({ success: false, message: '3dTiles URL is required.' });
  if (xAxis == null || yAxis == null || isNaN(xAxis) || isNaN(yAxis)) {
    return res.status(400).json({ success: false, message: 'Valid xAxis (longitude) and yAxis (latitude) are required.' });
  }
  const updateDateTime = new Date().toISOString();
  try {
    if (process.env.PG_DATABASE) {
      await pgQuery(
        `INSERT INTO public."PortalMapData" ("mapDataID", title, description, "xAxis", "yAxis", "3dTiles", "thumbNailUrl", "updateDateTime")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT ("mapDataID") DO UPDATE SET
           title = EXCLUDED.title, description = EXCLUDED.description, "xAxis" = EXCLUDED."xAxis", "yAxis" = EXCLUDED."yAxis",
           "3dTiles" = EXCLUDED."3dTiles", "thumbNailUrl" = EXCLUDED."thumbNailUrl", "updateDateTime" = EXCLUDED."updateDateTime"`,
        [mapDataID, title, description, xAxis, yAxis, tilesUrl, thumbNailUrl || null, updateDateTime]
      );
    } else {
      const rows = readMapData();
      const idx = rows.findIndex(r => (r.mapDataID || '').toString() === mapDataID);
      const row = { mapDataID, title, description, xAxis, yAxis, '3dTiles': tilesUrl, thumbNailUrl: thumbNailUrl || '', updateDateTime };
      if (idx >= 0) rows[idx] = row; else rows.unshift(row);
      if (mapDataDb) {
        mapDataDb.run(
          `INSERT OR REPLACE INTO MapData (mapDataID, title, description, xAxis, yAxis, "3dTiles", thumbNailUrl, updateDateTime) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [mapDataID, title, description, xAxis, yAxis, tilesUrl, thumbNailUrl || '', updateDateTime]
        );
      } else {
        fs.writeFileSync(MAPDATA_FILE, JSON.stringify(rows, null, 2), 'utf8');
      }
    }
    res.json({ success: true, mapDataID, message: '3D model saved. It will appear on the overview map.' });
  } catch (e) {
    console.error('POST /api/map-data', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to save map data.' });
  }
});

// ---- Client upload: store uploaded images and metadata (linked to upload-data page) ----
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subdir = `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const dir = path.join(UPLOAD_DIR, subdir);
    fs.mkdirSync(dir, { recursive: true });
    req._uploadSubDir = (process.env.UPLOAD_DIR || 'uploads') + '/' + subdir;
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_'))
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB per file

app.post('/api/upload-geospatial-data', upload.single('dataFile'), async (req, res) => {
  try {
    const projectId = (req.body.projectID || req.body.projectId || '').trim() || `upload_${Date.now()}`;
    const projectTitle = (req.body.projectTitle || req.body.project_title || '').trim() || projectId;
    const uploadType = (req.body.uploadType || req.body.cameraConfiguration || 'single').toLowerCase().includes('multiple') ? 'multiple' : 'single';
    const cameraModels = (req.body.cameraModels || '').trim() || null;
    const captureDate = (req.body.captureDate || '').trim() || null;
    const organizationName = (req.body.organizationName || '').trim() || null;
    const createdByEmail = (req.user && req.user.email) ? req.user.email : null;
    let fileCount = 0;
    const filePaths = [];
    if (req._uploadSubDir) {
      const dir = path.join(PROJECT_ROOT, req._uploadSubDir);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        fileCount = files.length;
        files.forEach(f => filePaths.push(req._uploadSubDir + '/' + f));
      }
    }
    if (req.file) {
      fileCount = Math.max(fileCount, 1);
      const rel = (req._uploadSubDir + '/' + path.basename(req.file.filename || req.file.originalname || 'file')).replace(/\\/g, '/');
      if (!filePaths.includes(rel)) filePaths.push(rel);
    }
    if (process.env.PG_DATABASE) {
      await pgQuery(
        `INSERT INTO public."ClientUploads" (project_id, project_title, upload_type, file_count, file_paths, camera_models, capture_date, organization_name, created_by_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [projectId, projectTitle, uploadType, fileCount, filePaths.length ? filePaths : null, cameraModels, captureDate || null, organizationName, createdByEmail]
      );
    }
    res.json({ success: true, message: 'Upload saved.', projectId, fileCount });
  } catch (e) {
    console.error('POST /api/upload-geospatial-data', e);
    res.status(500).json({ success: false, message: e.message || 'Upload failed.' });
  }
});

// ---- Admin: list client uploads ----
app.get('/api/admin/client-uploads', async (req, res) => {
  if (!process.env.PG_DATABASE) {
    return res.json([]);
  }
  try {
    const q = await pgQuery('SELECT id, project_id, project_title, upload_type, file_count, file_paths, camera_models, capture_date, organization_name, created_at, created_by_email FROM public."ClientUploads" ORDER BY created_at DESC');
    res.json((q && q.rows) ? q.rows : []);
  } catch (e) {
    console.error('GET /api/admin/client-uploads', e);
    res.status(500).json({ error: 'Failed to load client uploads.' });
  }
});

// ---- Admin: request 3D processing for a client upload ----
app.post('/api/admin/processing-request', express.json(), async (req, res) => {
  const uploadId = req.body && (req.body.upload_id ?? req.body.uploadId);
  if (!uploadId || !process.env.PG_DATABASE) {
    return res.status(400).json({ success: false, message: 'upload_id is required and PostgreSQL must be configured.' });
  }
  try {
    const requestedBy = (req.user && req.user.email) ? req.user.email : (req.body.requested_by || req.body.requestedBy || 'admin');
    const r = await pgQuery(
      `INSERT INTO public."ProcessingRequests" (upload_id, status, requested_by) VALUES ($1, 'pending', $2) RETURNING id, upload_id, status, requested_at`,
      [uploadId, requestedBy]
    );
    const row = r && r.rows && r.rows[0];
    if (!row) return res.status(500).json({ success: false, message: 'Insert failed.' });
    res.json({ success: true, id: row.id, upload_id: row.upload_id, status: row.status, requested_at: row.requested_at });
  } catch (e) {
    console.error('POST /api/admin/processing-request', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to create processing request.' });
  }
});

// ---- Admin: list processing requests ----
app.get('/api/admin/processing-requests', async (req, res) => {
  if (!process.env.PG_DATABASE) return res.json([]);
  try {
    const q = await pgQuery(
      `SELECT pr.id, pr.upload_id, pr.status, pr.requested_at, pr.requested_by, pr.completed_at, pr.result_tileset_url, pr.notes
       FROM public."ProcessingRequests" pr ORDER BY pr.requested_at DESC`
    );
    res.json((q && q.rows) ? q.rows : []);
  } catch (e) {
    console.error('GET /api/admin/processing-requests', e);
    res.status(500).json({ error: 'Failed to load processing requests.' });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve front-end (HTML, assets) from project root so landing page works with npm start
app.use(express.static(PROJECT_ROOT));
// Open http://localhost:3000/ or http://127.0.0.1:3000/ → landing page
app.get('/', (req, res) => res.redirect('/html/front-pages/landing-page.html'));

// Load SQLite MapData DB (Temadigital_Data_Portal.MapData) if file exists
function startServer() {
  app.listen(PORT, () => {
    console.log('Auth server running on http://localhost:' + PORT + ' (or http://127.0.0.1:' + PORT + ')');
    console.log('  Landing page: http://localhost:' + PORT + '/');
    console.log('  Admin portal: http://localhost:' + PORT + '/html/vertical-menu-template/index.html');
    if (process.env.PG_DATABASE) console.log('  MapData & admin: using PostgreSQL database ' + process.env.PG_DATABASE);
    else if (mapDataDb) console.log('  MapData: using SQLite (table MapData)');
    else console.log('  MapData: using data/map-data.json (run npm run create-db to create SQLite DB)');
  console.log('  Google:  GET http://localhost:' + PORT + '/api/auth/google');
  if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    console.log('  Google callback URL (must match Google Cloud exactly):', GOOGLE_CALLBACK_URL);
    console.log('  Google credentials: Client ID length', GOOGLE_CLIENT_ID.length, '| Secret length', GOOGLE_CLIENT_SECRET.length);
    if (GOOGLE_CLIENT_SECRET.startsWith('GOCSPX--')) {
      console.warn('  >>> WARNING: Secret starts with GOCSPX-- (double hyphen). In Google Cloud, secrets usually have ONE hyphen (GOCSPX-). If sign-in fails, re-copy the Client secret from Credentials.');
    }
  }
  console.log('  Facebook: GET http://localhost:' + PORT + '/api/auth/facebook');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) console.log('  (Google not configured – set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env)');
  if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) console.log('  (Facebook not configured – set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env)');
  });
}

(async function () {
  if (fs.existsSync(MAPDATA_DB_PATH)) {
    try {
      const initSqlJs = require('sql.js');
      const sqlJsDist = path.join(__dirname, 'node_modules', 'sql.js', 'dist');
      const SQL = await initSqlJs({ locateFile: (file) => path.join(sqlJsDist, file) });
      const buf = fs.readFileSync(MAPDATA_DB_PATH);
      mapDataDb = new SQL.Database(buf);
    } catch (e) {
      console.warn('Could not load MapData SQLite DB:', e.message || e);
    }
  }
  startServer();
})();

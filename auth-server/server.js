/**
 * TemaDataPortal Auth server
 * - Google & Facebook OAuth (redirect flow)
 * - Email/password register and login (stored in data/users.json)
 * - MapData API (SQLite DB Temadigital_Data_Portal, table MapData)
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;

const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const MAPDATA_FILE = path.join(__dirname, 'data', 'map-data.json');
const MAPDATA_DB_PATH = path.join(__dirname, 'data', 'Temadigital_Data_Portal.sqlite');

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
app.get('/api/map-data', (req, res) => {
  try {
    const rows = readMapData();
    const sorted = [...rows].sort((a, b) => (b.updateDateTime || '').localeCompare(a.updateDateTime || ''));
    res.json(sorted);
  } catch (e) {
    console.error('GET /api/map-data', e);
    res.status(500).json({ error: 'Failed to load map data.' });
  }
});

app.get('/api/map-data/:id', (req, res) => {
  const id = (req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing id.' });
  try {
    const rows = readMapData();
    const row = rows.find(r => (r.mapDataID || '').toString() === id);
    if (!row) return res.status(404).json({ error: 'Map data not found.' });
    res.json(row);
  } catch (e) {
    console.error('GET /api/map-data/:id', e);
    res.status(500).json({ error: 'Failed to load map data.' });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve front-end (HTML, assets) from project root so landing page works with npm start
const PROJECT_ROOT = path.join(__dirname, '..');
app.use(express.static(PROJECT_ROOT));
// Open http://localhost:3000/ or http://127.0.0.1:3000/ → landing page
app.get('/', (req, res) => res.redirect('/html/front-pages/landing-page.html'));

// Load SQLite MapData DB (Temadigital_Data_Portal.MapData) if file exists
function startServer() {
  app.listen(PORT, () => {
    console.log('Auth server running on http://localhost:' + PORT + ' (or http://127.0.0.1:' + PORT + ')');
    console.log('  Landing page: http://localhost:' + PORT + '/');
    if (mapDataDb) console.log('  MapData: using database Temadigital_Data_Portal (table MapData)');
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

/**
 * TemaDataPortal Auth server
 * - Google OAuth via Better Auth (redirect flow)
 * - Email/password register and login (stored in data/users.json)
 * - MapData API (PostgreSQL or SQLite or JSON)
 * - Admin: create 3D models (overview map); custom image-to-3D processing (deliver to client, paid service)
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import cors from "cors";
import bcrypt from "bcryptjs";
import multer from "multer";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { auth, baseURL, frontEndUrl, googleClientId, googleClientSecret } from "./auth.config.js";
import { getMicrosoftAuthUrl, handleMicrosoftCallback } from "./microsoftAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env"), override: true });

const require = createRequire(import.meta.url);
const { query: pgQuery } = require("./db/pg.cjs");

const USERS_FILE = path.join(__dirname, "data", "users.json");
const MAPDATA_FILE = path.join(__dirname, 'data', 'map-data.json');
const MAPDATA_DB_PATH = path.join(__dirname, 'data', 'Temadigital_Data_Portal.sqlite');
const PROJECT_ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(PROJECT_ROOT, process.env.UPLOAD_DIR || 'uploads');
const MAP_THUMBNAIL_DIR = path.join(PROJECT_ROOT, 'uploads', 'map-thumbnails');

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

/** Whether to use PostgreSQL DataPortalUsers table for user directory (when PG_DATABASE is set). */
function usePgUsers() {
  return !!process.env.PG_DATABASE && typeof pgQuery === 'function';
}

/** Get role for an email. Uses DataPortalUsers when PG is set (with users.json fallback), else users.json only. Returns "admin" or "client".
 *  When multiple rows exist (same email, different case), prefer the one with role='admin'. */
async function getRoleForEmailAsync(email) {
  if (!email) return 'client';
  const emailNorm = String(email).trim().toLowerCase();

  if (usePgUsers()) {
    try {
      const r = await pgQuery(
        `SELECT role FROM public."DataPortalUsers" WHERE LOWER(email) = $1
         ORDER BY (role = 'admin') DESC NULLS LAST, id LIMIT 1`,
        [emailNorm]
      );
      const role = r?.rows?.[0]?.role;
      if (role !== undefined && role !== null) return (role === 'admin') ? 'admin' : 'client';
    } catch (e) {
      console.error('getRoleForEmail PG', e);
    }
    // Fallback: PG had no row or error — check users.json so admin in JSON still works
  }

  try {
    const users = readUsers();
    const u = users.find(x => (x.email || '').toLowerCase() === emailNorm);
    return (u && (u.role === 'admin')) ? 'admin' : 'client';
  } catch (e) {
    console.error('getRoleForEmailAsync fallback readUsers', e);
    return 'client';
  }
}

/** Get role for an email (sync fallback for callers that cannot await). Prefer getRoleForEmailAsync. */
function getRoleForEmail(email) {
  if (!email) return 'client';
  const users = readUsers();
  const u = users.find(x => (x.email || '').toLowerCase() === String(email).toLowerCase());
  return (u && (u.role === 'admin')) ? 'admin' : 'client';
}

/** Get all users for admin list / register check / login. From DataPortalUsers when PG, else users.json. */
async function getUsersAsync() {
  if (usePgUsers()) {
    try {
      const r = await pgQuery(
        'SELECT id, email, name, username, contact_number, role, provider, password_hash FROM public."DataPortalUsers" ORDER BY created_at ASC'
      );
      return (r?.rows || []).map(row => ({
        email: row.email || '',
        name: row.name || '',
        username: row.username || '',
        contactNumber: row.contact_number || '',
        role: row.role === 'admin' ? 'admin' : 'client',
        provider: row.provider || 'local',
        passwordHash: row.password_hash,
      }));
    } catch (e) {
      console.error('getUsersAsync PG', e);
      return [];
    }
  }
  return readUsers();
}

/** Insert a new user (register). Used when usePgUsers(). */
async function insertUserPG(user) {
  await pgQuery(
    `INSERT INTO public."DataPortalUsers" (email, name, username, contact_number, role, provider, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      (user.email || '').toLowerCase().trim(),
      (user.name || '').trim() || null,
      (user.username || '').trim() || null,
      (user.contactNumber || '').trim() || null,
      user.role === 'admin' ? 'admin' : 'client',
      user.provider || 'local',
      user.passwordHash || null,
    ]
  );
}

/** Update role for a user by email (promote). Used when usePgUsers(). */
async function updateUserRolePG(email, role) {
  const r = await pgQuery(
    `UPDATE public."DataPortalUsers" SET role = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2) RETURNING email`,
    [role, String(email).trim()]
  );
  return r?.rows?.length > 0;
}

/** Upsert user into DataPortalUsers (for OAuth: Microsoft/Google first sign-in). Uses case-insensitive email
 *  lookup so we never create a second row for the same email (e.g. Admin@gmail.com vs admin@gmail.com).
 *  Never overwrites an existing row's role — so if they're already admin, they stay admin when signing in with Microsoft. */
async function upsertUserPG(user) {
  const emailLower = (user.email || '').toLowerCase().trim();
  if (!emailLower) return;
  const existing = await pgQuery(
    'SELECT id, role FROM public."DataPortalUsers" WHERE LOWER(email) = $1 LIMIT 1',
    [emailLower]
  );
  const row = existing?.rows?.[0];
  if (row) {
    await pgQuery(
      `UPDATE public."DataPortalUsers" SET name = COALESCE($1, name), updated_at = NOW() WHERE id = $2`,
      [(user.name || '').trim() || null, row.id]
    );
    return;
  }
  await pgQuery(
    `INSERT INTO public."DataPortalUsers" (email, name, username, contact_number, role, provider, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)`,
    [
      emailLower,
      (user.name || '').trim() || null,
      (user.username || '').trim() || null,
      (user.contactNumber || '').trim() || null,
      user.role === 'admin' ? 'admin' : 'client',
      user.provider || 'local',
    ]
  );
}

/** Middleware: set req.user from Better Auth or express-session; 401 if not logged in. */
async function requireAuth(req, res, next) {
  try {
    const betterAuthSession = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (betterAuthSession?.user) {
      const role = await getRoleForEmailAsync(betterAuthSession.user.email);
      req.user = {
        email: betterAuthSession.user.email ?? null,
        name: betterAuthSession.user.name ?? null,
        role,
      };
      return next();
    }
    const local = req.session?.user;
    if (local && (local.email || local.id)) {
      const role = local.role || await getRoleForEmailAsync(local.email);
      req.user = {
        email: local.email,
        name: local.name,
        role,
      };
      return next();
    }
  } catch (e) {
    console.error('requireAuth', e);
  }
  res.status(401).json({ success: false, message: 'You must be logged in.' });
}

/** Middleware: require req.user.role === 'admin'. Use after requireAuth. */
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ success: false, message: 'Admin access only.' });
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
      'SELECT "mapDataID", title, description, "xAxis" as "xAxis", "yAxis" as "yAxis", "3dTiles" as "3dTiles", "thumbNailUrl", "updateDateTime" FROM public."MapData" ORDER BY "updateDateTime" DESC'
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
const FRONT_END_URL = process.env.FRONT_END_URL || frontEndUrl || "http://localhost:3000/html/front-pages/landing-page.html";
const LOGIN_PAGE_URL = FRONT_END_URL.replace(/\/[^/]*$/, '/login.html');

const app = express();

app.use(cors({ origin: true, credentials: true }));

// Session for email/password login (Better Auth handles Google session via its own cookie)
app.use(session({
  secret: process.env.SESSION_SECRET || "temadataportal-auth-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false },
}));

// ---- Auth: /api/auth/me (check Better Auth session first, then express-session for email/Microsoft login) ----
app.get("/api/auth/me", async (req, res) => {
  try {
    const betterAuthSession = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (betterAuthSession?.user) {
      const email = betterAuthSession.user.email ?? null;
      const role = await getRoleForEmailAsync(email);
      return res.json({
        loggedIn: true,
        email,
        name: betterAuthSession.user.name ?? null,
        role,
      });
    }
    const localUser = req.session?.user;
    if (localUser && (localUser.email || localUser.id)) {
      const role = localUser.role || await getRoleForEmailAsync(localUser.email);
      return res.json({ loggedIn: true, email: localUser.email, name: localUser.name, role });
    }
  } catch (e) {
    console.error("GET /api/auth/me", e);
  }
  res.json({ loggedIn: false });
});

// ---- Google: start OAuth by calling our Better Auth sign-in endpoint (so cookies are set), then forward redirect to browser ----
const googleCallbackDoneUrl = `${baseURL}/api/auth/google-callback-done?then=${encodeURIComponent(FRONT_END_URL)}`;
const googleCallbackRegisterUrl = `${baseURL}/api/auth/google-callback-done?flow=register&then=${encodeURIComponent('http://localhost:3000/html/front-pages/register.html')}`;
app.get("/api/auth/google", async (req, res) => {
  if (!googleClientId || !googleClientSecret) {
    return res.status(503).send("Google OAuth not configured.");
  }
  const flow = req.query.flow || 'login';
  const callbackUrl = flow === 'register' ? googleCallbackRegisterUrl : googleCallbackDoneUrl;
  res.send(`
    <html><body><script>
      fetch('/api/auth/sign-in/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', callbackURL: '${callbackUrl}' }),
        credentials: 'include'
      })
      .then(r => r.json())
      .then(data => {
        if (data.url) window.location.href = data.url;
        else window.location.href = '${FRONT_END_URL}?error=google_auth_failed';
      })
      .catch(() => window.location.href = '${FRONT_END_URL}?error=google_auth_failed');
    </script></body></html>
  `);
});

// After Better Auth Google callback: read session and redirect to frontend with logged_in and email
app.get("/api/auth/google-callback-done", async (req, res) => {
  const thenUrl = (req.query.then || FRONT_END_URL).toString();
  const flow = req.query.flow || 'login';
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (session?.user) {
      if (flow === 'register') {
        // Redirect to register page with pre-filled details
        return res.redirect(
          `http://localhost:3000/html/front-pages/register.html?logged_in=1&email=${encodeURIComponent(session.user.email || '')}&name=${encodeURIComponent(session.user.name || '')}&provider=google`
        );
      }
      const url = new URL(thenUrl);
      url.searchParams.set("logged_in", "1");
      if (session.user.email) url.searchParams.set("email", session.user.email);
      return res.redirect(302, url.toString());
    }
  } catch (e) {
    console.error("Google callback-done:", e);
  }
  res.redirect(302, "http://localhost:3000/html/front-pages/login.html?error=cancelled");
});

// ---- Email/password register and login (unchanged API contract; store session in express-session) ----
// Role: "client" | "admin". Admin only if ADMIN_REGISTRATION_CODE matches.
app.post("/api/auth/register", express.json(), async (req, res) => {
  const rawName = (req.body.name || '').trim();
  const rawContact = (req.body.contactNumber || '').trim();
  const rawUsername = (req.body.username || '').trim();
  const rawEmail = (req.body.email || '').trim();
  const email = rawEmail.toLowerCase();
  const password = req.body.password;
  const roleRequested = (req.body.role || 'client').toLowerCase() === 'admin' ? 'admin' : 'client';
  const adminCode = (req.body.adminCode || '').trim();

  if (!rawName) {
    return res.status(400).json({ success: false, message: 'Please enter your name.' });
  }
  if (!rawContact || !/^[0-9+\-\s()]{7,20}$/.test(rawContact)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid contact number.' });
  }
  if (!rawUsername || !/^[a-zA-Z0-9_.-]{3,30}$/.test(rawUsername)) {
    return res.status(400).json({ success: false, message: 'Username must be 3–30 characters (letters, numbers, ._-).' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }

  const users = await getUsersAsync();
  if (users.some(u => (u.email || '').toLowerCase() === email)) {
    return res.status(400).json({ success: false, message: 'An account with this email already exists. Log in or use a different email.' });
  }
  if (users.some(u => (u.username || '').toLowerCase() === rawUsername.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'That username is already taken. Choose another one.' });
  }

  let role = 'client';
  if (roleRequested === 'admin') {
    let secret = (process.env.ADMIN_REGISTRATION_CODE || '').trim();
    if (secret.length >= 2 && secret.startsWith('"') && secret.endsWith('"')) {
      secret = secret.slice(1, -1).trim();
    }
    if (secret.length >= 2 && secret.startsWith("'") && secret.endsWith("'")) {
      secret = secret.slice(1, -1).trim();
    }
    if (!secret) {
      return res.status(503).json({ success: false, message: 'Admin registration is not configured. The server administrator must set ADMIN_REGISTRATION_CODE in auth-server/.env.' });
    }
    if ((adminCode || '').trim() !== secret) {
      return res.status(403).json({ success: false, message: 'Admin registration requires a valid approval code. Sign up as Client or contact an administrator.' });
    }
    role = 'admin';
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = {
    email,
    username: rawUsername,
    name: rawName,
    contactNumber: rawContact,
    passwordHash,
    provider: (req.body.provider || 'local').toLowerCase() === 'google' ? 'google' : (req.body.provider || 'local').toLowerCase() === 'microsoft' ? 'microsoft' : 'local',
    role,
  };
  if (usePgUsers()) {
    try {
      await insertUserPG(newUser);
    } catch (e) {
      if (e.code === '23505') {
        return res.status(400).json({ success: false, message: 'An account with this email already exists. Log in or use a different email.' });
      }
      console.error('register insertUserPG', e);
      return res.status(500).json({ success: false, message: 'Registration failed.' });
    }
  } else {
    users.push(newUser);
    writeUsers(users);
  }
  res.json({ success: true, message: 'Account created. You can now log in.' });
});

app.post("/api/auth/login", express.json(), async (req, res) => {
  const identifierRaw = (req.body.email || '').trim();
  const password = req.body.password;
  if (!identifierRaw || !password) {
    return res.status(400).json({ success: false, message: 'Email or username and password are required.' });
  }
  const users = await getUsersAsync();
  const lower = identifierRaw.toLowerCase();
  let user;
  if (identifierRaw.includes('@')) {
    user = users.find(u => (u.email || '').toLowerCase() === lower);
  } else {
    user = users.find(u => (u.username || '').toLowerCase() === lower);
  }
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email/username or password.' });
  }
  if (!user.passwordHash) {
    return res.status(401).json({ success: false, message: 'This account uses Google or Microsoft sign-in. Use one of those buttons to log in.' });
  }
  if (!bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Invalid email/username or password.' });
  }
  const role = (user.role === 'admin') ? 'admin' : 'client';
  req.session.user = { provider: "local", email: user.email, name: user.name, role };
  res.json({ success: true, redirect: FRONT_END_URL });
});

// ─── Microsoft OAuth ──────────────────────────────────────────────────────────
app.get("/auth/microsoft/login", async (req, res) => {
  try {
    req.session.msFlow = req.query.flow || 'login';
    const { authUrl, state } = await getMicrosoftAuthUrl();
    req.session.msState = state; // save state for callback verification
    console.log("MS Flow set to:", req.session.msFlow);
    console.log("Microsoft Auth URL:", authUrl);
    res.redirect(authUrl);
  } catch (err) {
    console.error("Microsoft login error:", err);
    res.status(500).json({ error: "Failed to initiate Microsoft login" });
  }
});

// ↓ REPLACED: now uses MicrosoftUsers table instead of Users table
app.get("/auth/microsoft/callback", async (req, res) => {
  const { code, error, error_description, state } = req.query;
  if (error) {
    console.error("Microsoft OAuth error:", error, error_description);
    return res.redirect(FRONT_END_URL + "?auth_error=" + encodeURIComponent(error_description));
  }
  if (!code) return res.status(400).json({ error: "No authorization code received" });
  try {
    const msUser = await handleMicrosoftCallback(code, state);
    const result = await pgQuery(`
      INSERT INTO public."MicrosoftUsers" (microsoft_id, email, name, "updatedAt")
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (microsoft_id) DO UPDATE
        SET email      = EXCLUDED.email,
            name       = EXCLUDED.name,
            "updatedAt" = NOW()
      RETURNING *
    `, [msUser.id, msUser.email, msUser.name]);
    const dbUser = result.rows[0];
    const emailNorm = (dbUser.email || '').trim().toLowerCase();
    const flow = req.session?.msFlow || 'login';

    // Login flow: only allow if this email is already registered (e.g. they registered with Google with same email)
    if (flow === 'login') {
      const users = await getUsersAsync();
      const emailRegistered = users.some(u => (u.email || '').toLowerCase() === emailNorm);
      if (!emailRegistered) {
        req.session.msFlow = null;
        return res.redirect(LOGIN_PAGE_URL + "?auth_error=email_not_registered&email=" + encodeURIComponent(dbUser.email || ''));
      }
    }

    if (usePgUsers()) {
      try {
        await upsertUserPG({
          email: dbUser.email,
          name: dbUser.name,
          username: '',
          contactNumber: '',
          role: 'client',
          provider: 'microsoft',
        });
      } catch (e) {
        console.error('Microsoft callback upsertUserPG', e);
      }
    }

    // Resolve role from our user directory (same source as Google) — prefer admin if duplicate rows exist
    let role = 'client';
    if (usePgUsers()) {
      try {
        const r = await pgQuery(
          `SELECT role FROM public."DataPortalUsers" WHERE LOWER(email) = $1
           ORDER BY (role = 'admin') DESC NULLS LAST, id LIMIT 1`,
          [emailNorm]
        );
        if (r?.rows?.[0]?.role === 'admin') role = 'admin';
      } catch (e) {
        console.error('Microsoft callback get role', e);
      }
    } else {
      role = await getRoleForEmailAsync(dbUser.email);
    }

    req.session.user = {
      id:       dbUser.id,
      email:    dbUser.email,
      name:     dbUser.name,
      provider: "microsoft",
      role,
    };

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.redirect(FRONT_END_URL + "?auth_error=session_failed");
      }
      const flowSaved = req.session.msFlow || 'login';
      req.session.msFlow = null;
    
      if (flowSaved === 'register') {
        // Send back to register page with pre-filled details
        return res.redirect(
          `http://localhost:3000/html/front-pages/register.html?logged_in=1&email=${encodeURIComponent(dbUser.email)}&name=${encodeURIComponent(dbUser.name || '')}&provider=microsoft`
        );
      }
      // Normal login flow — go to landing page
      const url = new URL(FRONT_END_URL);
      url.searchParams.set("logged_in", "1");
      url.searchParams.set("email", dbUser.email);
      res.redirect(url.toString());
    });

  } catch (err) {
    console.error("Microsoft callback error:", err);
    res.redirect(FRONT_END_URL + "?auth_error=microsoft_auth_failed");
  }
});

// Logout: destroy express session (local/Microsoft).
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("logout session.destroy", err);
    res.json({ success: true });
  });
});

// GET /api/auth/sign-out: clear express and Better Auth sessions, then redirect to callbackURL (avoids 404 from Better Auth's internal path).
app.get("/api/auth/sign-out", async (req, res) => {
  const callbackURL = (req.query.callbackURL || FRONT_END_URL).toString();
  req.session.destroy(() => {});
  try {
    await auth.api.signOut({ headers: fromNodeHeaders(req.headers) });
  } catch (e) {
    console.error("sign-out Better Auth", e);
  }
  res.redirect(302, callbackURL);
});

// Check if the currently logged-in user has completed registration
app.get("/api/auth/check-registered", async (req, res) => {
  try {
    // Check Better Auth session (Google users)
    const betterAuthSession = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    let email = null;
    let provider = null;

    if (betterAuthSession?.user) {
      email = betterAuthSession.user.email;
      provider = 'google';
    } else if (req.session?.user) {
      email = req.session.user.email;
      provider = req.session.user.provider;
    }

    if (!email) {
      return res.json({ registered: false });
    }

    // Local/email users are always fully registered
    if (provider === 'local') {
      return res.json({ registered: true });
    }

    // One email = one account: already registered if this email exists in DataPortalUsers / users.json
    // (prevents same email from having two accounts via Google and Microsoft)
    const users = await getUsersAsync();
    const found = users.some(u => (u.email || '').toLowerCase() === email.toLowerCase());
    return res.json({ registered: !!found });
  } catch (e) {
    console.error("check-registered error:", e);
    res.json({ registered: false });
  }
});

// Mount Better Auth (must be after our custom auth routes)
app.all("/api/auth/*", toNodeHandler(auth));

// JSON body parsing for all other routes
app.use(express.json());

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

// ---- Protect routes: upload requires login; admin requires admin role ----
app.use('/api/admin', requireAuth, requireAdmin);
app.use('/api/upload', requireAuth);

// ---- Admin: list users and promote a user to admin (DataPortalUsers when PG, else users.json) ----
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await getUsersAsync();
    const list = users.map(u => ({
      email: u.email || '',
      name: u.name || '',
      username: u.username || '',
      role: u.role === 'admin' ? 'admin' : 'client',
    }));
    res.json(list);
  } catch (e) {
    console.error('GET /api/admin/users', e);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

app.post('/api/admin/users/promote', express.json(), async (req, res) => {
  const email = (req.body && req.body.email || '').trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required.' });
  }
  try {
    if (usePgUsers()) {
      const updated = await updateUserRolePG(email, 'admin');
      if (!updated) {
        return res.status(404).json({ success: false, message: 'User not found. Only users in the Data Portal (DataPortalUsers table) can be promoted.' });
      }
      return res.json({ success: true, message: email + ' is now an admin.' });
    }
    const users = readUsers();
    const idx = users.findIndex(u => (u.email || '').toLowerCase() === email);
    if (idx < 0) {
      return res.status(404).json({ success: false, message: 'User not found. Only users in the Data Portal (users.json) can be promoted.' });
    }
    users[idx].role = 'admin';
    writeUsers(users);
    res.json({ success: true, message: email + ' is now an admin.' });
  } catch (e) {
    console.error('POST /api/admin/users/promote', e);
    res.status(500).json({ success: false, message: 'Failed to update role.' });
  }
});

// ---- Admin: upload thumbnail image for a map pin (overview map + showcase). Returns URL to store in MapData.thumbNailUrl. ----
fs.mkdirSync(MAP_THUMBNAIL_DIR, { recursive: true });
const mapThumbStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MAP_THUMBNAIL_DIR),
  filename: (req, file, cb) => {
    const id = (req.body && req.body.mapDataID || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'pin';
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, id + '_' + Date.now() + safeExt);
  }
});
const uploadMapThumb = multer({ storage: mapThumbStorage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB
app.post('/api/admin/upload-map-thumbnail', (req, res, next) => {
  uploadMapThumb.single('thumbnail')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'File too large. Maximum size is 5MB.' });
      if (err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ success: false, message: 'Use the thumbnail file field.' });
      console.error('upload-map-thumbnail multer error:', err.code || err.message, err.stack || '');
      const msg = err.code === 'ENOENT' ? 'Upload folder missing.' : err.code === 'EACCES' ? 'Permission denied writing thumbnail.' : (err.message || 'Thumbnail upload failed.');
      return res.status(400).json({ success: false, message: msg });
    }
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No thumbnail file uploaded.' });
    const url = '/uploads/map-thumbnails/' + req.file.filename;
    res.json({ success: true, url, message: 'Thumbnail uploaded.' });
  } catch (e) {
    console.error('upload-map-thumbnail handler error:', e);
    res.status(500).json({ success: false, message: e.message || 'Thumbnail upload failed.' });
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
        `INSERT INTO public."MapData" ("mapDataID", title, description, "xAxis", "yAxis", "3dTiles", "thumbNailUrl", "updateDateTime")
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

// ---- Admin: sync MapData from data/locations.json (so all map pins appear in Manage Map Pins) ----
app.all('/api/admin/seed-mapdata-from-locations', function (req, res, next) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed. Use POST to sync.' });
  next();
});
app.post('/api/admin/seed-mapdata-from-locations', async (req, res) => {
  const locationsPath = path.join(PROJECT_ROOT, 'data', 'locations.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Could not read data/locations.json: ' + (e.message || '') });
  }
  const locations = data.locations || [];
  if (!locations.length) {
    return res.json({ success: true, upserted: 0, message: 'No locations in data/locations.json.' });
  }
  let upserted = 0;
  if (process.env.PG_DATABASE) {
    for (const loc of locations) {
      const mapDataID = (loc.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
      if (!mapDataID) continue;
      const title = (loc.name || mapDataID).trim();
      const description = (loc.description || '').trim();
      const lat = loc.coordinates && loc.coordinates.latitude != null ? Number(loc.coordinates.latitude) : null;
      const lon = loc.coordinates && loc.coordinates.longitude != null ? Number(loc.coordinates.longitude) : null;
      const tileset = (loc.dataPaths && loc.dataPaths.tileset) || (loc.tileset) || '';
      const thumb = (loc.previewImage || loc.thumbNailUrl || '').trim() || null;
      if (!tileset || lat == null || lon == null || isNaN(lat) || isNaN(lon)) continue;
      try {
        await pgQuery(
          `INSERT INTO public."MapData" ("mapDataID", title, description, "xAxis", "yAxis", "3dTiles", "thumbNailUrl", "updateDateTime")
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT ("mapDataID") DO UPDATE SET
             title = EXCLUDED.title, description = EXCLUDED.description, "xAxis" = EXCLUDED."xAxis", "yAxis" = EXCLUDED."yAxis",
             "3dTiles" = EXCLUDED."3dTiles", "thumbNailUrl" = EXCLUDED."thumbNailUrl", "updateDateTime" = EXCLUDED."updateDateTime"`,
          [mapDataID, title, description, lon, lat, tileset, thumb]
        );
        upserted++;
      } catch (e) {
        console.error('seed-mapdata upsert', mapDataID, e.message);
      }
    }
    return res.json({ success: true, upserted, message: 'Synced ' + upserted + ' pins from data/locations.json into the database.' });
  }
  res.json({ success: false, message: 'PostgreSQL is not configured. Run npm run seed-mapdata from the project root instead.' });
});

// ---- Admin: delete map pin (overview map only; showcase is independent – remove from showcase only via Manage Showcase). ----
app.delete('/api/map-data/:id', async (req, res) => {
  const id = (req.params.id || '').trim();
  if (!id) return res.status(400).json({ success: false, message: 'Missing id.' });
  try {
    if (process.env.PG_DATABASE) {
      const r = await pgQuery('DELETE FROM public."MapData" WHERE "mapDataID" = $1 RETURNING "mapDataID"', [id]);
      if (!r || !r.rows || r.rows.length === 0) return res.status(404).json({ success: false, message: 'Map data not found.' });
      return res.json({ success: true, mapDataID: id, message: 'Pin removed from map. It remains in the showcase until you remove it there.' });
    }
    const rows = readMapData();
    const idx = rows.findIndex(r => (r.mapDataID || '').toString() === id);
    if (idx < 0) return res.status(404).json({ success: false, message: 'Map data not found.' });
    rows.splice(idx, 1);
    if (mapDataDb) {
      mapDataDb.run('DELETE FROM MapData WHERE mapDataID = ?', [id]);
    } else {
      fs.writeFileSync(MAPDATA_FILE, JSON.stringify(rows, null, 2), 'utf8');
    }
    res.json({ success: true, mapDataID: id, message: 'Pin removed from map.' });
  } catch (e) {
    console.error('DELETE /api/map-data/:id', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to delete.' });
  }
});

// ---- Admin: sync Showcase from data/locations.json (same locations as map; showcase stays independent of map delete). ----
app.all('/api/admin/seed-showcase-from-locations', function (req, res, next) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed. Use POST to sync showcase from locations.json.' });
  next();
});
app.post('/api/admin/seed-showcase-from-locations', async (req, res) => {
  const locationsPath = path.join(PROJECT_ROOT, 'data', 'locations.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(locationsPath, 'utf8'));
  } catch (e) {
    return res.status(400).json({ success: false, message: 'Could not read data/locations.json: ' + (e.message || '') });
  }
  const locations = data.locations || [];
  if (!locations.length) return res.json({ success: true, added: 0, message: 'No locations in data/locations.json.' });
  if (!process.env.PG_DATABASE) return res.json({ success: false, message: 'PostgreSQL is required for Showcase.' });
  let added = 0;
  try {
    const existing = await pgQuery('SELECT map_data_id FROM public."Showcase"');
    const existingIds = new Set((existing && existing.rows ? existing.rows : []).map(r => (r.map_data_id || '').toString()));
    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      const mapDataId = (loc.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
      if (!mapDataId || existingIds.has(mapDataId)) continue;
      await pgQuery('INSERT INTO public."Showcase" (map_data_id, display_order) VALUES ($1, $2)', [mapDataId, i]);
      existingIds.add(mapDataId);
      added++;
    }
    return res.json({ success: true, added, message: 'Synced ' + added + ' locations from data/locations.json into the showcase.' });
  } catch (e) {
    console.error('POST /api/admin/seed-showcase-from-locations', e);
    return res.status(500).json({ success: false, message: e.message || 'Failed to sync showcase.' });
  }
});

// ---- Admin: renumber all showcase display_order to 0, 1, 2, ... (fix duplicates or 1-based data). ----
app.post('/api/admin/showcase-renumber', async (req, res) => {
  if (!process.env.PG_DATABASE) return res.status(501).json({ success: false, message: 'PostgreSQL required.' });
  try {
    const all = await pgQuery(
      'SELECT id FROM public."Showcase" ORDER BY display_order ASC, id ASC'
    );
    const rows = (all && all.rows) ? all.rows : [];
    for (let i = 0; i < rows.length; i++) {
      await pgQuery('UPDATE public."Showcase" SET display_order = $1 WHERE id = $2', [i, rows[i].id]);
    }
    return res.json({ success: true, message: 'Renumbered ' + rows.length + ' showcase items to 0–' + (rows.length - 1) + '.' });
  } catch (e) {
    console.error('POST /api/admin/showcase-renumber', e);
    return res.status(500).json({ success: false, message: e.message || 'Failed to renumber.' });
  }
});

// ---- Showcase API (landing page tiles; independent from map pins). Requires PostgreSQL. ----
app.get('/api/showcase', async (req, res) => {
  if (!process.env.PG_DATABASE) return res.json([]);
  try {
    const q = await pgQuery(
      `SELECT s.id, s.map_data_id, s.display_order, s.created_at,
              m.title, m."thumbNailUrl", m."3dTiles"
       FROM public."Showcase" s
       LEFT JOIN public."MapData" m ON m."mapDataID" = s.map_data_id
       ORDER BY s.display_order ASC, s.id ASC`
    );
    const rows = (q && q.rows) ? q.rows : [];
    res.json(rows.map(r => ({
      id: r.id,
      map_data_id: r.map_data_id,
      display_order: r.display_order != null ? Number(r.display_order) : 0,
      created_at: r.created_at,
      title: r.title || r.map_data_id,
      thumbNailUrl: r.thumbNailUrl || '',
      '3dTiles': r['3dTiles'] || ''
    })));
  } catch (e) {
    console.error('GET /api/showcase', e);
    res.status(500).json({ error: 'Failed to load showcase.' });
  }
});

app.post('/api/showcase', express.json(), async (req, res) => {
  if (!process.env.PG_DATABASE) return res.status(501).json({ success: false, message: 'Showcase requires PostgreSQL.' });
  const map_data_id = (req.body.map_data_id || req.body.mapDataId || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  const display_order = req.body.display_order != null ? parseInt(req.body.display_order, 10) : 0;
  if (!map_data_id) return res.status(400).json({ success: false, message: 'map_data_id is required.' });
  try {
    const r = await pgQuery(
      'INSERT INTO public."Showcase" (map_data_id, display_order) VALUES ($1, $2) RETURNING id, map_data_id, display_order, created_at',
      [map_data_id, isNaN(display_order) ? 0 : display_order]
    );
    const row = r && r.rows && r.rows[0];
    if (!row) return res.status(500).json({ success: false, message: 'Insert failed.' });
    res.status(201).json({ success: true, id: row.id, map_data_id: row.map_data_id, display_order: row.display_order, created_at: row.created_at });
  } catch (e) {
    console.error('POST /api/showcase', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to add showcase item.' });
  }
});

app.put('/api/showcase/:id', express.json(), async (req, res) => {
  if (!process.env.PG_DATABASE) return res.status(501).json({ success: false, message: 'Showcase requires PostgreSQL.' });
  const id = parseInt(req.params.id, 10);
  if (!id || isNaN(id)) return res.status(400).json({ success: false, message: 'Valid showcase id required.' });
  const newOrder = req.body.display_order != null ? parseInt(req.body.display_order, 10) : undefined;
  if (newOrder === undefined || isNaN(newOrder)) return res.status(400).json({ success: false, message: 'display_order (0-based index) required.' });
  try {
    const all = await pgQuery(
      'SELECT id, map_data_id, display_order FROM public."Showcase" ORDER BY display_order ASC, id ASC'
    );
    const rows = (all && all.rows) ? all.rows : [];
    const idx = rows.findIndex(r => r.id === id);
    if (idx < 0) return res.status(404).json({ success: false, message: 'Showcase item not found.' });
    const item = rows[idx];
    const reordered = rows.filter((_, i) => i !== idx);
    const targetIndex = Math.max(0, Math.min(newOrder, reordered.length));
    reordered.splice(targetIndex, 0, item);
    for (let i = 0; i < reordered.length; i++) {
      await pgQuery('UPDATE public."Showcase" SET display_order = $1 WHERE id = $2', [i, reordered[i].id]);
    }
    res.json({ success: true, id: item.id, display_order: targetIndex });
  } catch (e) {
    console.error('PUT /api/showcase/:id', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to update.' });
  }
});

app.delete('/api/showcase/:id', async (req, res) => {
  if (!process.env.PG_DATABASE) return res.status(501).json({ success: false, message: 'Showcase requires PostgreSQL.' });
  const id = parseInt(req.params.id, 10);
  const from = (req.query.from || 'showcase_only').toLowerCase();
  if (!id || isNaN(id)) return res.status(400).json({ success: false, message: 'Valid showcase id required.' });
  if (from !== 'showcase_only' && from !== 'both') return res.status(400).json({ success: false, message: 'Query "from" must be showcase_only or both.' });
  try {
    const getRow = await pgQuery('SELECT id, map_data_id FROM public."Showcase" WHERE id = $1', [id]);
    if (!getRow || !getRow.rows || getRow.rows.length === 0) return res.status(404).json({ success: false, message: 'Showcase item not found.' });
    const map_data_id = getRow.rows[0].map_data_id;
    await pgQuery('DELETE FROM public."Showcase" WHERE id = $1', [id]);
    if (from === 'both' && map_data_id) {
      await pgQuery('DELETE FROM public."MapData" WHERE "mapDataID" = $1', [map_data_id]);
    }
    res.json({ success: true, id, message: from === 'both' ? 'Removed from showcase and from map.' : 'Removed from showcase.' });
  } catch (e) {
    console.error('DELETE /api/showcase/:id', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to delete.' });
  }
});

// ---- Client upload: store uploaded images and metadata (linked to upload-data page) ----
const fsPromises = fs.promises;
const crypto = require('crypto');

app.post('/api/upload/init', express.json(), async (req, res) => {
  try {
    const uploadId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    const tempDir = path.join(UPLOAD_DIR, `temp_${uploadId}`);
    await fsPromises.mkdir(tempDir, { recursive: true });

    // Store metadata for later finalization
    const metadataPath = path.join(tempDir, 'metadata.json');
    const metadata = {
      projectID: (req.body.projectID || '').trim() || `upload_${Date.now()}`,
      projectTitle: (req.body.projectTitle || '').trim(),
      projectDescription: (req.body.projectDescription || '').trim(),
      uploadType: (req.body.uploadType || req.body.cameraConfiguration || 'single').toLowerCase().includes('multiple') ? 'multiple' : 'single',
      cameraModels: (req.body.cameraModels || '').trim(),
      captureDate: (req.body.captureDate || '').trim(),
      organizationName: (req.body.organizationName || '').trim(),
      createdByEmail: (req.user && req.user.email) ? req.user.email : null,
      category: (req.body.category || '').trim(),
      latitude: req.body.latitude != null && req.body.latitude !== '' ? parseFloat(req.body.latitude) : null,
      longitude: req.body.longitude != null && req.body.longitude !== '' ? parseFloat(req.body.longitude) : null,
      areaCoverage: (req.body.areaCoverage || '').trim(),
      imageMetadata: (req.body.imageMetadata || '').trim(),
      totalFiles: req.body.totalFiles || 0,
      createdAt: new Date().toISOString()
    };

    await fsPromises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    res.json({ success: true, uploadId, message: 'Upload initialized' });
  } catch (e) {
    console.error('POST /api/upload/init', e);
    res.status(500).json({ success: false, message: 'Failed to initialize upload.' });
  }
});

// We need multer to handle the chunk file upload since it's multipart/form-data
const chunkStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadId = req.body.uploadId;
    if (!uploadId) return cb(new Error('Missing uploadId'));
    const tempDir = path.join(UPLOAD_DIR, `temp_${uploadId}`);
    try {
      await fsPromises.mkdir(tempDir, { recursive: true });
      cb(null, tempDir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    // Generate a temporary name for this specific chunk
    const filename = req.body.filename || 'unknown';
    const chunkIndex = req.body.chunkIndex || 0;
    // Keep it safe
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${safeFilename}.part${chunkIndex}`);
  }
});
const uploadChunkMulter = multer({ storage: chunkStorage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limits for 10MB chunks (extra padding for metadata)

app.post('/api/upload/chunk', (req, res) => {
  uploadChunkMulter.single('chunk')(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer Error in chunk upload:', err);
      return res.status(500).json({ success: false, message: 'Multer parsing error: ' + err.message });
    } else if (err) {
      console.error('Unknown Error in chunk upload:', err);
      return res.status(500).json({ success: false, message: 'Unknown parsing error: ' + err.message });
    }

    // Everything went fine with parsing
    try {
      const uploadId = req.body.uploadId;
      const filename = req.body.filename;
      const chunkIndex = parseInt(req.body.chunkIndex, 10);
      const totalChunks = parseInt(req.body.totalChunks, 10);

      if (!uploadId || !filename || isNaN(chunkIndex) || isNaN(totalChunks) || !req.file) {
        return res.status(400).json({ success: false, message: 'Missing required chunk parameters.' });
      }

      res.json({ success: true, message: `Chunk ${chunkIndex} received.` });
    } catch (e) {
      console.error('POST /api/upload/chunk saving error:', e);
      res.status(500).json({ success: false, message: 'Failed to save chunk.' });
    }
  });
});

app.post('/api/upload/finalize', express.json(), async (req, res) => {
  try {
    const uploadId = req.body.uploadId;
    if (!uploadId) return res.status(400).json({ success: false, message: 'Missing uploadId' });

    const tempDir = path.join(UPLOAD_DIR, `temp_${uploadId}`);
    const filesMapping = req.body.files; // Array of { filename, totalChunks }

    if (!filesMapping || !Array.isArray(filesMapping)) {
      return res.status(400).json({ success: false, message: 'Missing files mapping array' });
    }

    const finalSubdir = `project_${Date.now()}_${uploadId.substring(0, 6)}`;
    const finalDir = path.join(UPLOAD_DIR, finalSubdir);
    await fsPromises.mkdir(finalDir, { recursive: true });

    const finalFilePaths = [];
    let dronePosFilePath = null;
    let actualFileCount = 0;

    // Assemble each file
    for (const fileDef of filesMapping) {
      const safeFilename = fileDef.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const finalFilePath = path.join(finalDir, safeFilename);

      // Create a write stream for the final file
      const writeStream = fs.createWriteStream(finalFilePath);

      let assemblyFailed = false;
      for (let i = 0; i < fileDef.totalChunks; i++) {
        const chunkPath = path.join(tempDir, `${safeFilename}.part${i}`);
        try {
          await new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(chunkPath);
            readStream.on('error', reject);
            readStream.on('end', resolve);
            readStream.pipe(writeStream, { end: false });
          });
        } catch (e) {
          console.error(`Missing chunk ${i} for file ${safeFilename} in upload ${uploadId}`, e);
          assemblyFailed = true;
          break;
        }
      }

      writeStream.end();

      if (assemblyFailed) {
        return res.status(400).json({ success: false, message: `Failed to assemble file ${fileDef.filename}. Missing chunks.` });
      }

      // File assembled successfully
      const relativePath = `${process.env.UPLOAD_DIR || 'uploads'}/${finalSubdir}/${safeFilename}`;

      if (safeFilename.toLowerCase().endsWith('.txt') || safeFilename.toLowerCase().endsWith('.csv')) {
        dronePosFilePath = relativePath.replace(/\\/g, '/');
      } else {
        finalFilePaths.push(relativePath.replace(/\\/g, '/'));
        actualFileCount++;
      }
    }

    // Read metadata
    const metadataPath = path.join(tempDir, 'metadata.json');
    let metadata = {};
    try {
      const metaStr = await fsPromises.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(metaStr);
    } catch (e) {
      console.warn("Could not read metadata for", uploadId);
    }

    if (!metadata.projectTitle) metadata.projectTitle = metadata.projectID;

    // Save to DB
    if (process.env.PG_DATABASE) {
      await pgQuery(
        `INSERT INTO public."ClientUploads" (project_id, project_title, upload_type, file_count, file_paths, camera_models, capture_date, organization_name, created_by_email, project_description, category, latitude, longitude, area_coverage, image_metadata, drone_pos_file_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
        [
          metadata.projectID, metadata.projectTitle, metadata.uploadType, actualFileCount,
          finalFilePaths.length ? finalFilePaths : null, metadata.cameraModels, metadata.captureDate || null,
          metadata.organizationName, metadata.createdByEmail, metadata.projectDescription, metadata.category,
          isNaN(metadata.latitude) ? null : metadata.latitude, isNaN(metadata.longitude) ? null : metadata.longitude,
          metadata.areaCoverage, metadata.imageMetadata, dronePosFilePath
        ]
      );
    }

    // Cleanup temporary directory
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.warn("Failed to cleanup temp dir", tempDir, e);
    }

    console.log("[upload] Client upload saved: " + actualFileCount + " files at " + finalDir + " (Admin can download from Client Uploads)");
    res.json({ success: true, message: 'Upload successfully assembled and saved.', projectId: metadata.projectID, fileCount: actualFileCount });

  } catch (e) {
    console.error('POST /api/upload/finalize', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to finalize upload.' });
  }
});

// ---- Admin: list client uploads ----
app.get('/api/admin/client-uploads', async (req, res) => {
  if (!process.env.PG_DATABASE) {
    return res.json([]);
  }
  try {
    const q = await pgQuery('SELECT id, project_id, project_title, upload_type, file_count, file_paths, camera_models, capture_date, organization_name, created_at, created_by_email, request_status, rejected_reason, decided_at, decided_by, project_description, category, latitude, longitude, area_coverage, image_metadata, drone_pos_file_path FROM public."ClientUploads" ORDER BY created_at DESC');
    res.json((q && q.rows) ? q.rows : []);
  } catch (e) {
    console.error('GET /api/admin/client-uploads', e);
    res.status(500).json({ error: 'Failed to load client uploads.' });
  }
});

// Parse file_paths from DB: may be array or string (PG array literal or JSON)
function parseFilePaths(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value == null || value === '') return [];
  const s = String(value).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch (_) { /* not JSON */ }
  // PostgreSQL array literal: {"a","b"} or {a,b}
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1);
    return inner.split(',').map((x) => x.replace(/^"|"$/g, '').trim()).filter(Boolean);
  }
  return [s];
}

// Resolve to absolute path and ensure it is under a allowed directory (for security).
function resolveUnderDir(rel, baseDir) {
  const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\))+/, '');
  return path.resolve(baseDir, normalized);
}
function isPathUnderDir(fullPath, allowedDir) {
  const full = path.resolve(fullPath);
  const dir = path.resolve(allowedDir);
  const dirWithSep = dir.endsWith(path.sep) ? dir : dir + path.sep;
  return full === dir || full.startsWith(dirWithSep);
}

// ---- Admin: download all uploaded files for a client upload (ZIP) ----
app.get('/api/admin/client-uploads/:id/download', async (req, res) => {
  const id = req.params.id && parseInt(req.params.id, 10);
  if (!id || isNaN(id) || !process.env.PG_DATABASE) {
    return res.status(400).json({ success: false, message: 'Valid upload id is required.' });
  }
  try {
    const q = await pgQuery('SELECT id, project_id, project_title, COALESCE(to_json(file_paths), \'[]\'::json) AS file_paths, drone_pos_file_path FROM public."ClientUploads" WHERE id = $1', [id]);
    const row = q && q.rows && q.rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Client upload not found.' });
    const filePaths = parseFilePaths(row.file_paths);
    const dronePath = (row.drone_pos_file_path || '').trim();
    if (dronePath) filePaths.push(dronePath);
    const filesToAdd = [];
    const uploadDirResolved = path.resolve(UPLOAD_DIR);
    const projectRootResolved = path.resolve(PROJECT_ROOT);
    for (const rel of filePaths) {
      const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\))+/, '');
      const candidates = [
        resolveUnderDir(normalized, projectRootResolved),
        path.join(uploadDirResolved, normalized),
        path.join(uploadDirResolved, normalized.replace(/^([^/\\]+[/\\])+/, ''))
      ];
      const seen = new Set();
      for (const full of candidates) {
        const fullResolved = path.resolve(full);
        if (seen.has(fullResolved)) continue;
        seen.add(fullResolved);
        if (!isPathUnderDir(fullResolved, uploadDirResolved) && !isPathUnderDir(fullResolved, projectRootResolved)) continue;
        try {
          const stat = await fs.promises.stat(fullResolved);
          if (stat.isFile()) {
            filesToAdd.push({ full: fullResolved, name: path.basename(fullResolved) });
            break;
          }
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn('[download] Upload #%s path "%s" -> %s: %s', id, rel, fullResolved, err.code || err.message);
          }
        }
      }
    }
    if (filesToAdd.length === 0) {
      console.warn('[download] Upload #%s: no files found. DB file_paths=%s, drone_pos_file_path=%s. UPLOAD_DIR=%s, PROJECT_ROOT=%s. Parsed paths: %s',
        id, JSON.stringify(row.file_paths), dronePath || '(none)', uploadDirResolved, projectRootResolved, JSON.stringify(filePaths));
      return res.status(404).json({ success: false, message: 'No files found for this upload. Check that file_paths in the database point to existing files under the uploads directory.' });
    }
    let archiver;
    try {
      archiver = (await import('archiver')).default;
    } catch (e) {
      return res.status(503).json({ success: false, message: 'Download requires the archiver package. Run: npm install archiver' });
    }
    const zipName = 'upload-' + id + '-' + (row.project_id || 'files').replace(/[^a-zA-Z0-9_-]/g, '_') + '.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + zipName + '"');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (e) => {
      console.error('archiver error', e);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);
    for (const { full, name } of filesToAdd) {
      archive.file(full, { name });
    }
    await archive.finalize();
  } catch (e) {
    console.error('GET /api/admin/client-uploads/:id/download', e);
    if (!res.headersSent) res.status(500).json({ success: false, message: e.message || 'Download failed.' });
  }
});

// ---- Admin: accept or reject a client upload request ----
app.post('/api/admin/client-uploads/:id/decision', express.json(), async (req, res) => {
  const id = req.params.id && parseInt(req.params.id, 10);
  const action = (req.body && (req.body.action || req.body.decision)) || '';
  const reason = (req.body && (req.body.reason || req.body.rejected_reason || '')) || '';
  if (!id || isNaN(id) || !process.env.PG_DATABASE) {
    return res.status(400).json({ success: false, message: 'Valid upload id is required and PostgreSQL must be configured.' });
  }
  const actionLower = String(action).toLowerCase();
  if (actionLower !== 'accept' && actionLower !== 'reject') {
    return res.status(400).json({ success: false, message: 'action must be "accept" or "reject".' });
  }
  if (actionLower === 'reject' && !reason.trim()) {
    return res.status(400).json({ success: false, message: 'A reason is required when rejecting a request.' });
  }
  const decidedBy = (req.user && req.user.email) ? req.user.email : (req.body && req.body.decided_by) || 'admin';
  try {
    const r = await pgQuery(
      `UPDATE public."ClientUploads" SET request_status = $1, rejected_reason = $2, decided_at = NOW(), decided_by = $3 WHERE id = $4 RETURNING id, request_status, decided_at`,
      [actionLower === 'accept' ? 'accepted' : 'rejected', actionLower === 'reject' ? reason.trim() : null, decidedBy, id]
    );
    const row = r && r.rows && r.rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Client upload not found.' });
    res.json({ success: true, id: row.id, request_status: row.request_status, decided_at: row.decided_at });
  } catch (e) {
    console.error('POST /api/admin/client-uploads/:id/decision', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to update decision.' });
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
      `SELECT pr.id, pr.upload_id, pr.status, pr.requested_at, pr.requested_by, pr.completed_at, pr.result_tileset_url, pr.notes, pr.delivered_at, pr.delivery_notes
       FROM public."ProcessingRequests" pr ORDER BY pr.requested_at DESC`
    );
    res.json((q && q.rows) ? q.rows : []);
  } catch (e) {
    console.error('GET /api/admin/processing-requests', e);
    res.status(500).json({ error: 'Failed to load processing requests.' });
  }
});

// ---- Admin: mark processing request as delivered to client ----
app.post('/api/admin/processing-requests/:id/delivery', express.json(), async (req, res) => {
  const id = req.params.id && parseInt(req.params.id, 10);
  if (!id || isNaN(id) || !process.env.PG_DATABASE) {
    return res.status(400).json({ success: false, message: 'Valid processing request id is required and PostgreSQL must be configured.' });
  }
  const deliveryNotes = (req.body && (req.body.delivery_notes || req.body.notes || '')).trim() || null;
  try {
    const r = await pgQuery(
      `UPDATE public."ProcessingRequests" SET delivered_at = COALESCE(delivered_at, NOW()), delivery_notes = COALESCE($1, delivery_notes) WHERE id = $2 RETURNING id, delivered_at, delivery_notes`,
      [deliveryNotes, id]
    );
    const row = r && r.rows && r.rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Processing request not found.' });
    res.json({ success: true, id: row.id, delivered_at: row.delivered_at, delivery_notes: row.delivery_notes });
  } catch (e) {
    console.error('POST /api/admin/processing-requests/:id/delivery', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to update delivery.' });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve front-end (HTML, assets) from project root so landing page works with npm start
app.use(express.static(PROJECT_ROOT));
// Open http://localhost:3000/ or http://127.0.0.1:3000/ → landing page
app.get('/', (req, res) => res.redirect('/html/front-pages/landing-page.html'));
// Admin portal: ensure /admin and /html/admin-data-portal open the dashboard
app.get('/admin', (req, res) => res.redirect('/html/admin-data-portal/index.html'));
app.get('/html/admin-data-portal', (req, res) => res.redirect('/html/admin-data-portal/index.html'));

// Load SQLite MapData DB (Temadigital_Data_Portal.MapData) if file exists
function startServer() {
  const server = app.listen(PORT, () => {
    console.log('Auth server running on http://localhost:' + PORT + ' (or http://127.0.0.1:' + PORT + ')');
    console.log('  Landing page: http://localhost:' + PORT + '/');
    console.log('  Admin portal: http://localhost:' + PORT + '/html/admin-data-portal/index.html');
    if (process.env.PG_DATABASE) console.log('  MapData & admin: using PostgreSQL database ' + process.env.PG_DATABASE);
    else if (mapDataDb) console.log('  MapData: using SQLite (table MapData)');
    else console.log('  MapData: using data/map-data.json (run npm run create-db to create SQLite DB)');
  console.log('  Google (Better Auth): GET http://localhost:' + PORT + '/api/auth/google');
  if (googleClientId && googleClientSecret) {
    console.log('  Google callback URL (set this in Google Cloud Console):', baseURL + '/api/auth/callback/google');
    console.log('  Google credentials: Client ID length', googleClientId.length, '| Secret length', googleClientSecret.length);
    if (googleClientSecret.startsWith('GOCSPX--')) {
      console.warn('  >>> WARNING: Secret starts with GOCSPX-- (double hyphen). In Google Cloud, secrets usually have ONE hyphen (GOCSPX-). If sign-in fails, re-copy the Client secret from Credentials.');
    }
  }
  if (!googleClientId || !googleClientSecret) console.log('  (Google not configured – set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env)');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('\n  Port ' + PORT + ' is already in use. Stop the other process using it, then run npm start again.');
      console.error('  On Windows (PowerShell): Get-NetTCPConnection -LocalPort ' + PORT + ' | Select-Object OwningProcess');
      console.error('  Then: Stop-Process -Id <PID> -Force\n');
      process.exit(1);
    }
    throw err;
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

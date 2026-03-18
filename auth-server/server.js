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
import Stripe from "stripe";
import { auth, baseURL, frontEndUrl, googleClientId, googleClientSecret } from "./auth.config.js";
import { getMicrosoftAuthUrl, handleMicrosoftCallback } from "./microsoftAuth.js";
import { Upload } from '@aws-sdk/lib-storage';
import SftpClient from 'ssh2-sftp-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env"), override: true });

const require = createRequire(import.meta.url);
const { query: pgQuery } = require("./db/pg.cjs");

const USERS_FILE = path.join(__dirname, "data", "users.json");
const MAPDATA_FILE = path.join(__dirname, 'data', 'map-data.json');
const MAPDATA_DB_PATH = path.join(__dirname, 'data', 'Temadigital_Data_Portal.sqlite');
const PROJECT_ROOT = path.join(__dirname, '..');
const UPLOAD_DIR = path.join(PROJECT_ROOT, process.env.UPLOAD_DIR || 'uploads');
console.log('[startup] __dirname:', __dirname);
console.log('[startup] PROJECT_ROOT:', PROJECT_ROOT);
console.log('[startup] UPLOAD_DIR:', UPLOAD_DIR);
const MAP_THUMBNAIL_DIR = path.join(PROJECT_ROOT, 'uploads', 'map-thumbnails');
const PROCESSED_RESULTS_DIR = path.join(UPLOAD_DIR, 'processed-results');

// ---- Stripe + token config (for subscriber uploads and 3D model purchases) ----
const TOKEN_MYR_RATE = Number(process.env.TOKEN_MYR_RATE || '2'); // 1 token = 2 MYR by default
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  try {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });
    console.log('[startup] Stripe initialized for token top-ups.');
  } catch (e) {
    console.error('[startup] Failed to init Stripe:', e.message || e);
    stripe = null;
  }
} else {
  console.log('[startup] Stripe not configured (STRIPE_SECRET_KEY not set) – token top-ups disabled until configured.');
}

const remoteSftpConfig = {
  host: process.env.REMOTE_SFTP_HOST,
  port: parseInt(process.env.REMOTE_SFTP_PORT || '22', 10),
  username: process.env.REMOTE_SFTP_USER,
  password: process.env.REMOTE_SFTP_PASS
};

async function getRemoteSftpClient() {
  if (!remoteSftpConfig.host) return null;
  const sftp = new SftpClient();
  
  // Attach an empty error listener to override the default "Global error listener" spam 
  // that happens when the SSH socket drops automatically (ECONNRESET)
  sftp.on('error', () => {});

  try {
    await sftp.connect(remoteSftpConfig);
    return sftp;
  } catch (err) {
    console.error('[sftp] Connection failed:', err.message);
    return null;
  }
}


// Helper: convert a readable stream to a Buffer
async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

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

/** Get role for an email. Uses DataPortalUsers when PG is set (with users.json fallback), else users.json only.
 *  Returns "admin" | "subscriber" | "client". Prefer admin, then subscriber, then client. */
async function getRoleForEmailAsync(email) {
  if (!email) return 'client';
  const emailNorm = String(email).trim().toLowerCase();

  if (usePgUsers()) {
    try {
      const r = await pgQuery(
        `SELECT role FROM public."DataPortalUsers" WHERE LOWER(email) = $1
         ORDER BY (role = 'admin') DESC, (role = 'subscriber') DESC NULLS LAST, id LIMIT 1`,
        [emailNorm]
      );
      const role = r?.rows?.[0]?.role;
      if (role !== undefined && role !== null) {
        if (role === 'admin') return 'admin';
        if (role === 'subscriber') return 'subscriber';
        return 'client';
      }
    } catch (e) {
      console.error('getRoleForEmail PG', e);
    }
  }

  try {
    const users = readUsers();
    const u = users.find(x => (x.email || '').toLowerCase() === emailNorm);
    if (u) {
      if (u.role === 'admin') return 'admin';
      if (u.role === 'subscriber') return 'subscriber';
    }
    return 'client';
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
  if (!u) return 'client';
  if (u.role === 'admin') return 'admin';
  if (u.role === 'subscriber') return 'subscriber';
  return 'client';
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
        role: row.role === 'admin' ? 'admin' : (row.role === 'subscriber' ? 'subscriber' : 'client'),
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

// ---- Token wallet helpers (PostgreSQL only) ----

/** Ensure we are in PostgreSQL mode for wallet operations. */
function ensurePgForWallet() {
  if (!usePgUsers()) {
    const err = new Error('Token wallet requires PostgreSQL (PG_DATABASE must be set).');
    err.statusCode = 500;
    throw err;
  }
}

/** Get or create a TokenWallet row for the given email. */
async function getOrCreateWallet(email) {
  ensurePgForWallet();
  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm) throw new Error('Missing email for wallet.');
  const existing = await pgQuery(
    'SELECT id, user_email, token_balance FROM public."TokenWallet" WHERE LOWER(user_email) = $1 LIMIT 1',
    [emailNorm]
  );
  let row = existing?.rows?.[0];
  if (!row) {
    const ins = await pgQuery(
      'INSERT INTO public."TokenWallet" (user_email, token_balance) VALUES ($1, 0) RETURNING id, user_email, token_balance',
      [emailNorm]
    );
    row = ins?.rows?.[0];
  }
  return {
    id: row.id,
    email: row.user_email,
    balance: Number(row.token_balance || 0),
  };
}

/** Create a token transaction and update wallet balance atomically. Returns { transactionId, balance }. */
async function applyTokenDelta(email, amount, type, options = {}) {
  ensurePgForWallet();
  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm) throw new Error('Missing email for wallet.');
  const delta = Number(amount);
  if (!delta || !isFinite(delta)) throw new Error('Invalid token amount.');

  const client = await pgQuery('BEGIN').then(() => pgQuery); // reuse pgQuery; relies on single connection pool
  try {
    const wallet = await getOrCreateWallet(emailNorm);
    const newBalance = wallet.balance + delta;
    if (newBalance < 0) {
      throw Object.assign(new Error('Insufficient token balance.'), { statusCode: 400 });
    }
    await pgQuery(
      'UPDATE public."TokenWallet" SET token_balance = $1, updated_at = NOW() WHERE id = $2',
      [newBalance, wallet.id]
    );
    const ins = await pgQuery(
      `INSERT INTO public."TokenTransactions"
       (user_email, amount, balance_after, type, reference_type, reference_id, stripe_payment_intent_id, myr_amount, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        emailNorm,
        delta,
        newBalance,
        type,
        options.referenceType || null,
        options.referenceId || null,
        options.stripePaymentIntentId || null,
        options.myrAmount != null ? Number(options.myrAmount) : null,
        options.metadata ? JSON.stringify(options.metadata) : null,
      ]
    );
    await pgQuery('COMMIT');
    const txId = ins?.rows?.[0]?.id;
    return { transactionId: txId, balance: newBalance };
  } catch (e) {
    try { await pgQuery('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

/** Simple helper to compute how many tokens correspond to a MYR amount at current rate. */
function tokensFromMyr(amountMyr) {
  const a = Number(amountMyr || 0);
  if (!a || !isFinite(a) || a <= 0 || !TOKEN_MYR_RATE) return 0;
  return a / TOKEN_MYR_RATE;
}

/** Simple helper to compute MYR price for a token amount. */
function myrFromTokens(tokens) {
  const t = Number(tokens || 0);
  if (!t || !isFinite(t) || t <= 0 || !TOKEN_MYR_RATE) return 0;
  return t * TOKEN_MYR_RATE;
}

// ---- SFTP Account Auto-Creation (SFTPGo API) ----

const SFTP_API_BASE = 'https://sg-dp-tdsb.geovidia.my/api/v2';
const SFTP_ADMIN_USER = 'dataportal_admin';
const SFTP_ADMIN_PASS = process.env.SFTP_ADMIN_PASSWORD || '';

/** Step 1: Get SFTPGo access token using Basic Auth */
async function getSftpToken() {
  const credentials = Buffer.from(`${SFTP_ADMIN_USER}:${SFTP_ADMIN_PASS}`).toString('base64');
  const response = await fetch(`${SFTP_API_BASE}/token`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json'
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to get SFTP token: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.access_token) {
    throw new Error('No access_token in SFTP token response.');
  }
  return data.access_token;
}

/** Generate a random strong password */
function generateSftpPassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/** Generate SFTP username from full name (lowercase, no spaces, max 30 chars) */
function generateSftpUsername(fullName, email) {
  // Try to use full name first
  let base = (fullName || '').trim()
    .toLowerCase()
    .replace(/\s+/g, '_')        // spaces to underscores
    .replace(/[^a-z0-9_]/g, '')  // remove special chars
    .slice(0, 24);

  // Fallback to email local part if name is too short
  if (base.length < 3) {
    base = (email || '').split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 24);
  }

  // Add random suffix to avoid duplicates
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}_${suffix}`.slice(0, 30);
}

/** Step 2: Create SFTPGo user account */
async function createSftpUser(accessToken, { username, email, password }) {
  const homeDir = `C:\\SFTPGo\\${username}`;
  const body = {
    username: username,
    email: email,
    password: password,
    has_password: true,
    status: 1,
    home_dir: homeDir,
    groups: [
      {
        name: "Data Portal User",
        type: 1
      }
    ],
    virtual_folders: [],
    permissions: {
      "/": ["*"]
    }
  };

  const response = await fetch(`${SFTP_API_BASE}/users`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create SFTP user: ${response.status} - ${errText}`);
  }

  return await response.json();
}

/** Main function: create SFTP account for a new portal user */
async function autoCreateSftpAccount(fullName, email) {
  try {
    // Step 1: Get token
    const accessToken = await getSftpToken();

    // Step 2: Generate credentials
    const sftpUsername = generateSftpUsername(fullName, email);
    const sftpPassword = generateSftpPassword(12);

    // Step 3: Create user
    await createSftpUser(accessToken, {
      username: sftpUsername,
      email: email,
      password: sftpPassword
    });

    console.log(`[sftp] Created SFTP account for ${email}: username=${sftpUsername}`);

    return {
      success: true,
      sftpUsername,
      sftpPassword
    };
  } catch (e) {
    // Don't block registration if SFTP fails — just log it
    console.error('[sftp] Failed to create SFTP account:', e.message);
    return { success: false, error: e.message };
  }
}

/** Tokens required for a client upload: 1 token per 50 images (or part thereof), minimum 1. Configurable via env UPLOAD_TOKENS_PER_IMAGE (default 50). */
function computeUploadTokens(fileCount) {
  const n = Math.max(0, parseInt(String(fileCount), 10) || 0);
  const per = Math.max(1, parseInt(process.env.UPLOAD_TOKENS_PER_IMAGE || '50', 10) || 50);
  return Math.max(1, Math.ceil(n / per));
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
      (user.role === 'admin' ? 'admin' : (user.role === 'subscriber' ? 'subscriber' : 'client')),
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
      (user.role === 'admin' ? 'admin' : (user.role === 'subscriber' ? 'subscriber' : 'client')),
      user.provider || 'local',
    ]
  );
}

// ---- Middleware: set req.user from Better Auth or express-session; 401 if not logged in. ----
async function requireAuth(req, res, next) {
  try {
    let userEmail = null;
    let userName = null;
    
    // 1. Try express-session first (legacy local login)
    if (req.session?.user && (req.session.user.email || req.session.user.id)) {
      userEmail = req.session.user.email;
      userName = req.session.user.name;
    } 
    // 2. Try better-auth session
    else {
      try {
        const betterAuthSession = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        if (betterAuthSession?.user) {
          userEmail = betterAuthSession.user.email;
          userName = betterAuthSession.user.name;
        }
      } catch (err) { }
    }

    if (userEmail) {
      const role = await getRoleForEmailAsync(userEmail);
      req.user = {
        email: userEmail,
        name: userName,
        role: role,
      };
      return next();
    }
  } catch (e) {
    console.error('requireAuth error:', e);
  }
  return res.status(401).json({ success: false, message: 'You must be logged in.' });
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
      'SELECT "mapDataID", title, description, "xAxis" as "xAxis", "yAxis" as "yAxis", "3dTiles" as "3dTiles", "thumbNailUrl", "updateDateTime", COALESCE(purchase_price_tokens, 0) AS purchase_price_tokens FROM public."MapData" ORDER BY "updateDateTime" DESC'
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
      updateDateTime: r.updateDateTime ? new Date(r.updateDateTime).toISOString() : null,
      purchase_price_tokens: r.purchase_price_tokens != null ? Number(r.purchase_price_tokens) : 0
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
  cookie: { 
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'lax', 
    maxAge: 24 * 60 * 60 * 1000 
  },
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

// ---- Auth: get current user email from Better Auth or express-session (for profile routes) ----
async function getCurrentUserEmail(req) {
  try {
    const betterAuthSession = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (betterAuthSession?.user?.email) return betterAuthSession.user.email;
  } catch (_) {}
  if (req.session?.user?.email) return req.session.user.email;
  return null;
}

// ---- Auth: GET /api/auth/profile (full profile for logged-in user: email, name, contactNumber, role, provider) ----
app.get("/api/auth/profile", async (req, res) => {
  try {
    const email = await getCurrentUserEmail(req);
    if (!email) return res.status(401).json({ success: false, message: 'Not logged in.' });
    const users = await getUsersAsync();
    const user = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ success: false, message: 'Profile not found.' });
    return res.json({
      success: true,
      email: user.email,
      name: user.name || '',
      contactNumber: user.contactNumber || '',
      role: user.role || 'client',
      provider: user.provider || 'local',
      hasPassword: !!user.passwordHash,
    });
  } catch (e) {
    console.error('GET /api/auth/profile', e);
    return res.status(500).json({ success: false, message: 'Failed to load profile.' });
  }
});

// ---- Token wallet & payments API (subscriber tokens for uploads and 3D model purchases) ----

// GET /api/token/wallet - current token balance and rate for logged-in user
app.get('/api/token/wallet', requireAuth, async (req, res) => {
  try {
    ensurePgForWallet();
    const wallet = await getOrCreateWallet(req.user.email);
    res.json({
      success: true,
      email: wallet.email,
      balance: wallet.balance,
      tokenMyrRate: TOKEN_MYR_RATE,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    });
  } catch (e) {
    const status = e.statusCode || 500;
    console.error('GET /api/token/wallet', e);
    res.status(status).json({ success: false, message: e.message || 'Failed to load wallet.' });
  }
});

// POST /api/token/topup-intent - create Stripe PaymentIntent to buy tokens
// Body: { tokens?: number, amountMyr?: number }
app.post('/api/token/topup-intent', requireAuth, express.json(), async (req, res) => {
  try {
    ensurePgForWallet();
    if (!stripe) {
      return res.status(500).json({ success: false, message: 'Stripe is not configured on the server.' });
    }
    const { tokens, amountMyr } = req.body || {};
    let tokensDesired = Number(tokens || 0);
    let myr = Number(amountMyr || 0);
    if (!tokensDesired && myr > 0) {
      tokensDesired = tokensFromMyr(myr);
    }
    if (!tokensDesired || !isFinite(tokensDesired) || tokensDesired <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid token amount.' });
    }
    if (!myr || !isFinite(myr) || myr <= 0) {
      myr = myrFromTokens(tokensDesired);
    }
    const amountInSen = Math.round(myr * 100);
    if (amountInSen < 100) {
      return res.status(400).json({ success: false, message: 'Minimum top-up is MYR 1.00.' });
    }

    const email = String(req.user.email || '').trim().toLowerCase();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInSen,
      currency: 'myr',
      receipt_email: email,
      description: `3DHub token top-up (${tokensDesired.toFixed(2)} tokens @ ${TOKEN_MYR_RATE} MYR/token)`,
      metadata: {
        tokensDesired: tokensDesired.toString(),
        email,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Record Stripe payment in pending state (actual credit will happen on webhook or Confirm API)
    await pgQuery(
      `INSERT INTO public."StripePayments"
       (user_email, stripe_payment_intent_id, stripe_customer_id, amount_myr, tokens_credited, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       ON CONFLICT (stripe_payment_intent_id) DO NOTHING`,
      [
        email,
        paymentIntent.id,
        paymentIntent.customer || null,
        myr,
        tokensDesired,
      ]
    );

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountMyr: myr,
      tokens: tokensDesired,
    });
  } catch (e) {
    console.error('POST /api/token/topup-intent', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to create payment intent.' });
  }
});

// POST /api/token/stripe-webhook - Stripe webhook endpoint to credit wallets after successful payment
// Set STRIPE_WEBHOOK_SECRET in .env when using this in production.
app.post('/api/token/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) {
    return res.status(500).send('Stripe not configured.');
  }
  const sig = req.headers['stripe-signature'];
  let event = null;
  try {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } else {
      // Fallback: accept event without verification (for local testing only)
      event = req.body;
    }
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message || err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const piId = pi.id;
      const email = (pi.metadata && pi.metadata.email) ? String(pi.metadata.email).toLowerCase() : (pi.receipt_email || '').toLowerCase();
      const tokensDesired = pi.metadata && pi.metadata.tokensDesired ? Number(pi.metadata.tokensDesired) : tokensFromMyr(pi.amount_received / 100);
      const myr = pi.amount_received / 100;

      if (email && tokensDesired > 0) {
        ensurePgForWallet();
        // Mark Stripe payment as succeeded if not already
        await pgQuery(
          `UPDATE public."StripePayments"
           SET status = 'succeeded', updated_at = NOW(), amount_myr = $2, tokens_credited = $3
           WHERE stripe_payment_intent_id = $1`,
          [piId, myr, tokensDesired]
        );
        // Credit wallet (idempotent-ish: rely on ON CONFLICT + a check in TokenTransactions)
        const existingTx = await pgQuery(
          `SELECT id FROM public."TokenTransactions"
           WHERE stripe_payment_intent_id = $1 AND type = 'topup' LIMIT 1`,
          [piId]
        );
        if (!existingTx?.rows?.length) {
          await applyTokenDelta(email, tokensDesired, 'topup', {
            referenceType: 'stripe_payment',
            referenceId: piId,
            stripePaymentIntentId: piId,
            myrAmount: myr,
            metadata: { source: 'stripe-webhook' },
          });
        }
      }
    }
  } catch (e) {
    console.error('Error handling Stripe webhook event', e);
    return res.status(500).send('Webhook handler error.');
  }
  res.json({ received: true });
});

// POST /api/token/purchase-map-data - pay tokens to purchase an existing 3D model (MapData row)
// Body: { mapDataID: string }
app.post('/api/token/purchase-map-data', requireAuth, express.json(), async (req, res) => {
  try {
    ensurePgForWallet();
    const role = req.user.role || 'client';
    if (role !== 'subscriber' && role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Only subscribers (or admins) can purchase 3D models.' });
    }
    const mapDataID = String(req.body?.mapDataID || '').trim();
    if (!mapDataID) {
      return res.status(400).json({ success: false, message: 'mapDataID is required.' });
    }

    // Load MapData price (in tokens)
    const q = await pgQuery(
      'SELECT "mapDataID", title, "3dTiles", COALESCE(purchase_price_tokens, 0) AS price_tokens FROM public."MapData" WHERE "mapDataID" = $1 LIMIT 1',
      [mapDataID]
    );
    const row = q?.rows?.[0];
    if (!row) {
      return res.status(404).json({ success: false, message: '3D model not found.' });
    }
    const priceTokens = Number(row.price_tokens || 0);
    if (!priceTokens || !isFinite(priceTokens) || priceTokens <= 0) {
      return res.status(400).json({ success: false, message: 'This 3D model is not configured with a token price yet.' });
    }

    const email = String(req.user.email || '').toLowerCase();

    // Check if already purchased
    const existing = await pgQuery(
      `SELECT id FROM public."MapDataPurchases"
       WHERE LOWER(user_email) = LOWER($1) AND map_data_id = $2 LIMIT 1`,
      [email, mapDataID]
    );
    if (existing?.rows?.length) {
      return res.json({ success: true, alreadyOwned: true, message: 'You have already purchased this 3D model.' });
    }

    // Debit tokens
    const delta = -priceTokens;
    const result = await applyTokenDelta(email, delta, 'purchase_3d', {
      referenceType: 'map_data_purchase',
      referenceId: mapDataID,
      metadata: { mapDataID, title: row.title },
    });

    // Insert purchase record
    const ins = await pgQuery(
      `INSERT INTO public."MapDataPurchases"
       (user_email, map_data_id, tokens_paid, token_transaction_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [email, mapDataID, priceTokens, result.transactionId || null]
    );

    res.json({
      success: true,
      purchaseId: ins?.rows?.[0]?.id,
      mapDataID,
      tokensPaid: priceTokens,
      balance: result.balance,
    });
  } catch (e) {
    const status = e.statusCode || 500;
    const msg = e.message || 'Failed to purchase 3D model.';
    const payload = { success: false, message: msg };
    if (msg.includes('Insufficient')) payload.code = 'INSUFFICIENT_TOKENS';
    console.error('POST /api/token/purchase-map-data', e);
    res.status(status).json(payload);
  }
});

// GET /api/token/quote-upload - return tokens required for an upload by file count (for display before upload)
app.get('/api/token/quote-upload', requireAuth, (req, res) => {
  try {
    const fileCount = Math.max(0, parseInt(req.query.fileCount, 10) || 0);
    const tokensRequired = computeUploadTokens(fileCount);
    const myrEquivalent = myrFromTokens(tokensRequired);
    res.json({
      success: true,
      fileCount,
      tokensRequired,
      myrEquivalent,
      tokenMyrRate: TOKEN_MYR_RATE,
    });
  } catch (e) {
    console.error('GET /api/token/quote-upload', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to get quote.' });
  }
});

// ---- Auth: PUT /api/auth/profile/password (change password; requires current password) ----
app.put("/api/auth/profile/password", express.json(), async (req, res) => {
  const email = await getCurrentUserEmail(req);
  if (!email) return res.status(401).json({ success: false, message: 'Not logged in.' });
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
  if (String(newPassword).length < 8) return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
  try {
    const users = await getUsersAsync();
    const user = users.find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!user.passwordHash) return res.status(400).json({ success: false, message: 'This account uses Google or Microsoft sign-in. Set a password first from the profile page or use social login.' });
    if (!bcrypt.compareSync(currentPassword, user.passwordHash)) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    const newHash = bcrypt.hashSync(newPassword, 10);
    if (usePgUsers()) {
      await pgQuery(
        `UPDATE public."DataPortalUsers" SET password_hash = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2)`,
        [newHash, email]
      );
    } else {
      const idx = users.findIndex(u => (u.email || '').toLowerCase() === email.toLowerCase());
      if (idx >= 0) {
        users[idx].passwordHash = newHash;
        writeUsers(users);
      }
    }
    return res.json({ success: true, message: 'Password updated.' });
  } catch (e) {
    console.error('PUT /api/auth/profile/password', e);
    return res.status(500).json({ success: false, message: 'Failed to update password.' });
  }
});

// ---- Auth: PUT /api/auth/profile/contact (change contact number) ----
app.put("/api/auth/profile/contact", express.json(), async (req, res) => {
  const email = await getCurrentUserEmail(req);
  if (!email) return res.status(401).json({ success: false, message: 'Not logged in.' });
  const raw = (req.body?.contactNumber ?? req.body?.contact ?? '').trim();
  const contactNumber = raw.length > 0 ? raw : null;
  const contactRegex = /^[\d+\-\s()]{7,20}$/;
  if (contactNumber && !contactRegex.test(contactNumber)) return res.status(400).json({ success: false, message: 'Please enter a valid contact number (7–20 digits, + - ( ) and spaces allowed).' });
  try {
    if (usePgUsers()) {
      await pgQuery(
        `UPDATE public."DataPortalUsers" SET contact_number = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2)`,
        [contactNumber, email]
      );
    } else {
      const users = readUsers();
      const idx = users.findIndex(u => (u.email || '').toLowerCase() === email.toLowerCase());
      if (idx >= 0) {
        users[idx].contactNumber = contactNumber || '';
        writeUsers(users);
      }
    }
    return res.json({ success: true, message: 'Contact number updated.', contactNumber: contactNumber || '' });
  } catch (e) {
    console.error('PUT /api/auth/profile/contact', e);
    return res.status(500).json({ success: false, message: 'Failed to update contact number.' });
  }
});

// ---- Auth: PUT /api/auth/profile/name (change display name) ----
app.put("/api/auth/profile/name", express.json(), async (req, res) => {
  const email = await getCurrentUserEmail(req);
  if (!email) return res.status(401).json({ success: false, message: 'Not logged in.' });
  const name = (req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ success: false, message: 'Please enter a name.' });
  try {
    if (usePgUsers()) {
      await pgQuery(
        `UPDATE public."DataPortalUsers" SET name = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2)`,
        [name, email]
      );
    } else {
      const users = readUsers();
      const idx = users.findIndex(u => (u.email || '').toLowerCase() === email.toLowerCase());
      if (idx >= 0) {
        users[idx].name = name;
        writeUsers(users);
      }
    }
    return res.json({ success: true, message: 'Name updated.', name });
  } catch (e) {
    console.error('PUT /api/auth/profile/name', e);
    return res.status(500).json({ success: false, message: 'Failed to update name.' });
  }
});

// ---- GET /api/auth/profile/sftp - get SFTP credentials for logged-in user ----
app.get("/api/auth/profile/sftp", async (req, res) => {
  const email = await getCurrentUserEmail(req);
  if (!email) return res.status(401).json({ success: false, message: 'Not logged in.' });
  try {
    if (usePgUsers()) {
      const r = await pgQuery(
        `SELECT sftp_username, sftp_password FROM public."DataPortalUsers" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
        [email]
      );
      const row = r?.rows?.[0];
      return res.json({
        success: true,
        sftpUsername: row?.sftp_username || null,
        sftpPassword: row?.sftp_password || null,
      });
    }
    return res.json({ success: true, sftpUsername: null, sftpPassword: null });
  } catch (e) {
    console.error('GET /api/auth/profile/sftp', e);
    return res.status(500).json({ success: false, message: 'Failed to load SFTP credentials.' });
  }
});

// ---- PUT /api/auth/profile/sftp-password - change SFTP password ----
app.put("/api/auth/profile/sftp-password", express.json(), async (req, res) => {
  const email = await getCurrentUserEmail(req);
  if (!email) return res.status(401).json({ success: false, message: 'Not logged in.' });
  const { newPassword } = req.body || {};
  if (!newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ success: false, message: 'New SFTP password must be at least 8 characters.' });
  }
  try {
    // Step 1: Get SFTP token
    const accessToken = await getSftpToken();

    // Step 2: Get current SFTP username from DB
    const r = await pgQuery(
      `SELECT sftp_username FROM public."DataPortalUsers" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    const sftpUsername = r?.rows?.[0]?.sftp_username;
    if (!sftpUsername) {
      return res.status(404).json({ success: false, message: 'No SFTP account found for this user.' });
    }

    // Step 3: Update password in SFTPGo
    const updateResponse = await fetch(`${SFTP_API_BASE}/users/${sftpUsername}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: newPassword })
    });
    if (!updateResponse.ok) {
      const errText = await updateResponse.text();
      throw new Error(`SFTPGo update failed: ${updateResponse.status} - ${errText}`);
    }

    // Step 4: Update password in our DB
    await pgQuery(
      `UPDATE public."DataPortalUsers" SET sftp_password = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2)`,
      [newPassword, email]
    );

    return res.json({ success: true, message: 'SFTP password updated successfully.' });
  } catch (e) {
    console.error('PUT /api/auth/profile/sftp-password', e);
    return res.status(500).json({ success: false, message: e.message || 'Failed to update SFTP password.' });
  }
});

// ---- Auth: PUT /api/auth/profile/email (change email; updates DataPortalUsers, GoogleUsers, MicrosoftUsers; then sign out) ----
app.put("/api/auth/profile/email", express.json(), async (req, res) => {
  const currentEmail = await getCurrentUserEmail(req);
  if (!currentEmail) return res.status(401).json({ success: false, message: 'Not logged in.' });
  const newEmailRaw = (req.body?.newEmail ?? req.body?.email ?? '').trim();
  const newEmail = newEmailRaw.toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!newEmail || !emailRegex.test(newEmail)) return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  if (newEmail === currentEmail.toLowerCase()) return res.json({ success: true, message: 'Email unchanged.' });
  try {
    const users = await getUsersAsync();
    if (users.some(u => (u.email || '').toLowerCase() === newEmail)) return res.status(400).json({ success: false, message: 'This email is already registered in the Data Portal.' });
    const user = users.find(u => (u.email || '').toLowerCase() === currentEmail.toLowerCase());
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (usePgUsers()) {
      await pgQuery(
        `UPDATE public."DataPortalUsers" SET email = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2)`,
        [newEmail, currentEmail]
      );
      await pgQuery(
        `UPDATE public."GoogleUsers" SET email = $1 WHERE LOWER(email) = LOWER($2)`,
        [newEmail, currentEmail]
      ).catch(() => {}); // table or column may differ
      await pgQuery(
        `UPDATE public."MicrosoftUsers" SET email = $1 WHERE LOWER(email) = LOWER($2)`,
        [newEmail, currentEmail]
      ).catch(() => {});
    } else {
      const idx = users.findIndex(u => (u.email || '').toLowerCase() === currentEmail.toLowerCase());
      if (idx >= 0) {
        users[idx].email = newEmail;
        writeUsers(users);
      }
    }
    req.session.user = null;
    req.session.save(() => {});
    try {
      await auth.api.signOut({ headers: fromNodeHeaders(req.headers) });
    } catch (_) {}
    return res.json({ success: true, message: 'Email updated. Please sign in again with your new email.', requireRelogin: true });
  } catch (e) {
    console.error('PUT /api/auth/profile/email', e);
    return res.status(500).json({ success: false, message: 'Failed to update email.' });
  }
});

// ---- Google: start OAuth by calling our Better Auth sign-in endpoint (so cookies are set), then forward redirect to browser ----
const googleCallbackRegisterUrl = `${baseURL}/api/auth/google-callback-done?flow=register&then=${encodeURIComponent('http://localhost:3000/html/front-pages/register.html')}`;
app.get("/api/auth/google", async (req, res) => {
  if (!googleClientId || !googleClientSecret) {
    return res.status(503).send("Google OAuth not configured.");
  }
  const flow = req.query.flow || 'login';
  const thenUrl = (req.query.then || '').trim() || FRONT_END_URL;
  const googleCallbackDoneUrl = `${baseURL}/api/auth/google-callback-done?then=${encodeURIComponent(thenUrl)}`;
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
      // Login flow: only allow if this email is already registered (same as Microsoft)
      const emailNorm = (session.user.email || '').trim().toLowerCase();
      const users = await getUsersAsync();
      const emailRegistered = users.some(u => (u.email || '').toLowerCase() === emailNorm);
      if (!emailRegistered) {
        return res.redirect(LOGIN_PAGE_URL + "?auth_error=email_not_registered&email=" + encodeURIComponent(session.user.email || ''));
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

  // ---- Auto-create SFTP account for new user ----
  let sftpUsername = null;
  let sftpPassword = null;
  if (process.env.SFTP_ADMIN_PASSWORD) {
    const sftpResult = await autoCreateSftpAccount(rawName, email);
    if (sftpResult.success) {
      sftpUsername = sftpResult.sftpUsername;
      sftpPassword = sftpResult.sftpPassword;
      // Save SFTP credentials to database
      if (usePgUsers()) {
        try {
          await pgQuery(
            `UPDATE public."DataPortalUsers" 
             SET sftp_username = $1, sftp_password = $2 
             WHERE LOWER(email) = LOWER($3)`,
            [sftpUsername, sftpPassword, email]
          );
        } catch (e) {
          console.error('[sftp] Failed to save SFTP credentials to DB:', e.message);
        }
      }
    }
  }

  res.json({
    success: true,
    message: 'Account created. You can now log in.',
    // Return SFTP credentials so frontend can show them to user
    sftpUsername: sftpUsername || null,
    sftpPassword: sftpPassword || null,
  });
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
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  if (!user.passwordHash) {
    return res.status(401).json({ success: false, message: 'This account uses Google or Microsoft sign-in. Use one of those buttons to log in.' });
  }
  if (!bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
  const role = (user.role === 'admin') ? 'admin' : (user.role === 'subscriber' ? 'subscriber' : 'client');
  req.session.user = { provider: "local", email: user.email, name: user.name, role };
  res.json({ success: true, redirect: FRONT_END_URL });
});

// ─── Subscriber: check if email is client (for upgrade flow), upgrade client to subscriber ───
app.get("/api/auth/check-client", async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, isClient: false, message: 'Email is required.' });
  try {
    const users = await getUsersAsync();
    const u = users.find(x => (x.email || '').toLowerCase() === email);
    const isClient = !!u && (u.role === 'client' || u.role === 'subscriber' || u.role === 'admin');
    return res.json({ success: true, isClient, role: u ? u.role : null });
  } catch (e) {
    console.error('check-client', e);
    return res.status(500).json({ success: false, isClient: false });
  }
});

app.post("/api/auth/upgrade-to-subscriber", express.json(), async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });
  if (!usePgUsers()) return res.status(503).json({ success: false, message: 'Subscriber upgrade requires PostgreSQL.' });
  try {
    const users = await getUsersAsync();
    const u = users.find(x => (x.email || '').toLowerCase() === email);
    if (!u) return res.status(400).json({ success: false, message: 'No account found with this email. Create a client account first.' });
    if (u.role === 'admin') return res.status(400).json({ success: false, message: 'Admins do not need to upgrade to subscriber.' });
    if (u.role === 'subscriber') return res.json({ success: true, message: 'You are already a subscriber.' });
    const updated = await updateUserRolePG(email, 'subscriber');
    if (!updated) return res.status(500).json({ success: false, message: 'Upgrade failed.' });
    return res.json({ success: true, message: 'You are now a subscriber. You can upload raw data and purchase 3D models.' });
  } catch (e) {
    console.error('upgrade-to-subscriber', e);
    return res.status(500).json({ success: false, message: 'Upgrade failed.' });
  }
});

// ─── Microsoft OAuth ──────────────────────────────────────────────────────────
app.get("/auth/microsoft/login", async (req, res) => {
  try {
    req.session.msFlow = req.query.flow || 'login';
    if ((req.query.then || '').trim()) req.session.msThenUrl = req.query.then.trim();
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
           ORDER BY (role = 'admin') DESC, (role = 'subscriber') DESC NULLS LAST, id LIMIT 1`,
          [emailNorm]
        );
        const dbRole = r?.rows?.[0]?.role;
        if (dbRole === 'admin') role = 'admin';
        else if (dbRole === 'subscriber') role = 'subscriber';
      } catch (e) {
        console.error('Microsoft callback get role', e);
      }
    } else {
      role = await getRoleForEmailAsync(dbUser.email);
    }

    req.session.user = {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      provider: "microsoft",
      role,
    };

    req.session.save((err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.redirect(FRONT_END_URL + "?auth_error=session_failed");
      }
      const flowSaved = req.session.msFlow || 'login';
      const thenUrl = req.session.msThenUrl;
      req.session.msFlow = null;
      req.session.msThenUrl = null;

      if (flowSaved === 'register') {
        return res.redirect(
          `http://localhost:3000/html/front-pages/register.html?logged_in=1&email=${encodeURIComponent(dbUser.email)}&name=${encodeURIComponent(dbUser.name || '')}&provider=microsoft`
        );
      }
      var base = (thenUrl && thenUrl.indexOf('http') === 0) ? thenUrl : FRONT_END_URL;
      const url = new URL(base);
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
  req.session.destroy(() => { });
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
      role: u.role === 'admin' ? 'admin' : (u.role === 'subscriber' ? 'subscriber' : 'client'),
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

// ---- Admin: upload completed 3D model for a processing request (saved under uploads/processed-results) ----
fs.mkdirSync(PROCESSED_RESULTS_DIR, { recursive: true });
const processedResultStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PROCESSED_RESULTS_DIR),
  filename: (req, file, cb) => {
    const requestId = (req.params && req.params.id) || '0';
    const ext = (path.extname(file.originalname) || '').toLowerCase() || '.zip';
    const safe = /^[a-zA-Z0-9_.-]+$/.test(ext) ? ext : '.zip';
    cb(null, 'req_' + requestId + '_' + Date.now() + safe);
  }
});
const uploadProcessedResult = multer({ storage: processedResultStorage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

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
      const dup = await pgQuery(
        `SELECT "mapDataID", title, "xAxis", "yAxis", "3dTiles"
         FROM public."MapData"
         WHERE "mapDataID" = $1
            OR LOWER(title) = LOWER($2)
            OR "yAxis" = $3
            OR "xAxis" = $4
            OR "3dTiles" = $5
         LIMIT 1`,
        [mapDataID, title, yAxis, xAxis, tilesUrl]
      );
      if (dup && dup.rows && dup.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'This to be created new 3D model has the same model ID and/or title and/or latitude and/or logitude and/or 3D tiles url with the existing 3D model in the data portal.',
          code: 'DUPLICATE_MAPDATA',
        });
      }
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
      const titleLower = (title || '').toLowerCase();
      const dupAny = rows.find(r => {
        const rid = (r.mapDataID || '').toString();
        const rtitle = (r.title || '').toString().toLowerCase();
        const rlat = r.yAxis != null ? Number(r.yAxis) : null;
        const rlon = r.xAxis != null ? Number(r.xAxis) : null;
        const rtiles = (r['3dTiles'] || '').toString();
        return (
          (rid && rid === mapDataID) ||
          (rtitle && rtitle === titleLower) ||
          (rlat != null && rlat === yAxis) ||
          (rlon != null && rlon === xAxis) ||
          (rtiles && rtiles === tilesUrl)
        );
      });
      if (dupAny) {
        return res.status(409).json({
          success: false,
          message: 'This to be created new 3D model has the same model ID and/or title and/or latitude and/or logitude and/or 3D tiles url with the existing 3D model in the data portal.',
          code: 'DUPLICATE_MAPDATA',
        });
      }
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

    // Keep data/locations.json in sync (DB -> JSON seed file)
    try {
      const locationsPath = path.join(PROJECT_ROOT, 'data', 'locations.json');
      let data = { locations: [] };
      try {
        if (fs.existsSync(locationsPath)) {
          data = JSON.parse(fs.readFileSync(locationsPath, 'utf8')) || { locations: [] };
        } else {
          fs.mkdirSync(path.dirname(locationsPath), { recursive: true });
        }
      } catch (e) {
        data = { locations: [] };
      }
      if (!Array.isArray(data.locations)) data.locations = [];

      const idxLoc = data.locations.findIndex((l) => (l && (l.id || '')).toString() === mapDataID);
      const existing = idxLoc >= 0 ? (data.locations[idxLoc] || {}) : {};
      const next = {
        ...existing,
        id: mapDataID,
        name: title,
        description: description || existing.description || '',
        coordinates: {
          ...(existing.coordinates || {}),
          latitude: Number(yAxis),
          longitude: Number(xAxis),
        },
        dataPaths: {
          ...(existing.dataPaths || {}),
          tileset: tilesUrl,
        },
      };
      // Prefer using the thumbnail URL as previewImage when provided
      if (thumbNailUrl) next.previewImage = thumbNailUrl;

      if (idxLoc >= 0) data.locations[idxLoc] = next;
      else data.locations.push(next);

      fs.writeFileSync(locationsPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      // If the file cannot be updated (permissions, etc.), do not block saving to DB.
      console.warn('[map-data] Could not update data/locations.json:', e && e.message ? e.message : e);
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

// ---- Admin: export/backfill data/locations.json from DB MapData (DB -> JSON seed file) ----
app.all('/api/admin/export-locations-json', function (req, res, next) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, message: 'Method not allowed. Use POST to export.' });
  next();
});
app.post('/api/admin/export-locations-json', async (req, res) => {
  const locationsPath = path.join(PROJECT_ROOT, 'data', 'locations.json');
  try {
    const rows = await getMapDataForApi(); // PG when configured, otherwise falls back to file/SQLite

    let existing = { locations: [] };
    try {
      if (fs.existsSync(locationsPath)) {
        existing = JSON.parse(fs.readFileSync(locationsPath, 'utf8')) || { locations: [] };
      } else {
        fs.mkdirSync(path.dirname(locationsPath), { recursive: true });
      }
    } catch (e) {
      existing = { locations: [] };
    }
    if (!existing || typeof existing !== 'object') existing = { locations: [] };
    if (!Array.isArray(existing.locations)) existing.locations = [];

    const byId = new Map(existing.locations.map((l) => [String((l && l.id) || ''), l]).filter((p) => p[0]));
    let upserted = 0;

    for (const r of (Array.isArray(rows) ? rows : [])) {
      const id = String((r && (r.mapDataID || r.id)) || '').trim();
      if (!id) continue;
      const prev = byId.get(id) || {};
      const next = {
        ...prev,
        id,
        name: (r.title || id),
        description: (r.description || prev.description || ''),
        coordinates: {
          ...(prev.coordinates || {}),
          latitude: (r.yAxis != null ? Number(r.yAxis) : (prev.coordinates && prev.coordinates.latitude)),
          longitude: (r.xAxis != null ? Number(r.xAxis) : (prev.coordinates && prev.coordinates.longitude)),
        },
        dataPaths: {
          ...(prev.dataPaths || {}),
          tileset: (r['3dTiles'] || (prev.dataPaths && prev.dataPaths.tileset) || ''),
        },
      };
      const thumb = (r.thumbNailUrl || '').toString().trim();
      if (thumb) next.previewImage = thumb;
      byId.set(id, next);
      upserted++;
    }

    const out = { ...existing, locations: Array.from(byId.values()) };
    fs.writeFileSync(locationsPath, JSON.stringify(out, null, 2), 'utf8');
    return res.json({ success: true, upserted, message: 'Exported ' + upserted + ' MapData rows into data/locations.json.' });
  } catch (e) {
    console.error('POST /api/admin/export-locations-json', e);
    return res.status(500).json({ success: false, message: e.message || 'Failed to export locations.json.' });
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
    const exists = await pgQuery('SELECT 1 FROM public."Showcase" WHERE map_data_id = $1 LIMIT 1', [map_data_id]);
    if (exists && exists.rows && exists.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This specific 3D model showcase has been added into the showcase already, cannot add duplicate 3D model in showcase section.',
        code: 'DUPLICATE_SHOWCASE',
      });
    }
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
      imageMetadata: (req.body.imageMetadata || '').trim(),
      totalFiles: req.body.totalFiles || 0,
      totalSizeBytes: req.body.totalSizeBytes || 0,
      createdAt: new Date().toISOString()
    };

    const tempDir = path.join(UPLOAD_DIR, `temp_${uploadId}`);
    await fsPromises.mkdir(tempDir, { recursive: true });
    const metadataPath = path.join(tempDir, 'metadata.json');
    await fsPromises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    console.log(`[init] Metadata saved locally: ${metadataPath}`);

    res.json({ success: true, uploadId, message: 'Upload initialized' });
  } catch (e) {
    console.error('POST /api/upload/init', e);
    res.status(500).json({ success: false, message: 'Failed to initialize upload.' });
  }
});

// We need multer to handle the chunk file upload since it's multipart/form-data
const chunkStorage = multer.memoryStorage();

const uploadChunkMulter = multer({ storage: chunkStorage, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/upload/chunk', (req, res) => {
  uploadChunkMulter.single('chunk')(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer Error in chunk upload:', err);
      return res.status(500).json({ success: false, message: 'Multer parsing error: ' + err.message });
    } else if (err) {
      console.error('Unknown Error in chunk upload:', err);
      return res.status(500).json({ success: false, message: 'Unknown parsing error: ' + err.message });
    }
    try {
      const uploadId = req.body.uploadId;
      const filename = req.body.filename;
      const chunkIndex = parseInt(req.body.chunkIndex, 10);
      const totalChunks = parseInt(req.body.totalChunks, 10);

      if (!uploadId || !filename || isNaN(chunkIndex) || isNaN(totalChunks) || !req.file) {
        return res.status(400).json({ success: false, message: 'Missing required chunk parameters.' });
      }

      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

      // Save chunk to local disk
      const tempDir = path.join(UPLOAD_DIR, `temp_${uploadId}`);
      await fsPromises.mkdir(tempDir, { recursive: true });
      const chunkPath = path.join(tempDir, `${safeFilename}.part${chunkIndex}`);
      await fsPromises.writeFile(chunkPath, req.file.buffer);
      console.log(`[chunk] Saved locally: ${chunkPath}`);

      res.json({ success: true, message: `Chunk ${chunkIndex} received.` });
    } catch (e) {
      console.error('POST /api/upload/chunk error:', e);
      res.status(500).json({ success: false, message: 'Failed to save chunk.' });
    }
  });
});

app.post('/api/upload/finalize', requireAuth, express.json(), async (req, res) => {
  try {
    const uploadId = req.body.uploadId;
    if (!uploadId) {
      return res.status(400).json({ success: false, message: 'Missing uploadId' });
    }

    const filesMapping = req.body.files;
    if (!filesMapping || !Array.isArray(filesMapping)) {
      return res.status(400).json({ success: false, message: 'Missing files mapping array' });
    }

    // Compute token charge from number of image files (exclude .txt/.csv drone pos)
    const imageFileCount = filesMapping.filter((f) => {
      const fn = (f.filename || '').toLowerCase();
      return !fn.endsWith('.txt') && !fn.endsWith('.csv');
    }).length;
    const tokensRequired = computeUploadTokens(imageFileCount);
    const email = (req.user && req.user.email) ? String(req.user.email).trim().toLowerCase() : null;

    // ====================================================================
    // TESTING MODE: Upload token payment gate temporarily disabled.
    // Uncomment the block below to re-enable token charging for uploads.
    // ====================================================================
    /*
    if (process.env.PG_DATABASE && usePgUsers()) {
      try {
        ensurePgForWallet();
        if (!email) {
          return res.status(401).json({ success: false, message: 'You must be logged in to submit an upload.' });
        }
        await applyTokenDelta(email, -tokensRequired, 'upload_charge', {
          referenceType: 'client_upload',
          referenceId: uploadId,
          metadata: { fileCount: imageFileCount },
        });
      } catch (e) {
        const status = e.statusCode || 400;
        if (e.message && e.message.includes('Insufficient')) {
          return res.status(status).json({
            success: false,
            message: 'Insufficient token balance. Please top up your tokens before uploading.',
            code: 'INSUFFICIENT_TOKENS',
          });
        }
        console.error('Upload token charge failed', e);
        return res.status(status).json({ success: false, message: e.message || 'Failed to charge tokens for upload.' });
      }
    }
    */

    const finalSubdir = `project_${Date.now()}_${uploadId.substring(0, 6)}`;
    const finalFilePaths = [];
    let dronePosFilePath = null;
    let actualFileCount = 0;

    // ---- Local disk storage ----
    const tempDir = path.join(UPLOAD_DIR, `temp_${uploadId}`);
    const finalDir = path.join(UPLOAD_DIR, finalSubdir);
    await fsPromises.mkdir(finalDir, { recursive: true });

    for (const fileDef of filesMapping) {
      const safeFilename = fileDef.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const originalBasename = path.basename(fileDef.filename.replace(/\\/g, '/'));
      const safeBasename = originalBasename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const finalFilePath = path.join(finalDir, safeBasename);
      const writeStream = fs.createWriteStream(finalFilePath);

      let assemblyFailed = false;
      for (let i = 0; i < fileDef.totalChunks; i++) {
        const chunkPath = path.join(tempDir, `${safeFilename}.part${i}`);
        try {
          await new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(chunkPath);
            readStream.on('error', reject);
            readStream.pipe(writeStream, { end: false });
            readStream.on('end', () => resolve());
          });
        } catch (e) {
          console.error(`Missing chunk ${i} for file ${safeFilename}`, e);
          assemblyFailed = true;
          break;
        }
      }

      await new Promise((resolve, reject) => {
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
        writeStream.end();
      });

      if (assemblyFailed) {
        return res.status(400).json({ success: false, message: `Failed to assemble file ${fileDef.filename}.` });
      }

      const relativePath = `uploads/${finalSubdir}/${safeBasename}`;
      if (safeBasename.toLowerCase().endsWith('.txt') || safeBasename.toLowerCase().endsWith('.csv')) {
        dronePosFilePath = relativePath;
      } else {
        finalFilePaths.push(relativePath);
        actualFileCount++;
      }
    }

    const metadataPath = path.join(tempDir, 'metadata.json');
    let metadata = {};
    try {
      const metaStr = await fsPromises.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(metaStr);
    } catch (e) {
      console.warn('Could not read metadata for', uploadId);
    }

    if (!metadata.projectTitle) metadata.projectTitle = metadata.projectID;
    if (email) metadata.createdByEmail = email;

    if (process.env.PG_DATABASE) {
      //const tokensChargedVal = (usePgUsers() ? tokensRequired : null);
      const tokensChargedVal = null; // TESTING MODE: token charging disabled
      // const tokensChargedVal = (usePgUsers() ? tokensRequired : null);
      await pgQuery(
        `INSERT INTO public."ClientUploads" (project_id, project_title, upload_type, file_count, file_paths, camera_models, capture_date, organization_name, created_by_email, project_description, category, latitude, longitude, area_coverage, image_metadata, drone_pos_file_path, total_size_bytes, tokens_charged)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
        [
          metadata.projectID, metadata.projectTitle, metadata.uploadType, actualFileCount,
          finalFilePaths.length ? finalFilePaths : null, metadata.cameraModels, metadata.captureDate || null,
          metadata.organizationName, metadata.createdByEmail, metadata.projectDescription, metadata.category,
          isNaN(metadata.latitude) ? null : metadata.latitude, isNaN(metadata.longitude) ? null : metadata.longitude,
          'Unknown', metadata.imageMetadata, dronePosFilePath, metadata.totalSizeBytes || 0,
          tokensChargedVal,
        ],
      );
    }

    // ---- NEW: SFTP Relay Push (Background) ----
    if (remoteSftpConfig.host) {
      // Run the SFTP push in the background so the frontend doesn't hang at 100%
      setImmediate(async () => {
        let sftp;
        try {
          console.log(`[sfpt-relay] Connecting to remote host ${remoteSftpConfig.host}...`);
          sftp = await getRemoteSftpClient();
          if (sftp) {
            const remoteBase = process.env.REMOTE_SFTP_BASE_PATH || '';
            const remoteDir = path.posix.join(remoteBase, finalSubdir);
            console.log(`[sfpt-relay] Creating remote directory: ${remoteDir}`);
            await sftp.mkdir(remoteDir, true);
            
            console.log(`[sfpt-relay] Uploading project folder ${finalDir} to SFTP (Background)...`);
            await sftp.uploadDir(finalDir, remoteDir);
            console.log(`[sfpt-relay] Successfully pushed to remote SFTP. Cleaning up local copy...`);
            
            // After successful push, clean up local final project folder
            try { await fsPromises.rm(finalDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
          }
        } catch (err) {
          console.error('[sftp-relay] Failed to background push to remote SFTP:', err.message);
          // We keep the local copy as fallback if SFTP fails
        } finally {
          if (sftp) await sftp.end();
        }
      });
    }

    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // ignore cleanup errors
    }

    console.log(`[upload] Local upload saved: ${actualFileCount} files at ${finalDir}`);
    return res.json({ 
      success: true, 
      message: remoteSftpConfig.host ? 'Upload assembled and is being pushed to remote server in the background.' : 'Upload successfully assembled and saved.', 
      projectId: metadata.projectID, 
      fileCount: actualFileCount 
    });
  } catch (e) {
    console.error('POST /api/upload/finalize', e);
    return res.status(500).json({ success: false, message: e.message || 'Failed to finalize upload.' });
  }
});

// ---- SFTP Project Support ----
app.post('/api/upload/test-sftp', requireAuth, express.json(), async (req, res) => {
  const { host, port, username, password } = req.body;
  if (!host || !username) return res.status(400).json({ success: false, message: 'Missing host/user' });
  
  const sftp = new SftpClient();
  sftp.on('error', () => {}); // Suppress global error spam
  try {
    await sftp.connect({ host, port: parseInt(port) || 22, username, password });
    await sftp.end();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

app.post('/api/upload/sftp-project', requireAuth, express.json(), async (req, res) => {
  if (!process.env.PG_DATABASE) return res.status(500).json({ success: false, message: 'DB not configured' });
  
  try {
    const { projectTitle, projectDescription, category } = req.body;
    const projectID = `sftp_${Date.now()}`;
    const email = req.user.email;
    
    // Create the logical directory
    const remoteBase = process.env.REMOTE_SFTP_BASE_PATH || '';
    const remoteDir = path.posix.join(remoteBase, projectID);
    
    // Provide actual details if configured, otherwise fake
    const generatedSftpDetails = {
      host: remoteSftpConfig.host || 'sftp.ourdomain.com',
      port: remoteSftpConfig.port || 22,
      username: remoteSftpConfig.username || 'client_upload',
      password: remoteSftpConfig.password || crypto.randomBytes(8).toString('hex'),
      remotePath: remoteDir
    };

    // Spin up an empty folder automatically on the backend SFTP server if actually configured
    if (remoteSftpConfig.host) {
      const sftp = await getRemoteSftpClient();
      if (sftp) {
        try { await sftp.mkdir(remoteDir, true); } 
        catch (e) { console.error('[sftp] Could not make remote dir', e); }
        finally { await sftp.end(); }
      }
    }

    await pgQuery(
      `INSERT INTO public."ClientUploads" (project_id, project_title, upload_type, created_by_email, project_description, category, latitude, longitude, image_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        projectID, projectTitle, 'sftp', email, projectDescription, category,
        null, null, JSON.stringify({ sftp: generatedSftpDetails })
      ]
    );

    res.json({ success: true, message: 'SFTP Project created.', sftpDetails: generatedSftpDetails });
  } catch (e) {
    console.error('SFTP Project Creation Error:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});


// ---- Admin: list client uploads ----
app.get('/api/admin/client-uploads', async (req, res) => {
  if (!process.env.PG_DATABASE) {
    return res.json([]);
  }
  try {
    const q = await pgQuery('SELECT id, project_id, project_title, upload_type, file_count, file_paths, camera_models, capture_date, organization_name, created_at, created_by_email, request_status, rejected_reason, decided_at, decided_by, project_description, category, latitude, longitude, area_coverage, image_metadata, drone_pos_file_path, total_size_bytes, tokens_charged FROM public."ClientUploads" ORDER BY created_at DESC');
    res.json((q && q.rows) ? q.rows : []);
  } catch (e) {
    console.error('GET /api/admin/client-uploads', e);
    res.status(500).json({ error: 'Failed to load client uploads.' });
  }
});

// ---- User: list personal client uploads (with processing result / delivery info for subscriber download) ----
app.get('/api/user/my-uploads', requireAuth, async (req, res) => {
  if (!process.env.PG_DATABASE) {
    return res.json([]);
  }
  try {
    const email = req.user.email;
    const q = await pgQuery(
      `SELECT cu.id, cu.project_id, cu.project_title, cu.upload_type, cu.file_count, cu.file_paths, cu.camera_models, cu.capture_date, cu.organization_name, cu.created_at, cu.created_by_email, cu.request_status, cu.rejected_reason, cu.decided_at, cu.decided_by, cu.project_description, cu.category, cu.latitude, cu.longitude, cu.area_coverage, cu.image_metadata, cu.drone_pos_file_path, cu.total_size_bytes, cu.tokens_charged,
              pr.id AS processing_request_id, pr.status AS processing_status, pr.result_tileset_url AS processing_result_tileset_url, pr.delivered_at AS processing_delivered_at, pr.delivery_notes AS processing_delivery_notes
       FROM public."ClientUploads" cu
       LEFT JOIN LATERAL (SELECT id, status, result_tileset_url, delivered_at, delivery_notes FROM public."ProcessingRequests" WHERE upload_id = cu.id ORDER BY id DESC LIMIT 1) pr ON true
       WHERE LOWER(cu.created_by_email) = LOWER($1)
       ORDER BY cu.created_at DESC`,
      [email]
    );
    const rows = (q && q.rows) ? q.rows : [];
    const baseUrl = (req.get('x-forwarded-proto') && req.get('x-forwarded-host')) ? (req.get('x-forwarded-proto') + '://' + req.get('x-forwarded-host')) : (req.protocol + '://' + req.get('host') || '');
    const out = rows.map((r) => {
      const row = { ...r };
      if (row.processing_result_tileset_url) {
        row.processing_result_download_url = baseUrl + '/api/user/my-uploads/' + row.id + '/download-result';
        row.processing_has_result = true;
      } else {
        row.processing_result_download_url = null;
        row.processing_has_result = false;
      }
      return row;
    });
    res.json(out);
  } catch (e) {
    console.error('GET /api/user/my-uploads', e);
    res.status(500).json({ error: 'Failed to load user uploads.' });
  }
});

// ---- User: update personal client upload metadata ----
app.patch('/api/user/my-uploads/:id', requireAuth, async (req, res) => {
  if (!process.env.PG_DATABASE) {
    return res.status(500).json({ success: false, message: 'Database not configured.' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });

  const { project_title, project_description } = req.body;
  if (!project_title) {
    return res.status(400).json({ success: false, message: 'Project title is required.' });
  }

  try {
    const email = req.user.email;
    const q1 = await pgQuery('SELECT id FROM public."ClientUploads" WHERE id = $1 AND LOWER(created_by_email) = LOWER($2)', [id, email]);
    if (!q1 || !q1.rows || q1.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Project not found or you do not have permission to edit it.' });
    }
    await pgQuery(
      'UPDATE public."ClientUploads" SET project_title = $1, project_description = $2 WHERE id = $3',
      [project_title, project_description || '', id]
    );
    res.json({ success: true, message: 'Project updated successfully.' });
  } catch (e) {
    console.error('PATCH /api/user/my-uploads/:id', e);
    res.status(500).json({ success: false, message: 'Failed to update project.' });
  }
});

// ---- User: download completed 3D model for one of their uploads (subscriber) ----
app.get('/api/user/my-uploads/:uploadId/download-result', requireAuth, async (req, res) => {
  const uploadId = req.params.uploadId && parseInt(req.params.uploadId, 10);
  if (!uploadId || isNaN(uploadId) || !process.env.PG_DATABASE) {
    return res.status(400).json({ success: false, message: 'Invalid upload id.' });
  }
  try {
    const email = req.user.email;
    const cu = await pgQuery('SELECT id FROM public."ClientUploads" WHERE id = $1 AND LOWER(created_by_email) = LOWER($2)', [uploadId, email]);
    if (!cu || !cu.rows || !cu.rows[0]) return res.status(404).json({ success: false, message: 'Upload not found or access denied.' });
    const pr = await pgQuery('SELECT result_tileset_url FROM public."ProcessingRequests" WHERE upload_id = $1 AND result_tileset_url IS NOT NULL AND result_tileset_url <> \'\' ORDER BY id DESC LIMIT 1', [uploadId]);
    const url = pr && pr.rows && pr.rows[0] && pr.rows[0].result_tileset_url;
    if (!url) return res.status(404).json({ success: false, message: 'No 3D model result available for this upload.' });
    if (url.toLowerCase().startsWith('http://') || url.toLowerCase().startsWith('https://')) {
      return res.redirect(url);
    }
    const relPath = path.normalize(url).replace(/^(\.\.(\/|\\))+/, '').replace(/\\/g, '/');
    const fullPath = path.resolve(UPLOAD_DIR, relPath);
    if (!isPathUnderDir(fullPath, path.resolve(UPLOAD_DIR))) {
      return res.status(403).json({ success: false, message: 'Invalid result path.' });
    }
    const stat = await fs.promises.stat(fullPath).catch(() => null);
    if (!stat || !stat.isFile()) return res.status(404).json({ success: false, message: 'Result file not found.' });
    const name = path.basename(fullPath);
    res.setHeader('Content-Disposition', 'attachment; filename="' + name.replace(/"/g, '\\"') + '"');
    res.sendFile(fullPath, (err) => {
      if (err && !res.headersSent) res.status(500).json({ success: false, message: 'Download failed.' });
    });
  } catch (e) {
    console.error('GET /api/user/my-uploads/:uploadId/download-result', e);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Download failed.' });
  }
});

// ---- User: download processed results for a personal upload (ZIP) ----
app.get('/api/user/my-uploads/:id/download', requireAuth, async (req, res) => {
  const id = req.params.id && parseInt(req.params.id, 10);
  if (!id || isNaN(id) || !process.env.PG_DATABASE) {
    return res.status(400).json({ success: false, message: 'Valid upload id is required.' });
  }
  try {
    const email = req.user.email;
    
    // 1. Verify ownership and get file paths
    const q = await pgQuery('SELECT id, project_id, project_title, COALESCE(to_json(file_paths), \'[]\'::json) AS file_paths FROM public."ClientUploads" WHERE id = $1 AND LOWER(created_by_email) = LOWER($2)', [id, email]);
    const row = q && q.rows && q.rows[0];
    
    if (!row) return res.status(404).json({ success: false, message: 'Project not found or you do not have permission to download it.' });

    const filePaths = parseFilePaths(row.file_paths);

    if (filePaths.length === 0) {
      return res.status(404).json({ success: false, message: 'No result files are ready for download yet. Please contact admin.' });
    }

    let archiver;
    try {
      archiver = (await import('archiver')).default;
    } catch (e) {
      return res.status(503).json({ success: false, message: 'Download system is initializing. Please try again in a moment.' });
    }

    const zipName = 'results-' + (row.project_id || 'files').replace(/[^a-zA-Z0-9_-]/g, '_') + '.zip';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + zipName + '"');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (e) => {
      console.error('archiver error', e);
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);

    const uploadDirResolved = path.resolve(UPLOAD_DIR);
    let sftp = null;

    for (const rel of filePaths) {
      const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\))+/, '').replace(/\\/g, '/');
      const withoutUploadsPrefix = normalized.replace(/^uploads\/?/, '');
      const localFull = path.join(uploadDirResolved, withoutUploadsPrefix);
      
      try {
        const stat = await fs.promises.stat(localFull);
        if (stat.isFile()) {
          archive.file(localFull, { name: path.basename(localFull) });
          continue;
        }
      } catch (e) {
        // Not local, check SFTP relay
        if (remoteSftpConfig.host) {
          try {
            if (!sftp) sftp = await getRemoteSftpClient();
            if (sftp) {
              const remoteBase = process.env.REMOTE_SFTP_BASE_PATH || '';
              const remoteFull = path.posix.join(remoteBase, withoutUploadsPrefix);
              const exists = await sftp.exists(remoteFull);
              if (exists === '-') {
                console.log(`[download-relay] Fetching: ${remoteFull}`);
                const remoteStream = await sftp.get(remoteFull);
                
                await new Promise((resolve, reject) => {
                  remoteStream.on('error', reject);
                  archive.append(remoteStream, { name: path.basename(remoteFull) });
                  remoteStream.on('end', resolve);
                });
              }
            }
          } catch (sftpErr) {
            console.warn(`[download-relay] SFTP fetch failed for ${rel}:`, sftpErr.message);
          }
        }
      }
    }
    if (sftp) await sftp.end();

    await archive.finalize();
  } catch (e) {
    console.error('GET /api/user/my-uploads/:id/download', e);
    if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to generate download.' });
  }
});

// ---- User: delete personal client upload ----
app.delete('/api/user/my-uploads/:id', requireAuth, async (req, res) => {
  if (!process.env.PG_DATABASE) {
    return res.status(500).json({ success: false, message: 'Database not configured.' });
  }
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });

  try {
    const email = req.user.email;
    
    // 1. Verify ownership and get the project's folder paths
    const q1 = await pgQuery('SELECT id, file_paths FROM public."ClientUploads" WHERE id = $1 AND LOWER(created_by_email) = LOWER($2)', [id, email]);
    const row = q1 && q1.rows && q1.rows[0];
    
    if (!row) {
      return res.status(404).json({ success: false, message: 'Project not found or you do not have permission to delete it.' });
    }
    
    // 2. Erase the massive files on the hard drive to free up C: Space
    const filePaths = parseFilePaths(row.file_paths);
    const uploadDirResolved = path.resolve(UPLOAD_DIR);
    
    let targetDirToDelete = null;
    if (filePaths.length > 0) {
      const firstRel = filePaths[0];
      const normalized = path.normalize(firstRel).replace(/^(\.\.(\/|\\))+/, '').replace(/\\/g, '/');
      const withoutUploadsPrefix = normalized.replace(/^uploads\/?/, ''); 
      
      if (withoutUploadsPrefix.includes('/')) {
         const projDirName = withoutUploadsPrefix.split('/')[0]; // Extract "project_xyz"
         const fullProjDir = path.join(uploadDirResolved, projDirName);
         if (isPathUnderDir(fullProjDir, uploadDirResolved) && fullProjDir !== uploadDirResolved) {
             targetDirToDelete = fullProjDir;
         }
      }
    }
    
    if (targetDirToDelete) {
      try {
         await fs.promises.rm(targetDirToDelete, { recursive: true, force: true });
         console.log(`[delete] Wiped heavy project directory to free up space: ${targetDirToDelete}`);
      } catch (err) {
         console.warn(`[delete] Warning: Could not wipe physical directory: ${targetDirToDelete}`, err);
      }
    }
    
    // 3. Delete from virtual database
    await pgQuery('DELETE FROM public."ClientUploads" WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Project deleted successfully and hard drive space freed.' });
  } catch (e) {
    console.error('DELETE /api/user/my-uploads/:id', e);
    res.status(500).json({ success: false, message: 'Failed to delete project.' });
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

    if (filePaths.length === 0) {
      return res.status(404).json({ success: false, message: 'No files found for this upload.' });
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

    // Local disk storage
    const uploadDirResolved = path.resolve(UPLOAD_DIR);
    const projectRootResolved = path.resolve(PROJECT_ROOT);
    for (const rel of filePaths) {
      const normalized = path.normalize(rel).replace(/^(\.\.(\/|\\))+/, '').replace(/\\/g, '/');
      const withoutUploadsPrefix = normalized.replace(/^uploads\/?/, '');
      const candidates = [
        path.join(projectRootResolved, normalized),
        path.join(uploadDirResolved, withoutUploadsPrefix),
      ];
      let foundLocally = false;
      for (const full of candidates) {
        try {
          const stat = await fs.promises.stat(full);
          if (stat.isFile()) {
            archive.file(full, { name: path.basename(full) });
            foundLocally = true;
            break;
          }
        } catch (e) { /* try next */ }
      }

      if (!foundLocally && remoteSftpConfig.host) {
        try {
          if (!sftp) sftp = await getRemoteSftpClient();
          if (sftp) {
            const remoteBase = process.env.REMOTE_SFTP_BASE_PATH || '';
            const remoteFull = path.posix.join(remoteBase, withoutUploadsPrefix);
            const exists = await sftp.exists(remoteFull);
            if (exists === '-') {
              const remoteStream = await sftp.get(remoteFull);
              await new Promise((resolve, reject) => {
                remoteStream.on('error', reject);
                archive.append(remoteStream, { name: path.basename(remoteFull) });
                remoteStream.on('end', resolve);
              });
            }
          }
        } catch (err) {
          console.warn(`[admin-download-relay] SFTP fetch failed:`, err.message);
        }
      }
    }
    if (sftp) await sftp.end();

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
  
  const validActions = ['accept', 'processing', 'reject'];
  if (!validActions.includes(actionLower)) {
    return res.status(400).json({ success: false, message: 'action must be "accept", "processing", or "reject".' });
  }
  if (actionLower === 'reject' && !reason.trim()) {
    return res.status(400).json({ success: false, message: 'A reason is required when rejecting a request.' });
  }
  const decidedBy = (req.user && req.user.email) ? req.user.email : (req.body && req.body.decided_by) || 'admin';
  try {
    const finalStatus = actionLower === 'reject' ? 'rejected' : (actionLower === 'accept' ? 'accepted' : 'processing');
    const r = await pgQuery(
      `UPDATE public."ClientUploads" SET request_status = $1, rejected_reason = $2, decided_at = NOW(), decided_by = $3 WHERE id = $4 RETURNING id, request_status, decided_at`,
      [finalStatus, actionLower === 'reject' ? reason.trim() : null, decidedBy, id]
    );
    const row = r && r.rows && r.rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Client upload not found.' });
    if (actionLower === 'processing') {
      try {
        await pgQuery(
          `INSERT INTO public."ProcessingRequests" (upload_id, status, requested_by)
           SELECT $1, 'processing', $2
           WHERE NOT EXISTS (SELECT 1 FROM public."ProcessingRequests" WHERE upload_id = $1)`,
          [id, decidedBy]
        );
      } catch (prErr) {
        console.error('Create ProcessingRequest on Begin Processing', prErr);
      }
    }
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

// ---- Admin: complete processing request (upload 3D model file or set result URL) ----
app.post('/api/admin/processing-requests/:id/complete', (req, res, next) => {
  uploadProcessedResult.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, message: 'File too large. Maximum 500MB.' });
      return next(err);
    }
    next();
  });
}, async (req, res) => {
  const id = req.params.id && parseInt(req.params.id, 10);
  if (!id || isNaN(id) || !process.env.PG_DATABASE) {
    return res.status(400).json({ success: false, message: 'Valid processing request id is required.' });
  }
  const resultUrlFromBody = (req.body && (req.body.result_tileset_url || req.body.resultUrl || '')).trim() || null;
  let resultTilesetUrl = resultUrlFromBody;
  if (req.file && req.file.filename) {
    resultTilesetUrl = 'processed-results/' + req.file.filename;
  }
  if (!resultTilesetUrl) {
    return res.status(400).json({ success: false, message: 'Upload a 3D model file or provide a result URL.' });
  }
  try {
    const r = await pgQuery(
      `UPDATE public."ProcessingRequests" SET status = 'completed', completed_at = NOW(), result_tileset_url = $1 WHERE id = $2 RETURNING id, status, completed_at, result_tileset_url`,
      [resultTilesetUrl, id]
    );
    const row = r && r.rows && r.rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Processing request not found.' });
    res.json({ success: true, id: row.id, status: row.status, completed_at: row.completed_at, result_tileset_url: row.result_tileset_url });
  } catch (e) {
    console.error('POST /api/admin/processing-requests/:id/complete', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to complete.' });
  }
});

// ---- Admin: mark processing request as delivered to client (sets ClientUploads.request_status to 'sent'; subscriber sees "Received") ----
app.post('/api/admin/processing-requests/:id/delivery', express.json(), async (req, res) => {
  const id = req.params.id && parseInt(req.params.id, 10);
  if (!id || isNaN(id) || !process.env.PG_DATABASE) {
    return res.status(400).json({ success: false, message: 'Valid processing request id is required and PostgreSQL must be configured.' });
  }
  const deliveryNotes = (req.body && (req.body.delivery_notes || req.body.notes || '')).trim() || null;
  try {
    const r = await pgQuery(
      `UPDATE public."ProcessingRequests" SET delivered_at = COALESCE(delivered_at, NOW()), delivery_notes = COALESCE($1, delivery_notes) WHERE id = $2 RETURNING id, upload_id, delivered_at, delivery_notes`,
      [deliveryNotes, id]
    );
    const row = r && r.rows && r.rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Processing request not found.' });
    await pgQuery(
      `UPDATE public."ClientUploads" SET request_status = 'sent', decided_at = NOW() WHERE id = $1`,
      [row.upload_id]
    );
    res.json({ success: true, id: row.id, upload_id: row.upload_id, delivered_at: row.delivered_at, delivery_notes: row.delivery_notes });
  } catch (e) {
    console.error('POST /api/admin/processing-requests/:id/delivery', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to update delivery.' });
  }
});

// ---- User: confirm received (subscriber clicks "Confirm received" after downloading 3D model; sets status to completed on both sides) ----
app.post('/api/user/my-uploads/:id/confirm-received', requireAuth, async (req, res) => {
  const uploadId = req.params.id && parseInt(req.params.id, 10);
  if (!uploadId || isNaN(uploadId) || !process.env.PG_DATABASE) {
    return res.status(400).json({ success: false, message: 'Invalid upload id.' });
  }
  try {
    const email = req.user.email;
    const r = await pgQuery(
      `UPDATE public."ClientUploads" SET request_status = 'completed', decided_at = NOW() WHERE id = $1 AND LOWER(created_by_email) = LOWER($2) AND request_status = 'sent' RETURNING id, request_status`,
      [uploadId, email]
    );
    const row = r && r.rows && r.rows[0];
    if (!row) return res.status(404).json({ success: false, message: 'Upload not found, access denied, or status is not Received (cannot confirm).' });
    res.json({ success: true, id: row.id, request_status: row.request_status });
  } catch (e) {
    console.error('POST /api/user/my-uploads/:id/confirm-received', e);
    res.status(500).json({ success: false, message: 'Failed to confirm.' });
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

/**
 * Background Automation: SFTP Result Watcher
 * Periodically scans the uploads folder for processed results (folders named "1")
 * and automatically updates the database status to "completed".
 */
async function runProcessingPulse() {
  if (!process.env.PG_DATABASE) return;

  // 1. Local Disk Scan (Fallback/Legacy)
  try {
    const uploadDirResolved = path.resolve(UPLOAD_DIR);
    if (fs.existsSync(uploadDirResolved)) {
      const projectDirs = await fs.promises.readdir(uploadDirResolved, { withFileTypes: true });
      for (const entry of projectDirs) {
        if (!entry.isDirectory() || entry.name === 'map-thumbnails' || entry.name.startsWith('temp_')) continue;
        const resultsPath = path.join(uploadDirResolved, entry.name, '1');
        if (fs.existsSync(resultsPath) && fs.statSync(resultsPath).isDirectory()) {
          await updateProjectCompletion(entry.name, `uploads/${entry.name}/1`);
        }
      }
    }
  } catch (err) { console.error('[pulse-local] Scan error:', err.message); }

  // 2. Remote SFTP Scan (New Priority)
  if (remoteSftpConfig.host) {
    let sftp;
    try {
      sftp = await getRemoteSftpClient();
      if (sftp) {
        const remoteBase = process.env.REMOTE_SFTP_BASE_PATH || '';
        const remoteDirs = await sftp.list(remoteBase);
        
        for (const entry of remoteDirs) {
          if (entry.type !== 'd' || entry.name === 'map-thumbnails' || entry.name.startsWith('temp_')) continue;
          
          const remoteResultsPath = path.posix.join(remoteBase, entry.name, '1');
          const exists = await sftp.exists(remoteResultsPath);
          if (exists === 'd') {
            await updateProjectCompletion(entry.name, `uploads/${entry.name}/1`);
          }
        }
      }
    } catch (err) {
      console.error('[pulse-remote] Scan error:', err.message);
    } finally {
      if (sftp) await sftp.end();
    }
  }
}

async function updateProjectCompletion(folderName, finalRelativePath) {
  const q = await pgQuery(
    `SELECT id, project_id, request_status FROM public."ClientUploads" 
     WHERE (project_id = $1 OR file_paths::text LIKE $2) 
     AND request_status != 'completed' LIMIT 1`,
    [folderName, `%${folderName}%`]
  );

  const row = q && q.rows && q.rows[0];
  if (row) {
    console.log(`[pulse] Auto-detecting results for project: ${row.project_id} (ID: ${row.id})`);
    await pgQuery(
      `UPDATE public."ClientUploads" 
       SET request_status = 'completed', 
           file_paths = $1,
           decided_at = COALESCE(decided_at, NOW()),
           decided_by = COALESCE(decided_by, 'system-pulse')
       WHERE id = $2`,
      [`{${finalRelativePath}}`, row.id]
    );
    console.log(`[pulse] Successfully marked project #${row.id} as completed.`);
  }
}

function startProcessingPulse() {
  console.log('[pulse] Starting background result scanner (interval: 1m)...');
  // Run once on startup
  setTimeout(runProcessingPulse, 5000);
  // Then every minute
  setInterval(runProcessingPulse, 60000);
}

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
    
    // Start background scanner
    startProcessingPulse();
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

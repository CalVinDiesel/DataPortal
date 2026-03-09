/**
 * Better Auth configuration for TemaDataPortal.
 * Used for Google OAuth; email/password remains handled by custom routes + users.json.
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { betterAuth } from "better-auth";
import { Pool } from "pg";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env"), override: true });

const PORT = process.env.PORT || 3000;
const baseURL = process.env.BETTER_AUTH_URL || process.env.AUTH_SERVER_BASE || `http://localhost:${PORT}`;
const frontEndUrl = process.env.FRONT_END_URL || "http://localhost:3000/html/front-pages/landing-page.html";

function cleanEnv(s) {
  if (typeof s !== "string") return "";
  return String(s).replace(/\r$/, "").trim();
}
const googleClientId = cleanEnv(process.env.GOOGLE_CLIENT_ID);
const googleClientSecret = cleanEnv(process.env.GOOGLE_CLIENT_SECRET);

/** Pool for Better Auth (GoogleUsers, session, account tables). Uses same DB as MapData when PG_* set. */
function getAuthPool() {
  const db = process.env.PG_DATABASE;
  if (!db) return null;
  return new Pool({
    host: process.env.PG_HOST || "localhost",
    port: parseInt(process.env.PG_PORT || "5432", 10),
    user: process.env.PG_USER || "postgres",
    password: process.env.PG_PASSWORD || "",
    database: db,
    max: 5,
    idleTimeoutMillis: 30000,
  });
}

const pool = getAuthPool();

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET || "temadataportal-auth-secret-change-in-production",
  database: pool || new Database(path.join(__dirname, "data", "better-auth.sqlite")),
  user: {
    modelName: "GoogleUsers",
  },
  onAPIError: {
    errorURL: "http://localhost:3000/html/front-pages/login.html?error=cancelled",
  },
  socialProviders: {
    ...(googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        }
      : {}),
  },
  trustedOrigins: [
    baseURL,
    new URL(frontEndUrl).origin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter(Boolean),
});

export { baseURL, frontEndUrl, googleClientId, googleClientSecret };

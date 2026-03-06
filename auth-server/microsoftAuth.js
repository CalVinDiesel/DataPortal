// auth-server/microsoftAuth.js
// Microsoft Authentication using @azure/msal-node
// Compatible with ESM ("type": "module"), Express v4, express-session

import * as msal from "@azure/msal-node";

// ─── MSAL Configuration ───────────────────────────────────────────────────────

const msalConfig = {
  auth: {
    clientId: process.env.MICROSOFT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}`,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message) {
        // Uncomment for debugging MSAL internals:
        // console.log("[MSAL]", message);
      },
      piiLoggingEnabled: false,
      logLevel: msal.LogLevel.Warning,
    },
  },
};

// Confidential client = server-side app with a secret (correct for Express backends)
const msalClient = new msal.ConfidentialClientApplication(msalConfig);

// Scopes: openid + profile + email gives you name, email, and unique ID
const SCOPES = ["openid", "profile", "email", "User.Read"];

// ─── Step 1: Generate Login URL ───────────────────────────────────────────────

/**
 * Call this when the user clicks "Sign in with Microsoft".
 * Returns a URL to redirect the user to Microsoft's login page.
 */
export async function getMicrosoftAuthUrl() {
  const authUrlParams = {
    scopes: SCOPES,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI,
  };

  const authUrl = await msalClient.getAuthCodeUrl(authUrlParams);
  return authUrl;
}

// ─── Step 2: Exchange Code for Token + User Info ──────────────────────────────

/**
 * After Microsoft redirects back with ?code=..., call this to:
 * 1. Exchange the code for tokens
 * 2. Extract the user's profile from the ID token claims
 *
 * Returns a normalized user object: { id, email, name, provider }
 */
export async function handleMicrosoftCallback(code) {
  const tokenRequest = {
    code,
    scopes: SCOPES,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI,
  };

  const tokenResponse = await msalClient.acquireTokenByCode(tokenRequest);

  // ID token claims contain the user's profile
  const claims = tokenResponse.idTokenClaims;

  const user = {
    id: claims.oid,           // Unique Azure AD object ID (stable, use as primary key)
    email: claims.email || claims.preferred_username,
    name: claims.name,
    provider: "microsoft",
  };

  return user;
}
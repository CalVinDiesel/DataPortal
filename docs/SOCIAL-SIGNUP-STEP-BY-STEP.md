# Step-by-Step: Enable Google & Facebook Sign-Up in TemaDataPortal

This guide takes you from zero to a working “Sign up with Google” and “Sign up with Facebook” in TemaDataPortal. Follow the steps in order.

---

## What You’ll Do

1. **Google Cloud** – Create a project and OAuth credentials.
2. **Facebook (Meta)** – Create an app and get App ID + Secret.
3. **Backend** – Run the included auth server (Node.js) that handles OAuth.
4. **Front end** – Point the register page buttons to your backend.

---

## Step 1: Google Cloud Setup

### 1.1 Create a project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top → **New Project**.
3. Name it (e.g. “TemaDigital Data Portal”) → **Create** and select it.

### 1.2 OAuth consent screen

1. Left menu: **APIs & Services** → **OAuth consent screen**.
2. User type: **External** → **Create**.
3. Fill:
   - **App name**: TemaDigital Data Portal (or your name).
   - **User support email**: your email.
   - **Developer contact**: your email.
4. **Save and Continue**.
5. **Scopes**: **Add or Remove Scopes** → add `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `openid` → **Update** → **Save and Continue**.
6. **Test users** (if app is in Testing): add your Google account. **Save and Continue** → **Back to Dashboard**.

### 1.3 Create OAuth credentials

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
2. Application type: **Web application**.
3. Name: e.g. “TemaDataPortal Web”.
4. **Authorized JavaScript origins** – add:
   - `http://localhost:5501`
   - `http://localhost:3000`
   - Add your production URL later (e.g. `https://yourdomain.com`).
5. **Authorized redirect URIs** – add (must match your backend):
   - `http://localhost:3000/api/auth/google/callback`
   - For production: `https://your-api-domain.com/api/auth/google/callback`
6. **Create** → copy the **Client ID** and **Client Secret** (you’ll put them in `.env` in Step 3).

---

## Step 2: Facebook (Meta) Setup

### 2.1 Create an app

1. Go to [Meta for Developers](https://developers.facebook.com/) and log in.
2. **My Apps** → **Create App** → **Consumer** → **Next**.
3. App name: e.g. “TemaDigital Data Portal”, contact email → **Create App**.

### 2.2 Add Facebook Login (Web)

1. In the app dashboard, find **Facebook Login** → **Set Up**.
2. Choose **Web**.
3. **Facebook Login** → **Settings** (left menu).

### 2.3 Redirect URI

1. Under **Valid OAuth Redirect URIs** add:
   - `http://localhost:3000/api/auth/facebook/callback`
   - For production: `https://your-api-domain.com/api/auth/facebook/callback`
2. **Save Changes**.

### 2.4 App ID and App Secret

1. **Settings** → **Basic**.
2. Copy **App ID** and **App Secret**. You’ll put them in `.env` in Step 3.
3. If the app is in **Development** mode, only added test users can sign in. To allow everyone, switch to **Live** and complete App Review if required for `email` / `public_profile`.

---

## Step 3: Run the Auth Backend

The project includes a small Node.js auth server that does the OAuth redirects and callbacks.

### 3.1 Install dependencies

In a terminal, go to the auth server folder and install:

```bash
cd auth-server
npm install
```

### 3.2 Configure environment

1. Copy the example env file:
   - **Windows (PowerShell):** `Copy-Item .env.example .env`
   - **Mac/Linux:** `cp .env.example .env`
2. Open `.env` and set (use the values from Step 1 and Step 2):

```env
PORT=3000

# Where your front end runs (used for redirect after login)
FRONT_END_URL=http://localhost:5501/html/front-pages/landing-page.html

# Google (from Step 1)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Facebook (from Step 2)
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
```

- Replace `your-google-client-id` and `your-google-client-secret` with the values from Google Cloud.
- Replace `your-facebook-app-id` and `your-facebook-app-secret` with the values from Meta.
- If you open the portal from a different URL (e.g. `http://127.0.0.1:5501/...`), set `FRONT_END_URL` to that base + path to the page you want after login (e.g. `landing-page.html`).

### 3.3 Start the server

```bash
node server.js
```

You should see something like: `Auth server running on http://localhost:3000`. Leave this terminal open.

---

## Step 4: Point the Register Page to the Backend

### 4.1 Set the OAuth URLs in the front end

1. Open `html/front-pages/register.html` in an editor.
2. Find the two lines near the top of the script (around lines 84–85):

```javascript
var AUTH_GOOGLE_URL = '';    // e.g. '/api/auth/google' or 'https://your-api.com/api/auth/google'
var AUTH_FACEBOOK_URL = '';  // e.g. '/api/auth/facebook' or 'https://your-api.com/api/auth/facebook'
```

3. Set them to your auth server (same as in Step 3):

- If the portal is opened from the same machine as the backend (e.g. front end at `http://localhost:5501`, backend at `http://localhost:3000`):

```javascript
var AUTH_GOOGLE_URL = 'http://localhost:3000/api/auth/google';
var AUTH_FACEBOOK_URL = 'http://localhost:3000/api/auth/facebook';
```

- If later you serve the front end and backend from the same domain, you can use:
  - `AUTH_GOOGLE_URL = '/api/auth/google';`
  - `AUTH_FACEBOOK_URL = '/api/auth/facebook';`

Save `register.html`.

### 4.2 Open the portal

1. Serve the TemaDataPortal front end (e.g. open the project in VS Code and use the “Live Server” extension, or any static server so the register page is at something like `http://localhost:5501/html/front-pages/register.html`).
2. Make sure the auth server is still running (`node server.js` in `auth-server`).

### 4.3 Test

1. Go to the register page.
2. Click **Sign up with Google** – you should be sent to Google, then back to the URL set in `FRONT_END_URL` (e.g. landing page).
3. Click **Sign up with Facebook** – same flow with Facebook.

If you see an error from Google or Facebook (e.g. “redirect_uri_mismatch”), double-check the redirect URIs in Step 1.3 and Step 2.3 exactly match what the backend uses (e.g. `http://localhost:3000/api/auth/google/callback` and `http://localhost:3000/api/auth/facebook/callback`).

---

## Step 5: After Login (Optional)

The sample auth server only redirects to `FRONT_END_URL` and does not create a real user in a database. To finish the integration:

1. **Session or JWT** – In `auth-server/server.js`, after you get the user’s email/name from Google or Facebook, create or find the user in your database, then:
   - Set a session cookie, or
   - Redirect to the front end with a JWT in the URL (or use a different flow).
2. **Front end** – On the landing (or dashboard) page, call an API that checks the session or JWT and returns the current user, so the portal can show “Logged in as …” or protect routes.

You can keep using the same OAuth URLs; only the callback logic in `server.js` needs to be extended (database + session/JWT).

---

## Checklist

- [ ] Google Cloud: project, OAuth consent screen, Web client with redirect `http://localhost:3000/api/auth/google/callback`
- [ ] Meta: app, Facebook Login (Web), redirect `http://localhost:3000/api/auth/facebook/callback`, App ID and App Secret
- [ ] `auth-server`: `.env` filled with Google and Facebook credentials and `FRONT_END_URL`
- [ ] `auth-server`: `npm install` and `node server.js` running
- [ ] `register.html`: `AUTH_GOOGLE_URL` and `AUTH_FACEBOOK_URL` set to `http://localhost:3000/api/auth/google` and `http://localhost:3000/api/auth/facebook`
- [ ] Register page opens in browser; “Sign up with Google” and “Sign up with Facebook” go to provider and then back to your front end

For more detail on OAuth and security, see [SOCIAL-SIGNUP-SETUP.md](./SOCIAL-SIGNUP-SETUP.md).

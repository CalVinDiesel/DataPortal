# Google Sign-Up & Login — Step-by-Step Setup

You already have a **Google Cloud project** with **Client ID** and **Client Secret**. Follow these steps to get "Sign up with Google" and "Log in with Google" working in TemaDataPortal.

---

## Step 1: Set the redirect URI in Google Cloud

Google must know where to send users after they sign in. That URL is your **auth server callback**.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and select your project (**Temadigital Data Portal**).
2. Open **APIs & Services** → **Credentials**.
3. Click your **OAuth 2.0 Client ID** (Web application).
4. Under **Authorized redirect URIs**, add exactly:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
   - Use `http` (not `https`) for local testing.
   - Port `3000` must match the port your auth server uses (see Step 3).
   - No trailing slash.
5. Under **Authorized JavaScript origins**, add (if not already there):
   - `http://localhost:5501` (if you open the portal with Live Server on 5501)
   - `http://localhost:3000`
6. Click **Save**.

---

## Step 2: Create and fill the auth server `.env` file

The auth server needs your Google credentials and the URL of your front end.

1. Open a terminal and go to the auth server folder:
   ```bash
   cd auth-server
   ```
2. Create `.env` from the example:
   - **Windows (PowerShell):** `Copy-Item .env.example .env`
   - **Mac/Linux:** `cp .env.example .env`
3. Open `.env` in an editor and set:

   ```env
   PORT=3000

   # Page to open after Google sign-in (adjust if your portal URL is different)
   FRONT_END_URL=http://localhost:5501/html/front-pages/landing-page.html

   # Paste your Google Cloud Client ID and Client Secret here
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret

   # Leave these empty for now (Facebook later)
   FACEBOOK_APP_ID=
   FACEBOOK_APP_SECRET=
   ```

   Replace `your-client-id` and `your-client-secret` with the values from Google Cloud (Credentials → your OAuth client).  
   If you open the portal at a different address (e.g. `http://127.0.0.1:5501/...`), set `FRONT_END_URL` to that base URL + the path to the page you want after login (e.g. `landing-page.html`).

4. Save the file.

---

## Step 3: Install dependencies and start the auth server

1. In the same terminal (inside `auth-server`):

   ```bash
   npm install
   npm start
   ```

2. You should see something like:
   ```
   Auth server running on http://localhost:3000
     Google:  GET http://localhost:3000/api/auth/google
   ```
3. Leave this terminal open so the server keeps running.

---

## Step 4: Open the portal and test

1. **Serve your front end**  
   Open the TemaDataPortal project (e.g. in VS Code) and start **Live Server**, or any static server, so the site is available at something like:
   `http://localhost:5501/html/front-pages/register.html`

2. **Test sign-up with Google**
   - Go to the **Register** page (`register.html`).
   - Click **Sign up with Google**.
   - You should be redirected to Google to sign in, then back to your `FRONT_END_URL` (e.g. landing page).

3. **Test login with Google**
   - Go to the **Login** page (`login.html`).
   - Click **Log in with Google**.
   - Same flow: Google sign-in → redirect back to your portal.

If you see **redirect_uri_mismatch** from Google, double-check Step 1: the redirect URI in Google Cloud must be exactly `http://localhost:3000/api/auth/google/callback` (same port and path).

---

## Step 5: What’s next (optional)

- **Sessions / database:** The auth server currently only redirects to `FRONT_END_URL` and keeps the user in a session on the server. To persist users (e.g. save to a database, use JWT, or protect other pages), you’ll extend the callback in `auth-server/server.js` and optionally add APIs for the front end.
- **Facebook:** When you’re ready, add Facebook App ID and Secret to `.env`, set the Facebook redirect URI in Meta to `http://localhost:3000/api/auth/facebook/callback`, and the existing "Sign up with Facebook" on the register page will work.

---

## Quick checklist

- [ ] Google Cloud: Redirect URI = `http://localhost:3000/api/auth/google/callback`, origins include `http://localhost:5501` and `http://localhost:3000`
- [ ] `auth-server/.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FRONT_END_URL` set
- [ ] `npm install` and `npm start` in `auth-server` — server running on port 3000
- [ ] Portal opened (e.g. Live Server on 5501), Register and Login pages tested with Google

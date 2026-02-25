# How to Activate Google & Facebook Sign-Up for TemaDigital Data Portal

This guide explains how to enable "Sign up with Google" and "Sign up with Facebook" so users can create an account using their existing Google or Facebook account.

---

## Overview

Social sign-up uses **OAuth 2.0**. Flow in short:

1. User clicks "Sign up with Google" or "Sign up with Facebook".
2. User is sent to Google/Facebook to sign in and approve access.
3. Google/Facebook redirects back to your site with a **code** (or token).
4. Your **backend server** exchanges that code for the user’s profile (email, name, etc.) and then creates or logs in the user in your system.

So you need:

- **Google**: A project in Google Cloud with OAuth credentials.
- **Facebook**: An app in Meta (Facebook) Developers with Facebook Login.
- **Your backend**: Auth routes that start the OAuth flow and handle the redirect (e.g. `/api/auth/google`, `/api/auth/facebook`).

---

## Part 1: Google Sign-Up

### 1.1 Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or select an existing one), e.g. "TemaDigital Data Portal".
3. Make sure the project is selected in the top bar.

### 1.2 Configure the OAuth consent screen

1. In the left menu go to **APIs & Services** → **OAuth consent screen**.
2. Choose **External** (so any Google user can sign up) → **Create**.
3. Fill in:
   - **App name**: e.g. "TemaDigital Data Portal"
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**.
5. **Scopes**: Add scope `email`, `profile`, `openid` if not already there. Save and continue.
6. **Test users** (optional): If the app is in "Testing", add test Google accounts. Later you can submit for "Production" so everyone can use it.

### 1.3 Create OAuth 2.0 credentials

1. Go to **APIs & Services** → **Credentials**.
2. Click **Create Credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: e.g. "TemaDigital Web Client".
5. **Authorized JavaScript origins** (where your front end runs):
   - `http://localhost:5501` (for local testing)
   - `http://localhost:3000` (if you run a local server)
   - `https://yourdomain.com` (your real domain when you deploy)
6. **Authorized redirect URIs** (where Google sends the user after login). These must be **backend** URLs that handle the callback, for example:
   - `http://localhost:3000/api/auth/google/callback` (local backend)
   - `https://yourdomain.com/api/auth/google/callback` (production backend)
7. Click **Create**. Copy the **Client ID** and **Client Secret**; you will use them in your backend.

### 1.4 Backend: Google OAuth route

Your server (Node, PHP, Python, etc.) must:

1. **Start login**: Redirect the user to Google’s authorization URL (include your Client ID, redirect_uri, scope `email profile openid`, state).
2. **Callback route** (e.g. `/api/auth/google/callback`):
   - Read the `code` (and `state`) from the query string.
   - Exchange `code` for tokens with Google (using Client ID + Client Secret).
   - Use the access token (or ID token) to get the user’s email and name.
   - Create or find the user in your database and start a session (or issue a JWT), then redirect the user to your front end (e.g. landing or dashboard).

Example (Node.js with Express and `passport` + `passport-google-oauth20`):

- Install: `npm install passport passport-google-oauth20`
- Configure strategy with your Client ID and Client Secret and callback URL.
- Route `GET /api/auth/google` → redirect to Google.
- Route `GET /api/auth/google/callback` → handle callback, create/find user, redirect to front end.

### 1.5 Front end: “Sign up with Google” button

Point the button to your backend route that starts the Google flow, for example:

- **URL**: `https://your-backend.com/api/auth/google` (or same origin, e.g. `/api/auth/google` if the front end is served from the same domain).

When the user clicks "Sign up with Google", send them to this URL; the backend will redirect to Google, then back to your callback, then to your app.

---

## Part 2: Facebook Sign-Up

### 2.1 Create a Facebook app

1. Go to [Meta for Developers](https://developers.facebook.com/) and sign in.
2. **My Apps** → **Create App** → choose **Consumer** (or **Business** if you prefer).
3. App name: e.g. "TemaDigital Data Portal". Contact email, then **Create App**.

### 2.2 Add Facebook Login product

1. In the app dashboard, open **Add Products** (or **Products** → **Facebook Login**).
2. Click **Set Up** on **Facebook Login** → choose **Web**.
3. Under **Facebook Login** → **Settings** you will set the redirect URI.

### 2.3 Configure Facebook Login (Web)

1. Go to **Facebook Login** → **Settings** (in the left menu).
2. **Valid OAuth Redirect URIs**: Add your **backend** callback URLs, e.g.:
   - `http://localhost:3000/api/auth/facebook/callback`
   - `https://yourdomain.com/api/auth/facebook/callback`
3. Save.

### 2.4 Get App ID and App Secret

1. Go to **Settings** → **Basic**.
2. Copy **App ID** (public) and **App Secret** (keep secret, use only on the server).

### 2.5 App mode: Development vs Live

- In **Development** mode, only app admins/developers/testers can log in.
- To allow any user, switch the app to **Live** (top of the dashboard) and complete App Review if required for the permissions you use (e.g. `email`, `public_profile`).

### 2.6 Backend: Facebook OAuth route

Your backend must:

1. **Start login**: Redirect the user to Facebook’s OAuth URL (include App ID, redirect_uri, scope e.g. `email,public_profile`, state).
2. **Callback route** (e.g. `/api/auth/facebook/callback`):
   - Read the `code` from the query string.
   - Exchange `code` for an access token (using App ID + App Secret).
   - Call Facebook’s Graph API (e.g. `me?fields=id,name,email`) to get the user’s name and email.
   - Create or find the user in your database, start a session (or JWT), then redirect to your front end.

Example (Node.js with Passport):

- Install: `npm install passport passport-facebook`
- Configure strategy with App ID, App Secret, and callback URL.
- Route `GET /api/auth/facebook` → redirect to Facebook.
- Route `GET /api/auth/facebook/callback` → handle callback, create/find user, redirect to front end.

### 2.7 Front end: “Sign up with Facebook” button

Point the button to your backend route that starts the Facebook flow, e.g.:

- **URL**: `https://your-backend.com/api/auth/facebook` (or `/api/auth/facebook` if same origin).

---

## Part 3: Connect your front end (register.html)

Once your backend is running and the routes are set:

1. **Same-origin backend (recommended)**  
   If the front end and backend are on the same domain (e.g. `https://yourdomain.com`):
   - Google button: `href="/api/auth/google"` (or your actual path).
   - Facebook button: `href="/api/auth/facebook"`.

2. **Backend on a different domain**  
   Use the full URL:
   - Google: `href="https://your-api.com/api/auth/google"`.
   - Facebook: `href="https://your-api.com/api/auth/facebook"`.

3. **Remove the placeholder `alert`** in `register.html` so the buttons simply navigate to these URLs (or use `window.location.href = '...'` in JavaScript if you need to build the URL dynamically).

No front-end SDK is required for this “redirect” flow: the backend handles Google and Facebook via server-side OAuth.

---

## Checklist

**Google**

- [ ] Google Cloud project created
- [ ] OAuth consent screen configured (External, scopes: email, profile, openid)
- [ ] OAuth client ID (Web application) created
- [ ] Authorized JavaScript origins and **Authorized redirect URIs** set to your backend callback
- [ ] Backend route that redirects to Google and callback route that exchanges code and creates/logs in user
- [ ] Register page “Sign up with Google” links to `/api/auth/google` (or full URL)

**Facebook**

- [ ] Meta app created, Facebook Login (Web) added
- [ ] Valid OAuth Redirect URIs set to your backend callback
- [ ] App ID and App Secret copied; App in Live mode if needed
- [ ] Backend route that redirects to Facebook and callback that exchanges code and creates/logs in user
- [ ] Register page “Sign up with Facebook” links to `/api/auth/facebook` (or full URL)

---

## Security notes

- Never put **Client Secret** (Google) or **App Secret** (Facebook) in front-end code. Use them only on the server.
- Use **state** in OAuth to prevent CSRF (most libraries do this automatically).
- Store only what you need (e.g. email, name, provider id) and comply with Google and Facebook platform policies and privacy requirements.

If you tell me your backend stack (e.g. Node/Express, PHP, Python/Django), I can outline exact code for the Google and Facebook routes and callbacks.

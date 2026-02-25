# Auth server – what it is and what you need

## What is the auth server for?

The **auth server** is a small backend that powers your Data Portal’s **login and sign-up**:

- **“Sign up / Log in with Google”** – talks to Google, then sends the user back to your portal.
- **“Sign up with email”** – saves new accounts (email + hashed password) and checks them on login.
- **“Log in with email”** – checks email + password and logs the user in.

Your portal pages (e.g. `register.html`, `login.html`) call this server. If it isn’t running, “Sign up with email” and “Log in with email” will show “Cannot reach server.”

---

## What’s in this folder (only what you need)

| Item | Needed? | What it is |
|------|--------|------------|
| **server.js** | Yes | The only app file. All login/sign-up logic lives here. |
| **package.json** | Yes | Tells npm which packages to install (express, passport, etc.). |
| **.env** | Yes | Your secrets (Google Client ID/Secret, `FRONT_END_URL`). Never commit this. |
| **.env.example** | Optional | Template for `.env`. Safe to keep for reference. |
| **data/** | Yes | Where email/password users are stored (`data/users.json`). Created automatically. |
| **node_modules/** | Yes | Installed by `npm install`. See below why there are so many files and why you must not delete any. |
| **.gitignore** | Optional | Keeps `.env` and `data/users.json` out of git. Good to keep. |

Nothing else in this folder is required to run the Data Portal. The diagnostic script that was here has been removed.

---

## How to run it

From the project root:

```bash
npm start
```

Or from this folder:

```bash
cd auth-server
npm start
```

Keep that terminal open while you use the portal’s login or register.

---

## Why is `node_modules` so big? Can I delete “unused” files?

**Short answer:** Every file in `node_modules` is used. Do **not** delete files or folders inside it, or the auth server will break.

**Why so many files?** Your app uses 8 packages (express, passport, bcryptjs, etc.). Each of those packages depends on other packages, and those depend on more. For example, `express` alone pulls in dozens of small libraries (for parsing URLs, handling cookies, etc.). So `npm install` creates a **dependency tree**: your 8 packages plus everything they need. That’s why you see hundreds of files. This is normal for any Node.js project.

**There are no “unused” files to clean up.** npm only installs what some package declared it needs. Removing files by hand would break that package (or another that depends on it). The only way to have fewer packages is to remove a **whole dependency** from `package.json` (e.g. remove Facebook login if you don’t need it), then run `npm install` again. That reduces features; it doesn’t just “clean” unused code.

**Best practice:** Ignore the contents of `node_modules`. Don’t edit or delete anything inside it. If you need a fresh install, delete the whole `node_modules` folder and run `npm install` again—npm will recreate it from `package.json`.

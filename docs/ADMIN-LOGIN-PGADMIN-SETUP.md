# Admin login: pgAdmin setup (Google & Microsoft)

If **Google** and **Microsoft** login both work for signing in, but you are **not** taken to the **admin portal** (you stay on client/landing), the app is not finding your account as **admin** in the database.

Do the following in **pgAdmin** so your admin email is stored correctly.

---

## 1. Use the right database

In pgAdmin, connect to your server and open the database used by the auth server (e.g. **Temadigital_Data_Portal**).  
This must be the same database set in `auth-server/.env` as **PG_DATABASE**.

---

## 2. Create the user table (if needed)

If the table **DataPortalUsers** does not exist yet, run the script that creates it:

- **File:** `auth-server/sql/09-data-portal-users-table.sql`  
- In pgAdmin: **Tools → Query Tool**, open that file (or paste its contents), then **Execute (F5)**.

---

## 3. Put your admin account into DataPortalUsers

Run the script that inserts or updates your admin user:

- **File:** `auth-server/sql/12-ensure-admin-in-data-portal-users.sql`  
- In pgAdmin: **Query Tool**, open the file or paste its contents.
- **Edit the script** so the email and name match your admin account (the Gmail you use for Google and Microsoft).
- **Execute (F5)**.

That script will:

- Create **DataPortalUsers** if it does not exist.
- Insert your admin email with **role = 'admin'**, or update the existing row to **role = 'admin'**.

---

## 4. Restart the auth server and test

1. Stop the auth server (Ctrl+C in the terminal where `npm start` is running).
2. Start it again: `npm start` (from the `auth-server` folder).
3. Log in with **Google** using your admin Gmail → you should reach the admin portal.
4. Log out, then log in with **Microsoft** using the **same** admin Gmail → you should also reach the admin portal.

---

## 5. If it still doesn’t work

- Confirm in pgAdmin that **DataPortalUsers** has a row with your **email** (same address you use to log in) and **role = 'admin'**.
- Confirm **PG_DATABASE** (and other PG_* variables) in `auth-server/.env` point to this same database.
- Clear browser cookies for the site (or use a private window) and try logging in again.

# Data Portal users in PostgreSQL (DataPortalUsers)

When **PG_DATABASE** is set in `auth-server/.env`, the Data Portal stores and reads **user directory** data (registration, roles, Manage Users) in PostgreSQL instead of `auth-server/data/users.json`.

## Table: `DataPortalUsers`

- **Purpose:** Single source of truth for “who is a user” and their **role** (client vs admin). Used by:
  - Login / register (email-password and OAuth complete-profile)
  - Admin → **Manage Users** (list and “Promote to admin”)
  - Role checks for protected routes (upload, admin)
- **No conflict with:**
  - **Better Auth** (Google OAuth) – it may create its own `user` / `session` tables; we do not use those for roles.
  - **MicrosoftUsers** – Microsoft OAuth still writes there; we **also** upsert into `DataPortalUsers` so Microsoft users appear in Manage Users.
  - **MapData, ClientUploads, Showcase, ProcessingRequests** – unrelated tables.

So **DataPortalUsers** is dedicated to this purpose and does not conflict with other Data Portal or auth data.

## One email, one account (Google vs Microsoft)

The Data Portal enforces **one account per email** across sign-in methods:

- **DataPortalUsers** has a **UNIQUE(email)** constraint, so the same email cannot appear twice.
- When someone signs in with **Microsoft** using an email that already exists (e.g. they registered earlier with **Google**), the server **upserts** by email (updates the existing row) instead of creating a second account.
- After OAuth (Google or Microsoft), the register page calls **check-registered**. If that email is already in DataPortalUsers, the user sees **"An account with this email already exists"** and cannot complete a second registration with the same email via a different provider.

So a user who registered with **Gmail A** via Google **cannot** create a second account with the same Gmail A via Microsoft; they can only log in with the existing account.

## Setup

1. In **pgAdmin 4**, connect to your database (e.g. `Temadigital_Data_Portal`).
2. Run the migration:
   - Open `auth-server/sql/09-data-portal-users-table.sql`
   - Execute it in the Query Tool (or: `psql -U postgres -d Temadigital_Data_Portal -f auth-server/sql/09-data-portal-users-table.sql`).
3. Ensure `auth-server/.env` has **PG_DATABASE** (and PG_HOST, PG_USER, PG_PASSWORD, etc.) set so the auth server uses PostgreSQL.

After that:

- **New registrations** (email/password or “Complete your profile” after Google/Microsoft) are stored in **DataPortalUsers**.
- **Microsoft sign-in** upserts into **DataPortalUsers** so those users appear in Manage Users even before completing the profile form.
- **Admin → Manage Users** lists and promotes users from **DataPortalUsers**; the admin portal updates automatically as new users register.

## Column: `role`

The table has a **`role`** column (values: `client`, `admin`). This is the “roles” column used for the admin portal. There is a single role per user.

## If you already have a “user” table

- **DataPortalUsers** is a **separate** table. It does not replace or touch any existing table you named `user` (or `User`).
- If that table was meant for something else (e.g. another app), keep using it as-is; the Data Portal will only use **DataPortalUsers** for its user directory and roles.
- If you want the Data Portal to use your existing table instead, you would need to align its schema (e.g. same column names and role values) and change the auth server code to query that table name; by default we use **DataPortalUsers** to avoid name clashes with Better Auth.

## Migrating existing users from `users.json`

If you were previously using `users.json` and want to move those users into PostgreSQL:

1. Create the table with `09-data-portal-users-table.sql` (see above).
2. Insert from your existing `auth-server/data/users.json` (example; adjust paths/field names if needed):

```sql
-- Example: one row per user from users.json. Run in pgAdmin after editing the values.
INSERT INTO public."DataPortalUsers" (email, name, username, contact_number, role, provider, password_hash)
VALUES
  ('user1@example.com', 'User One', 'user1', '+60123456789', 'client', 'local', '$2a$10$...'),
  ('admin@example.com', 'Admin', 'admin', '+60987654321', 'admin', 'local', '$2a$10$...')
ON CONFLICT (email) DO NOTHING;
```

3. Restart the auth server. New registrations and Manage Users will use **DataPortalUsers** only (when PG_DATABASE is set).

## First admin when using PostgreSQL

- **Option A:** Run the migration, then insert one row with `role = 'admin'` (as in the example above), or promote an existing user from Admin → Manage Users.
- **Option B:** Register a new account with “Sign up as: Admin” and the correct admin approval code; that user will be stored in **DataPortalUsers** with `role = 'admin'`.

See **FIRST-ADMIN-SETUP.md** for promoting clients to admin from the Manage Users page.

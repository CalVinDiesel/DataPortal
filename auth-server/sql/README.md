# Temadigital_Data_Portal database and MapData table

**→ First-time PostgreSQL setup (pgAdmin, create database and tables):** see **[SETUP-POSTGRESQL-PGADMIN.md](./SETUP-POSTGRESQL-PGADMIN.md)** for step-by-step instructions.

## Option 1: SQLite (no MySQL needed)

Creates the database file and MapData table in the project:

1. Install dependencies: `npm install`
2. Create the DB and table: `npm run create-db`
3. This creates `data/Temadigital_Data_Portal.sqlite` with table **MapData** and seeds from `data/map-data.json`.
4. Start the server: `npm start` — it will use the SQLite database automatically when the file exists.

## Option 2: MySQL / MariaDB

To create the database and table in MySQL:

1. Open MySQL (command line, MySQL Workbench, or phpMyAdmin).
2. Run the script:
   ```bash
   mysql -u your_user -p < sql/Temadigital_Data_Portal.sql
   ```
   Or copy the contents of `Temadigital_Data_Portal.sql` and run it in your client.

This creates:

- **Database:** `Temadigital_Data_Portal`
- **Table:** `MapData` with columns: `mapDataID` (PK), `title`, `description`, `xAxis`, `yAxis`, `3dTiles`, `thumbNailUrl`, `updateDateTime`

The current server reads from the **SQLite** file when present; to use MySQL instead you would add a driver (e.g. `mysql2`) and change the MapData read logic in `server.js` to query MySQL.

## Option 3: PostgreSQL (existing Temadigital_Data_Portal database)

If you already have the **Temadigital_Data_Portal** database in PostgreSQL (e.g. localhost:5432), create only the **MapData** table in it:

1. Connect to database **Temadigital_Data_Portal** (pgAdmin, DBeaver, or psql).
2. Run the script:
   ```bash
   psql -U your_user -d Temadigital_Data_Portal -f sql/Temadigital_Data_Portal_PostgreSQL.sql
   ```
   Or open `Temadigital_Data_Portal_PostgreSQL.sql` in your client and execute it while connected to **Temadigital_Data_Portal**.

This creates:

- **Table:** `public."MapData"` with columns: `mapDataID` (PK), `title`, `description`, `xAxis`, `yAxis`, `3dTiles`, `thumbNailUrl`, `updateDateTime`
- Inserts the 6 seed rows (KK_OSPREY + 5 placeholders). Uses `ON CONFLICT DO UPDATE` so re-running is safe.

The server **now supports PostgreSQL**. When `PG_DATABASE` is set in `.env`, it uses PostgreSQL for MapData, client uploads, and processing requests.

---

## Linking pgAdmin / PostgreSQL to this project

### 1. Create the database in PostgreSQL (pgAdmin or psql)

1. Open **pgAdmin** and connect to your PostgreSQL server (localhost or your host).
2. Right‑click **Databases** → **Create** → **Database**.
3. Set **Database** name to: `Temadigital_Data_Portal`.
4. Click **Save**.

### 2. Run the SQL scripts (in order)

Connect to the database `Temadigital_Data_Portal`, then run:

**Step A – MapData table (3D models for the overview map):**

- In pgAdmin: right‑click `Temadigital_Data_Portal` → **Query Tool**, open or paste the contents of:
  - `auth-server/sql/Temadigital_Data_Portal_PostgreSQL.sql`
- Execute (F5 or Run).

**Step B – Admin tables (client uploads and processing requests):**

- In the same Query Tool (or a new one), open or paste:
  - `auth-server/sql/03-admin-tables-postgres.sql`
- Execute.

### 3. Configure the Node server

1. In the project root, copy the example env file:
   - `cp auth-server/.env.example auth-server/.env`
2. Edit `auth-server/.env` and set your PostgreSQL connection:

```env
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_postgres_password
PG_DATABASE=Temadigital_Data_Portal
```

3. (Optional) Set the directory for client-uploaded files:
   - `UPLOAD_DIR=uploads` (relative to project root; default is `uploads` under the DataPortal folder).

4. Install dependencies and start the server:

```bash
cd auth-server
npm install
npm start
```

When `PG_DATABASE` is set, the server will:

- Read and write **MapData** (3D models) from PostgreSQL.
- Store **client upload metadata** in `ClientUploads` when users submit via the upload page.
- Store **processing requests** in `ProcessingRequests` when admins request 3D model generation from client uploads.

### 4. Admin portal

- **URL:** `http://localhost:3000/html/vertical-menu-template/index.html`
- **Add 3D model:** create entries that appear on the overview map.
- **Client uploads:** view uploads and request 3D processing (processing jobs can be extended later).

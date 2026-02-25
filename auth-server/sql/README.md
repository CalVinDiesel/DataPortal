# Temadigital_Data_Portal database and MapData table

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

To have the Node server use PostgreSQL instead of SQLite/JSON, add the `pg` client, set connection config (e.g. env vars), and change `readMapData()` in `server.js` to query this table.

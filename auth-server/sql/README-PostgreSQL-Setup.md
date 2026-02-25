# PostgreSQL setup for Temadigital Data Portal – MapData

Use your **localhost@5432** connection (e.g. from the database sidebar) and the scripts in this folder to create the database and the **MapData** table.

---

## Step-by-step (using your sidebar / IDE)

### 1. Connect to the server

- In the left sidebar, open **Databases** and use the server **localhost@5432** (or your PostgreSQL connection).
- Connect with your usual user (e.g. `postgres`).

### 2. Create the database (if it does not exist)

- Connect to the default database (often **postgres** or **template1**).
- Open and run: **`01-create-database.sql`**

This creates the database **Temadigital_Data_Portal**.

If you see a locale error (`en_US.UTF-8` not found), edit the script and use only:

```sql
CREATE DATABASE "Temadigital_Data_Portal" WITH ENCODING 'UTF8' TEMPLATE = template0;
```

### 3. Create the MapData table and seed data

- In the sidebar, select (or connect to) the database **Temadigital_Data_Portal**.
- Open and run: **`02-create-table-mapdata.sql`**

This will:

- Create the table **MapData** with columns:  
  `mapDataID`, `title`, `description`, `xAxis`, `yAxis`, `3dTiles`, `thumbNailUrl`, `updateDateTime`
- Insert the 6 seed rows (KK_OSPREY + 5 Kota Kinabalu locations).  
  If a row with the same `mapDataID` already exists, it will be updated.

---

## Table summary

| Column          | Type               | Description                          |
|-----------------|--------------------|--------------------------------------|
| mapDataID       | VARCHAR(64) PK     | Unique id (e.g. KK_OSPREY)          |
| title           | VARCHAR(255)       | Display name                         |
| description     | TEXT               | Description text                     |
| xAxis           | DOUBLE PRECISION   | Longitude                            |
| yAxis           | DOUBLE PRECISION   | Latitude                             |
| 3dTiles         | VARCHAR(2048)      | URL to tileset.json (3D Tiles)       |
| thumbNailUrl    | VARCHAR(2048)      | Thumbnail image path/URL             |
| updateDateTime  | TIMESTAMP WITH TZ  | Last update time                     |

---

## Run from command line (optional)

If you use `psql`:

```bash
# Create database (connected to postgres)
psql -h localhost -p 5432 -U postgres -d postgres -f auth-server/sql/01-create-database.sql

# Create table and seed (connected to Temadigital_Data_Portal)
psql -h localhost -p 5432 -U postgres -d Temadigital_Data_Portal -f auth-server/sql/02-create-table-mapdata.sql
```

---

## Using MapData from the project

The auth-server currently reads MapData from **SQLite** or **map-data.json**. To use this PostgreSQL database instead, the server must be configured to connect to PostgreSQL (e.g. with `pg` and `DATABASE_URL` or similar). If you want, we can add that connection and switch the MapData API to PostgreSQL next.

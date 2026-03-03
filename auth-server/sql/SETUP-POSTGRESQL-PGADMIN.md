# Set Up PostgreSQL Database for Data Portal Admin

The Data Portal **does not create** the database or tables by itself. You must create them once in PostgreSQL (using pgAdmin or psql). After that, when you add a 3D model from the admin page, the app will **automatically save and read** from this database.

---

## What you need

- **PostgreSQL** installed and running (pgAdmin usually installs with PostgreSQL, or you install PostgreSQL first then pgAdmin).
- If the left sidebar in pgAdmin is empty, you need to **add a server** and **create the database** as below.

---

## Step 1: Add PostgreSQL server in pgAdmin (if nothing appears on the left)

1. Open **pgAdmin**.
2. In the left **Browser** panel, right‑click **Servers**.
3. Choose **Register** → **Server**.
4. **General** tab: set **Name** to e.g. `Local PostgreSQL`.
5. **Connection** tab:
   - **Host:** `localhost`
   - **Port:** `5432`
   - **Username:** `postgres` (or the user you created)
   - **Password:** your PostgreSQL password
6. Click **Save**. If it connects, you will see the server in the left tree (e.g. **Servers → Local PostgreSQL**).

If connection fails, make sure the **PostgreSQL service** is running (e.g. Windows: Services → postgresql-x64-xx).

---

## Step 2: Create the database

1. In the left tree, expand your server (e.g. **Local PostgreSQL**).
2. Right‑click **Databases** → **Create** → **Database**.
3. **Database:** `Temadigital_Data_Portal` (exactly this name).
4. **Owner:** leave as default (e.g. `postgres`).
5. Click **Save**.

You should now see **Databases → Temadigital_Data_Portal** in the left panel.

---

## Step 3: Create the tables (run the SQL scripts)

You need to run **two** scripts **in order**, both while connected to the database `Temadigital_Data_Portal`.

### 3a. Create MapData table (for 3D models)

1. In the left tree, click on **Temadigital_Data_Portal** (the database).
2. Top menu: **Tools** → **Query Tool** (or right‑click the database → **Query Tool**).
3. In the Query Tool:
   - Either **File → Open** and open:  
     `DataPortal/auth-server/sql/Temadigital_Data_Portal_PostgreSQL.sql`
   - Or copy the **entire contents** of that file and paste into the query editor.
4. Click **Execute** (▶) or press **F5**.
5. You should see a success message. In the left tree, expand **Temadigital_Data_Portal** → **Schemas** → **public** → **Tables**. You should see **MapData**.

### 3b. Create admin tables (ClientUploads, ProcessingRequests)

1. In the same Query Tool (or open a new one for `Temadigital_Data_Portal`):
   - **File → Open** and open:  
     `DataPortal/auth-server/sql/03-admin-tables-postgres.sql`
   - Or copy the **entire contents** of that file and paste into the query editor.
2. Click **Execute** (▶) or press **F5**.
3. In **Schemas** → **public** → **Tables** you should now see **ClientUploads** and **ProcessingRequests** as well.

---

## Step 4: Configure the Data Portal to use PostgreSQL

1. In the project folder, go to **auth-server**.
2. If there is no `.env` file, copy the example:
   - Copy `auth-server/.env.example` to `auth-server/.env`.
3. Open **auth-server/.env** in an editor and set the PostgreSQL section:

```env
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_actual_postgres_password
PG_DATABASE=Temadigital_Data_Portal
```

Replace `your_actual_postgres_password` with the same password you use in pgAdmin.

4. Save the file.

---

## Step 5: Start the server and test

1. From the project root (or from **auth-server**):
   ```bash
   cd auth-server
   npm start
   ```
2. In the console you should see something like:
   - `MapData & admin: using PostgreSQL database Temadigital_Data_Portal`
3. Open the admin page:  
   **http://localhost:3000/html/vertical-menu-template/add-3d-model.html**
4. Add a test 3D model (ID, title, coordinates, tileset URL) and click **Save 3D Model**.
5. In pgAdmin: right‑click the **MapData** table → **View/Edit Data** → **All Rows**. You should see your new row.

From now on, any new 3D model you add from the admin side is **automatically stored** in the PostgreSQL database and linked to pgAdmin (you can always open the same database in pgAdmin to view or edit data).

---

## Quick checklist

| Step | What to do |
|------|------------|
| 1 | Add server in pgAdmin (Host: localhost, Port: 5432, User: postgres, Password: yours) |
| 2 | Create database `Temadigital_Data_Portal` |
| 3a | Run `Temadigital_Data_Portal_PostgreSQL.sql` in Query Tool |
| 3b | Run `03-admin-tables-postgres.sql` in Query Tool |
| 4 | Set `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE` in `auth-server/.env` |
| 5 | Run `npm start` in auth-server and add a 3D model from admin; check MapData in pgAdmin |

---

## If you still don’t see a database in pgAdmin

- **Left bar completely empty:** Add a server (Step 1). PostgreSQL must be installed and the service running.
- **Server visible but no databases:** Create the database (Step 2).
- **Database visible but no tables:** Run both SQL scripts (Step 3a and 3b) while connected to `Temadigital_Data_Portal`.

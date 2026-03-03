# Step-by-step: Set up the database for the Data Portal

Do these steps **in order** in pgAdmin. Use the database **Temadigital_Data_Portal** (create it first if you don’t see it).

**Important:** The Data Portal uses a table named **PortalMapData**, not **MapData**. The table **MapData** belongs to the **MobilityDB** extension — **do not drop it**. We use **PortalMapData** so there is no conflict.

---

## Step 1: Open the Query Tool

1. Open **pgAdmin**.
2. In the **left tree**, expand your server (e.g. **Servers → Local PostgreSQL**).
3. Expand **Databases**.
4. **Click** the database **Temadigital_Data_Portal** (do not expand it).
5. Top menu: **Tools** → **Query Tool** (or right‑click the database → **Query Tool**).  
   A query window opens.

---

## Step 2: (Optional) Drop the Data Portal table only

Only do this if you already created **PortalMapData** before and want to recreate it from scratch.  
**Do not drop "MapData"** — that is used by MobilityDB and will cause an error.

If you want to drop only **PortalMapData**, run:

```sql
DROP TABLE IF EXISTS public."PortalMapData" CASCADE;
```

If this is your first time, skip this step and go to Step 3.

---

## Step 3: Create the PortalMapData table and add seed data

1. In the same Query Tool, **clear** the editor (select all, delete).
2. Open the file **Temadigital_Data_Portal_PostgreSQL.sql** from your project:
   - Path: `DataPortal/auth-server/sql/Temadigital_Data_Portal_PostgreSQL.sql`
   - In pgAdmin: **File** → **Open** and browse to that file, **or** open the file in Notepad, copy **all** of its contents.
3. **Paste** the full script into the Query editor (so it runs both the `CREATE TABLE` and the `INSERT`).
4. Click **Execute** (▶) or press **F5**.
5. In **Messages** you should see **CREATE TABLE** and **INSERT** (no error).
6. In the left tree: **Schemas** → **public** → **Tables** → right‑click **Tables** → **Refresh**.  
   You should see **PortalMapData** (and you may still see **MapData** from MobilityDB — leave that one alone).  
   Right‑click **PortalMapData** → **View/Edit Data** → **All Rows** to see the one seed row (e.g. KK_OSPREY).

---

## Step 4: Create the admin tables (ClientUploads, ProcessingRequests)

1. In the Query Tool, **clear** the editor again.
2. Open **03-admin-tables-postgres.sql** from your project:
   - Path: `DataPortal/auth-server/sql/03-admin-tables-postgres.sql`
   - **File** → **Open** in pgAdmin, or open in Notepad and copy all.
3. **Paste** the full script into the Query editor.
4. Click **Execute** (▶) or press **F5**.
5. In **Messages** you should see **CREATE TABLE** (no error).
6. Refresh **Tables** under **public**. You should see **ClientUploads** and **ProcessingRequests**.

---

## Step 5: Set the Data Portal to use this database

1. In your project folder, go to **auth-server**.
2. If there is no file named **.env**, copy **.env.example** and rename the copy to **.env**.
3. Open **.env** in a text editor.
4. Find the PostgreSQL section and set your real password:

```env
PG_HOST=localhost
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=your_actual_password
PG_DATABASE=Temadigital_Data_Portal
```

5. Save and close **.env**.

---

## Step 6: Start the server and test

1. Open a terminal (e.g. PowerShell or Command Prompt).
2. Go to the project folder, then into **auth-server**:
   ```bash
   cd path\to\DataPortal\auth-server
   npm start
   ```
3. In the console you should see something like:  
   **MapData & admin: using PostgreSQL database Temadigital_Data_Portal**
4. In the browser open:  
   **http://localhost:3000/html/vertical-menu-template/add-3d-model.html**
5. Fill the form (Model ID, Title, Latitude, Longitude, 3D Tiles URL) and click **Save 3D Model**.
6. In pgAdmin: **PortalMapData** → **View/Edit Data** → **All Rows**. You should see your new row.

---

## Quick checklist

| # | What you do |
|---|-----------------------------|
| 1 | Open Query Tool on database **Temadigital_Data_Portal** |
| 2 | (Optional) Run: `DROP TABLE IF EXISTS public."PortalMapData" CASCADE;` — do **not** drop MapData (MobilityDB). |
| 3 | Run the full **Temadigital_Data_Portal_PostgreSQL.sql** script (creates **PortalMapData**) |
| 4 | Run the full **03-admin-tables-postgres.sql** script |
| 5 | Set **PG_HOST**, **PG_PORT**, **PG_USER**, **PG_PASSWORD**, **PG_DATABASE** in **auth-server/.env** |
| 6 | **npm start** in auth-server, add a 3D model from admin, check **PortalMapData** in pgAdmin |

After this, new 3D models you add from the admin page will show in the **PortalMapData** table in pgAdmin. The **MapData** table (used by MobilityDB) is left unchanged.

# TemaDataPortal 3D Viewer

This repository contains the backend Node.js (`auth-server`) portal combined natively with the `3DHub Viewer` React 3D Viewer. 

## 🚀 Getting Started (GitHub Clone Setup)

If you have just cloned this repository, follow these steps to get the portal running on your local machine.

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **PostgreSQL** (Installed and running)
- **Git**

### 2. Installation
To install all dependencies for the root, backend, and viewer app at once, run:

```bash
npm run setup
```

### 3. Environment Configuration
Navigate to the `auth-server` directory and set up your environment variables:

1. Copy `.env.example` to a new file named `.env`.
2. Open `.env` and fill in your details:
   - **PostgreSQL Settings:** `PG_HOST`, `PG_USER`, `PG_PASSWORD`, etc.
   - **Admin Code:** Set `ADMIN_REGISTRATION_CODE` to a secret value. **This is required** to create an Admin account during registration.
   - **Google/SFTP Settings:** (Optional, as needed).

### 4. Admin Setup & Registration
1. Start the server (see below).
2. Go to **http://localhost:3000/html/front-pages/login.html**.
3. Click "Sign up".
4. Choose **"Sign up as: Admin"** and enter the `ADMIN_REGISTRATION_CODE` you set in `.env`.

### 5. Database Setup
1. Create a new database in PostgreSQL named `Temadigital_Data_Portal`.
2. Run the SQL initialization scripts located in `auth-server/sql/` in order:
   - `Temadigital_Data_Portal_PostgreSQL.sql` (Core tables)
   - `03-admin-tables-postgres.sql` (Admin & Upload tables)

### 6. Running the Application
From the project root, run:

```bash
npm start
```
The portal is a unified application available at **http://localhost:3000**. This serves both the backend API and the frontend HTML pages.

---

## 🛠️ Development & Building

### 🏗️ Rebuilding the 3D Viewer
The 3D Viewer is a React application located in `react-viewer-app/`. 
- **Pre-built**: A compiled version is already available in `html/cesium-viewer`.
- **Changes**: If you modify any code in `react-viewer-app/src`, you **MUST** rebuild it to see changes in the portal:
```bash
npm run build-viewer
```
This command compiles the React app and automatically deploys it to the `html/cesium-viewer` directory.

---

## 📁 Repository Structure
- `html/` - Vanilla HTML/CSS landing pages and the compiled 3D viewer.
- `auth-server/` - Express.js backend logic, SFTP relay, and Database queries.
- `react-viewer-app/` - React/Typescript source code for the Cesium 3D Viewer.
- `sql/` - Database migration and setup scripts.
- `uploads/` - Local storage for temporary file assemblies.

---

## ⚡ Unified Shortcuts
From the project root, you can use these shortcuts:

- **`npm start`**: Run the integrated portal (Express + Static pages).
- **`npm run build-viewer`**: Recompile the React viewer and sync it to the `html/` directory.
- **`npm run seed-mapdata`**: Seed the PostgreSQL MapData table from static JSON files.

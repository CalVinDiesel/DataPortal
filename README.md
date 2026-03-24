# TemaDataPortal 3D Viewer

This repository contains the backend Node.js (`auth-server`) portal combined natively with the `cesium-discovery-app` React 3D Viewer. 

## 🚀 Getting Started (GitHub Clone Setup)

If you have just cloned this repository, follow these steps to get the portal running on your local machine.

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **PostgreSQL** (Installed and running)
- **Git**

### 2. Installation
The project has three main parts that need dependencies installed. From the project root, run:

```bash
# Install root dependencies
npm install

# Install backend dependencies
cd auth-server
npm install

# Install frontend (viewer) dependencies
cd ../react-viewer-app
npm install
```

### 3. Environment Configuration
Navigate to the `auth-server` directory and set up your environment variables:

1. Copy `.env.example` to a new file named `.env`.
2. Open `.env` and fill in your details:
   - **PostgreSQL Settings:** `PG_HOST`, `PG_USER`, `PG_PASSWORD`, etc.
   - **SFTP Settings:** (If you have a remote supervisor server).
   - **Google OAuth:** (If you want to enable Google Login).

### 4. Database Setup
1. Create a new database in PostgreSQL named `Temadigital_Data_Portal`.
2. Run the SQL initialization scripts located in `auth-server/sql/` in the following order:
   - `Temadigital_Data_Portal_PostgreSQL.sql` (Core tables)
   - `03-admin-tables-postgres.sql` (Admin & Upload tables)
   - `18-token-payments-tables.sql` (Optional: for token system)
   - *Any other numbered scripts in sequence.*

### 5. Running the Application
Return to the project root and start the portal:

```bash
npm start
```
The portal will be available at **http://localhost:3000**.

---

## 🛠️ Unified Development Commands

From the project root, you can use these shortcuts:

### Run the Main Portal
```bash
npm start
```

### Build the 3D Viewer
If you make changes to the React source code (`react-viewer-app/src`), you must rebuild it:
```bash
npm run build-viewer
```
This compiles the React app and moves it automatically into the `html/cesium-viewer` directory.

### Run the Dashboard API
(Used for saving measurements and annotations):
```bash
cd react-viewer-app/server
npm start
```

## 📁 Repository Structure
- `html/` - Vanilla HTML/CSS landing pages and the compiled 3D viewer.
- `auth-server/` - Express.js backend logic, SFTP relay, and Database queries.
- `react-viewer-app/` - React/Typescript source code for the Cesium 3D Viewer.
- `sql/` - Database migration and setup scripts.
- `uploads/` - Local storage for temporary file assemblies.

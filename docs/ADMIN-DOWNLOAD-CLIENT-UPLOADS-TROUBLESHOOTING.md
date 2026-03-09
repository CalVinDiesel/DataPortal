# Troubleshooting: "No files found" when downloading client uploads

## How client uploads reach the admin

**Yes – client uploads and admin download use the same storage.** When a client uses the **Upload Data** page:

1. The browser sends chunks to the **auth server** (`/api/upload/init`, `/api/upload/chunk`, `/api/upload/finalize`).
2. The server writes files to **`UPLOAD_DIR`** (e.g. `DataPortal/uploads/project_<timestamp>_<id>/`) on the same machine where the auth server runs.
3. The server saves the relative paths in **`ClientUploads.file_paths`** in PostgreSQL.
4. Admin **Client Uploads** lists those rows and **Download images** reads files from the same `UPLOAD_DIR` using those paths.

So client uploads are always stored where the admin can download them, **as long as**:
- The client’s Upload Data page uses the **same API base** as the auth server (same origin or `TemaDataPortal_API_BASE`).
- The auth server is the **same process** (or same `UPLOAD_DIR` and DB) for both upload and download.

If the uploads folder is empty for an existing request, the upload either completed on a different server/run or the files were removed.

---

When you click **Download images** or **Download all images (ZIP)** on the Admin → Client Uploads page and get **"No files found for this upload"**, the server found the upload in the database but could not find any of the files on disk. Follow these steps to fix it.

## Step 1: Check the server console

1. Restart the auth server (`npm start` in the `auth-server` folder).
2. Click **Download images** again for the same upload.
3. In the **terminal where the server is running**, look for a line like:
   ```text
   [download] Upload #X: no files found. DB file_paths=..., drone_pos_file_path=... UPLOAD_DIR=... PROJECT_ROOT=... Parsed paths: ...
   ```

This shows:
- **DB file_paths** – What paths are stored in the database for this upload.
- **drone_pos_file_path** – The POS file path, if any.
- **UPLOAD_DIR** – The folder the server uses for uploads (absolute path).
- **PROJECT_ROOT** – The project root (parent of `auth-server`).
- **Parsed paths** – The list of paths we try to find on disk.

If you see per-path warnings like `path "..." -> ...: ENOENT`, that path was tried and the file was missing (ENOENT = file not found).

## Step 2: Verify paths in the database

1. Open **pgAdmin** and connect to your database.
2. Run:
   ```sql
   SELECT id, project_id, file_paths, drone_pos_file_path
   FROM public."ClientUploads"
   WHERE id = YOUR_UPLOAD_ID;
   ```
   Replace `YOUR_UPLOAD_ID` with the ID from the error (e.g. the number in "Upload #3").
3. Check:
   - **file_paths** should be a non-empty array of paths like `uploads/project_1234567890_abc123/image1.jpg`.
   - **drone_pos_file_path** (if used) might look like `uploads/project_1234567890_abc123/positions.txt`.

If **file_paths** is `null` or `[]`, the upload was saved without any image paths (e.g. finalize failed or a different flow was used). New uploads from the Upload Data page should have paths; if not, the upload/finalize flow may need to be checked.

## Step 3: Verify files on disk

1. Note the **UPLOAD_DIR** path from the server log (e.g. `C:\...\DataPortal\uploads`).
2. In File Explorer, open that folder.
3. You should see subfolders named like `project_1734567890123_abc123`.
4. Open the subfolder that matches the paths in **file_paths** (e.g. `project_1734567890123_abc123`).
5. Confirm the image files (and POS file if any) are there.

If the folder or files are missing:
- Files may have been deleted or stored elsewhere.
- **UPLOAD_DIR** might be wrong: check `auth-server/.env` for `UPLOAD_DIR`. If set, it must point to the same folder where the app writes uploads (relative to project root or absolute). If not set, the app uses `uploads` under the project root.

## Step 4: Match database paths to disk

Paths in **file_paths** are stored as **relative** paths, for example:
- `uploads/project_1734567890123_abc123/image1.jpg`
- `uploads/project_1734567890123_abc123/positions.csv`

The server resolves them as:
- `PROJECT_ROOT` + path → e.g. `C:\...\DataPortal\uploads\project_...\image1.jpg`
- or under `UPLOAD_DIR` with the same subpath.

So:
- **PROJECT_ROOT** should be the folder that contains the `uploads` folder (e.g. `DataPortal`).
- **UPLOAD_DIR** is normally `PROJECT_ROOT\uploads` (or whatever you set in `.env`).
- The physical files must exist under that folder with the same relative path as in the DB.

## Quick checklist

- [ ] Server restarted so new code and logs are active.
- [ ] Console shows the `[download]` line with DB paths and UPLOAD_DIR/PROJECT_ROOT.
- [ ] In pgAdmin, this upload has non-empty **file_paths** (and **drone_pos_file_path** if you use POS).
- [ ] The **UPLOAD_DIR** folder exists and contains the project subfolder and files.
- [ ] Paths in the DB match the folder/file names on disk (e.g. `uploads/project_XXX/filename.jpg`).

If everything matches and you still get "No files found", share the exact `[download]` log line (with paths) so we can check for path format or permission issues.

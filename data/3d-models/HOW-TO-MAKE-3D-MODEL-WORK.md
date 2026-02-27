# How to make the 3D model work (without 3dhub)

Follow these steps so that when a user clicks **"View full 3D model"** on the landing page, the 3D model loads from your own project.

---

## 1. You need the tile files (not only tileset.json)

- **tileset.json** = index that lists which tile files to load.
- **Tile files** = the actual 3D geometry (e.g. `top/Level_14/*.b3dm`, `top/Level_15/*.b3dm`, `top/Level_16/*.json`, etc.).

Without the tile files, the viewer will load the index but then get 404 for every tile and the model will not appear.

**Where to get the full package (tileset.json + tile files):**

- **Option A:** Re-export from your 3D tool (e.g. GridMaster / DASpatial) and choose “3D Tiles” or “Cesium 3D Tiles”. The export will produce a folder containing `tileset.json` and a `top/` folder (or similar) with all `.b3dm` and tile `.json` files.
- **Option B:** Get the same folder that 3dhub.temadigital.my uses from your IT or server team. The server that hosts 3dhub has a copy of `tileset.json` and the `top/` directory with all tiles; copy that entire folder.

---

## 2. Put everything inside your project folder (e.g. `data/3d-models/KK_OSPREY/`)

Your folder must look like this (paths in tileset.json are relative to this folder). Replace `your-project-id` with your location id (e.g. KK_OSPREY):

```
data/3d-models/your-project-id/
├── tileset.json          ← you already have this
└── top/
    ├── Level_13/
    │   └── (e.g. Tile_p0000_p0000_L13_00.b3dm)
    ├── Level_14/
    │   └── (e.g. Tile_p0000_p0000_L14_000.b3dm, ...)
    ├── Level_15/
    ├── Level_16/
    └── ... (all other Level_* and tile files from your export)
```

**Steps:**

1. Get the full export folder (tileset.json + top/ and all contents).
2. Copy **tileset.json** into `data/3d-models/your-project-id/` (overwrite if needed).
3. Copy the **entire `top/` folder** (and everything inside it) into `data/3d-models/your-project-id/`.
4. Do not put tileset.json inside `top/` — it must sit next to the `top/` folder as above.

---

## 3. Run the project over HTTP (not file://)

Browsers often block loading local files when the page is opened as `file:///...`. Use a local web server.

**Option A – Node (if you have Node.js):**

```bash
# From the project root (folder that contains html/, data/, assets/)
npx serve -l 3000
```

Then open: **http://localhost:3000/html/front-pages/landing-page.html**

**Option B – Python:**

```bash
# From the project root
python -m http.server 8080
```

Then open: **http://localhost:8080/html/front-pages/landing-page.html**

**Option C – VS Code:** Install the “Live Server” extension, right‑click `landing-page.html` → “Open with Live Server”.

---

## 4. Test the flow

1. Open the landing page in the browser (via the URL from step 3).
2. On the map, click the pin for your project (or the area that shows the “View full 3D model” link).
3. Click **“View full 3D model →”**.
4. You should be taken to the 3D viewer, camera flies to the location, and the 3D tiles load from your project folder.

If the model still does not appear:

- Open the browser **Developer Tools** (F12) → **Console**. Look for 404 errors on URLs like `.../top/Level_14/...` or `.../top/Level_15/...`. That means a tile file is missing or in the wrong place.
- Open **Network** tab and reload; ensure `tileset.json` loads (200), then that tile requests also return 200. Any 404 = missing file or wrong path.

---

## Summary

| Step | Action |
|------|--------|
| 1 | Get the full 3D Tiles package (tileset.json + top/ with all .b3dm and tile .json files) from your export tool or from the 3dhub server files. |
| 2 | Put tileset.json and the whole top/ folder inside your project folder (e.g. `data/3d-models/KK_OSPREY/`). |
| 3 | Run the project with a local HTTP server (npx serve, Python, or Live Server). |
| 4 | Open landing page → click your project pin → “View full 3D model” and confirm the model loads. |

No 3dhub approval or external server is needed once the tile files are in this folder; the viewer loads everything from your project.

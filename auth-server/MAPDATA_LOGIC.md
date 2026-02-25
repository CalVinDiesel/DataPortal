# MapData Table & Overview Map Link – Logic

## Purpose
Store 3D model metadata (especially 3D Tiles tileset URLs) in **Temadigital_Data_Portal** / **MapData**, and link the overview map / showcase to the 3D viewer by **ID**.

## Storage
- **Current**: `auth-server/data/map-data.json` (array of MapData rows). No database setup required.
- **Production**: You can move to a real DB (e.g. MySQL) with the same schema; API routes stay the same.

## Table: MapData (logical schema)

| Column         | Type      | Description |
|----------------|-----------|-------------|
| mapDataID      | TEXT (PK) | Unique id, e.g. `KK_OSPREY` – used in URLs: `3D-viewer.html?id=KK_OSPREY` |
| title          | TEXT      | Display name |
| description   | TEXT      | Optional description |
| xAxis         | REAL      | Longitude (for 2D map position and camera) |
| yAxis         | REAL      | Latitude (for 2D map position and camera) |
| 3dTiles       | TEXT      | Full URL to tileset.json, e.g. `https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json` |
| thumbNailUrl   | TEXT      | Thumbnail image URL (optional) |
| updateDateTime | TEXT     | ISO timestamp, e.g. `2025-02-20T12:00:00.000Z` |

Note: Column name is `3dTiles` (not tilesetUrl) as requested. In SQL it is quoted where needed.

## Flow

1. **Backend (auth-server)**
   - MapData stored in `data/map-data.json`. Run `npm run init-mapdata` to create/seed (KK_OSPREY).
   - **GET /api/map-data** → returns all MapData rows (for overview map / showcase).
   - **GET /api/map-data/:id** → returns one row by `mapDataID` (for 3D viewer when opened with `?id=...`).

2. **Overview map / Landing page**
   - The “location map” is the 2D Cesium map and the “3D Model Showcase” section.
   - Showcase tiles can be built from **GET /api/map-data**: each row becomes a tile linking to `loading-3d.html?id=<mapDataID>`.
   - Optionally, the 2D map can show markers at (xAxis, yAxis) that open the 3D viewer with the same id.

3. **3D Viewer (3D-viewer.html)**
   - User opens `3D-viewer.html?id=KK_OSPREY` (or via `loading-3d.html?id=KK_OSPREY`).
   - Page calls **GET /api/map-data/KK_OSPREY**.
   - If found: use `3dTiles` as the tileset URL for `Cesium.Cesium3DTileset.fromUrl(...)`, and use (xAxis, yAxis) as (longitude, latitude) for camera flyTo.
   - If API fails or 404: fall back to existing `locations.json` and match by `id` (so existing ids like `kk-city-centre` still work).

## KK_OSPREY seed row
- **mapDataID**: `KK_OSPREY`
- **title**: `KK OSPREY`
- **description**: e.g. 3D model from GeoSabah 3D Hub (Kota Kinabalu area).
- **xAxis**: 116.07 (longitude)
- **yAxis**: 5.98 (latitude)
- **3dTiles**: `https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json`
- **thumbNailUrl**: optional (placeholder or empty)
- **updateDateTime**: current timestamp

This way the created table is linked to the overview map and 3D viewer using **mapDataID** as the single id used in URLs and API calls.

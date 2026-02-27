# KK OSPREY 3D model – place your tileset here

The 3D viewer loads the **KK OSPREY** model from this folder. For it to run you need the full 3D Tiles package here.

## What to put in this folder

1. **tileset.json** – the index file that lists all tiles.
2. **top/** (or whatever your export uses) – the folder containing all tile files (e.g. `Level_13/`, `Level_14/`, `.b3dm`, tile `.json` files).

See **data/3d-models/HOW-TO-MAKE-3D-MODEL-WORK.md** for the full steps.

## Target layout

```
data/3d-models/KK_OSPREY/
├── README.md          (this file)
├── tileset.json       ← put your tileset.json here
└── top/               ← put the full tile tree here (Level_* folders, .b3dm, etc.)
```

## Where to get the data

- Export from your 3D tool (e.g. GridMaster / DASpatial) as **3D Tiles** / **Cesium 3D Tiles**, or  
- Copy the same folder that 3dhub or your server uses (tileset.json + the whole `top/` directory).

## Run over HTTP

Open the site via a local server (e.g. `npx serve`, Live Server, or Python `http.server`), not as `file://`, so the tiles load correctly.

After you add **tileset.json** and **top/** here, open the landing page → click the KK OSPREY pin or tile → “View full 3D model” and the model should load.

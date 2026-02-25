-- Step 2: Create MapData table and seed (run this while connected to database Temadigital_Data_Portal)
-- In your database sidebar: select database "Temadigital_Data_Portal", then run this script.

-- Table: public.MapData (matches app: mapDataID, title, description, xAxis, yAxis, 3dTiles, thumbNailUrl, updateDateTime)
CREATE TABLE IF NOT EXISTS public."MapData" (
  "mapDataID"      VARCHAR(64)         NOT NULL PRIMARY KEY,
  title            VARCHAR(255)        NOT NULL,
  description      TEXT,
  "xAxis"          DOUBLE PRECISION,
  "yAxis"          DOUBLE PRECISION,
  "3dTiles"        VARCHAR(2048)       NOT NULL,
  "thumbNailUrl"   VARCHAR(2048),
  "updateDateTime" TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE public."MapData" IS '3D model locations for the data portal map';
COMMENT ON COLUMN public."MapData"."mapDataID" IS 'Unique id, e.g. KK_OSPREY, kk-city-centre';
COMMENT ON COLUMN public."MapData"."xAxis" IS 'Longitude for map position';
COMMENT ON COLUMN public."MapData"."yAxis" IS 'Latitude for map position';
COMMENT ON COLUMN public."MapData"."3dTiles" IS 'URL to tileset.json (3D Tiles)';

-- Seed rows (same as map-data.json; replace 3dTiles with real URL when you have data)
INSERT INTO public."MapData" ("mapDataID", title, description, "xAxis", "yAxis", "3dTiles", "thumbNailUrl", "updateDateTime") VALUES
('KK_OSPREY', 'KK OSPREY', '3D model from GeoSabah 3D Hub (Kota Kinabalu area).', 116.070466, 5.957839, 'https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json', '', NOW()),
('kk-city-centre', 'Kota Kinabalu City Centre', 'High-resolution drone photogrammetry 3D model of Kota Kinabalu city centre including commercial buildings and urban infrastructure.', 116.0735, 5.9804, 'REPLACE_WITH_REAL_TILESET_URL', '../../assets/img/front-pages/locations/kkCityCentre.jpg', NOW()),
('kk-waterfront', 'Kota Kinabalu Waterfront', 'Coastal drone capture of Kota Kinabalu waterfront including marina, shoreline, and coastal infrastructure.', 116.0712, 5.9785, 'REPLACE_WITH_REAL_TILESET_URL', '../../assets/img/front-pages/locations/kkWaterFront.jpg', NOW()),
('kk-likas-bay', 'Likas Bay Area', 'Drone mapping of Likas Bay including beach zones, coastal vegetation, and shoreline protection structures.', 116.0952, 6.0106, 'REPLACE_WITH_REAL_TILESET_URL', '../../assets/img/front-pages/locations/likasBayArea.jpg', NOW()),
('kk-tanjung-aru', 'Tanjung Aru Zone', 'Urban-coastal drone capture of Tanjung Aru including residential zones, resorts, and transportation corridors.', 116.070466, 5.957839, 'REPLACE_WITH_REAL_TILESET_URL', '../../assets/img/front-pages/locations/tanjungAruBeach.jpg', NOW()),
('kk-teleuk-layang', 'Teluk Likas Coastal Strip', 'Drone survey of Teluk Likas coastline including beach morphology and coastal erosion mapping.', 116.0891, 6.0068, 'REPLACE_WITH_REAL_TILESET_URL', '../../assets/img/front-pages/locations/telukLikasCoastalStrip.jpg', NOW())
ON CONFLICT ("mapDataID") DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  "xAxis" = EXCLUDED."xAxis",
  "yAxis" = EXCLUDED."yAxis",
  "3dTiles" = EXCLUDED."3dTiles",
  "thumbNailUrl" = EXCLUDED."thumbNailUrl",
  "updateDateTime" = EXCLUDED."updateDateTime";

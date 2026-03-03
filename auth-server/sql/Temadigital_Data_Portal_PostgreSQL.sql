-- Data Portal 3D models table (PostgreSQL)
-- Uses table name "PortalMapData" to avoid conflict with MobilityDB's "MapData" table.
-- Run this script while connected to database Temadigital_Data_Portal (e.g. in pgAdmin).
-- Example: psql -U postgres -d Temadigital_Data_Portal -f sql/Temadigital_Data_Portal_PostgreSQL.sql

-- Table: public.PortalMapData (Data Portal 3D model entries for the overview map)
CREATE TABLE IF NOT EXISTS public."PortalMapData" (
  "mapDataID"     VARCHAR(64)   NOT NULL PRIMARY KEY,
  title           VARCHAR(255)  NOT NULL,
  description     TEXT,
  "xAxis"         DOUBLE PRECISION,
  "yAxis"         DOUBLE PRECISION,
  "3dTiles"       VARCHAR(2048) NOT NULL,
  "thumbNailUrl"  VARCHAR(2048),
  "updateDateTime" TIMESTAMP
);

COMMENT ON TABLE public."PortalMapData" IS 'Data Portal 3D model locations for the overview map (separate from MobilityDB MapData)';
COMMENT ON COLUMN public."PortalMapData"."mapDataID" IS 'Unique id, e.g. KK_OSPREY';
COMMENT ON COLUMN public."PortalMapData"."xAxis" IS 'Longitude for map position';
COMMENT ON COLUMN public."PortalMapData"."yAxis" IS 'Latitude for map position';
COMMENT ON COLUMN public."PortalMapData"."3dTiles" IS 'URL to tileset.json (3D Tiles)';

-- Seed row
INSERT INTO public."PortalMapData" ("mapDataID", title, description, "xAxis", "yAxis", "3dTiles", "thumbNailUrl", "updateDateTime") VALUES
('KK_OSPREY', 'KK OSPREY', '3D model from GeoSabah 3D Hub (Kota Kinabalu area).', 116.070466, 5.957839, 'https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json', '', NOW())
ON CONFLICT ("mapDataID") DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  "xAxis" = EXCLUDED."xAxis",
  "yAxis" = EXCLUDED."yAxis",
  "3dTiles" = EXCLUDED."3dTiles",
  "thumbNailUrl" = EXCLUDED."thumbNailUrl",
  "updateDateTime" = EXCLUDED."updateDateTime";

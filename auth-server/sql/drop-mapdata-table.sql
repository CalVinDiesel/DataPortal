-- Drop only the Data Portal table "PortalMapData" (used by this app).
-- Do NOT drop "MapData" — that table belongs to the MobilityDB extension.
-- Run this in pgAdmin while connected to database: Temadigital_Data_Portal
-- Then run Temadigital_Data_Portal_PostgreSQL.sql to recreate PortalMapData.

DROP TABLE IF EXISTS public."PortalMapData" CASCADE;

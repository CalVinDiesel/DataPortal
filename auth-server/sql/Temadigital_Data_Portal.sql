-- Database: Temadigital_Data_Portal
-- Table: MapData
-- Run this script in MySQL or MariaDB to create the database and table.
-- Example: mysql -u root -p < sql/Temadigital_Data_Portal.sql

CREATE DATABASE IF NOT EXISTS Temadigital_Data_Portal
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE Temadigital_Data_Portal;

CREATE TABLE IF NOT EXISTS MapData (
  mapDataID    VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT 'Unique id, e.g. KK_OSPREY, kk-city-centre',
  title        VARCHAR(255)  NOT NULL,
  description  TEXT,
  xAxis        DOUBLE        NULL COMMENT 'Longitude for map position',
  yAxis        DOUBLE        NULL COMMENT 'Latitude for map position',
  `3dTiles`    VARCHAR(2048) NOT NULL COMMENT 'URL to tileset.json (3D Tiles)',
  thumbNailUrl VARCHAR(2048) NULL,
  updateDateTime DATETIME    NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed rows (real + dummy placeholders; replace 3dTiles with real URL when you have data)
INSERT INTO MapData (mapDataID, title, description, xAxis, yAxis, `3dTiles`, thumbNailUrl, updateDateTime) VALUES
('KK_OSPREY', 'KK OSPREY', '3D model from GeoSabah 3D Hub (Kota Kinabalu area).', 116.070466, 5.957839, 'https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json', '', NOW()),
('kk-city-centre', 'Kota Kinabalu City Centre', 'High-resolution drone photogrammetry 3D model of Kota Kinabalu city centre including commercial buildings and urban infrastructure.', 116.0735, 5.9804, 'REPLACE_WITH_REAL_TILESET_URL', '', NOW()),
('kk-waterfront', 'Kota Kinabalu Waterfront', 'Coastal drone capture of Kota Kinabalu waterfront including marina, shoreline, and coastal infrastructure.', 116.0712, 5.9785, 'REPLACE_WITH_REAL_TILESET_URL', '', NOW()),
('kk-likas-bay', 'Likas Bay Area', 'Drone mapping of Likas Bay including beach zones, coastal vegetation, and shoreline protection structures.', 116.0952, 6.0106, 'REPLACE_WITH_REAL_TILESET_URL', '', NOW()),
('kk-tanjung-aru', 'Tanjung Aru Zone', 'Urban-coastal drone capture of Tanjung Aru including residential zones, resorts, and transportation corridors.', 116.070466, 5.957839, 'REPLACE_WITH_REAL_TILESET_URL', '', NOW()),
('kk-teleuk-layang', 'Teluk Likas Coastal Strip', 'Drone survey of Teluk Likas coastline including beach morphology and coastal erosion mapping.', 116.0891, 6.0068, 'REPLACE_WITH_REAL_TILESET_URL', '', NOW())
ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), xAxis = VALUES(xAxis), yAxis = VALUES(yAxis), `3dTiles` = VALUES(`3dTiles`), thumbNailUrl = VALUES(thumbNailUrl), updateDateTime = VALUES(updateDateTime);

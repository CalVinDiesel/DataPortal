-- Database: Temadigital_Data_Portal
-- Table: MapData
-- Run this script in MySQL or MariaDB to create the database and table.
-- Example: mysql -u root -p < sql/Temadigital_Data_Portal.sql

CREATE DATABASE IF NOT EXISTS Temadigital_Data_Portal
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE Temadigital_Data_Portal;

CREATE TABLE IF NOT EXISTS MapData (
  mapDataID    VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT 'Unique id, e.g. KK_OSPREY',
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
('KK_OSPREY', 'KK OSPREY', '3D model from GeoSabah 3D Hub (Kota Kinabalu area).', 116.070466, 5.957839, 'https://3dhub.geosabah.my/3dmodel/KK_OSPREY/tileset.json', '', NOW())
ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), xAxis = VALUES(xAxis), yAxis = VALUES(yAxis), `3dTiles` = VALUES(`3dTiles`), thumbNailUrl = VALUES(thumbNailUrl), updateDateTime = VALUES(updateDateTime);

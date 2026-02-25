-- Enable PostGIS extension (Must be done in the specific database)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create the spatial_features table
CREATE TABLE IF NOT EXISTS spatial_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL, -- 'length', 'height', 'area', 'marker', 'line', 'polygon'
    category VARCHAR(20) NOT NULL, -- 'measurement', 'annotation'
    geom GEOMETRY(GeometryZ, 4326), -- 3D geometry with SRID 4326 (WGS84)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for spatial queries (optional but good practice)
CREATE INDEX IF NOT EXISTS idx_spatial_features_geom ON spatial_features USING GIST (geom);

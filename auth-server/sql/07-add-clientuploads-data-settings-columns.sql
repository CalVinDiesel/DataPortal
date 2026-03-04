-- Add Data Settings columns to ClientUploads (from client upload page: description, category, location, area, sensor metadata)
-- Run once on existing database: psql -U postgres -d Temadigital_Data_Portal -f 07-add-clientuploads-data-settings-columns.sql
-- New installs: add these columns to 03-admin-tables-postgres.sql if you prefer a single script.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'project_description') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN project_description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'category') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN category VARCHAR(128);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'latitude') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN latitude DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'longitude') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN longitude DOUBLE PRECISION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'area_coverage') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN area_coverage VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'image_metadata') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN image_metadata VARCHAR(512);
  END IF;
END $$;

COMMENT ON COLUMN public."ClientUploads".project_description IS 'Project description from client Data Settings form';
COMMENT ON COLUMN public."ClientUploads".category IS 'Category from client (e.g. Select or Other value)';
COMMENT ON COLUMN public."ClientUploads".latitude IS 'Latitude from client Range of Interest';
COMMENT ON COLUMN public."ClientUploads".longitude IS 'Longitude from client Range of Interest';
COMMENT ON COLUMN public."ClientUploads".area_coverage IS 'Area coverage from client (e.g. km²)';
COMMENT ON COLUMN public."ClientUploads".image_metadata IS 'Sensor/image metadata format from client';

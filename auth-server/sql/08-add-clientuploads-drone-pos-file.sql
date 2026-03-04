-- Add Drone POS File path to ClientUploads (optional .txt/.csv Position Orientation System file from upload page)
-- Run once on existing database: psql -U postgres -d Temadigital_Data_Portal -f 08-add-clientuploads-drone-pos-file.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'drone_pos_file_path') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN drone_pos_file_path TEXT;
  END IF;
END $$;

COMMENT ON COLUMN public."ClientUploads".drone_pos_file_path IS 'Optional path to uploaded Drone POS file (.txt/.csv) for flight path coordinates; overrides image EXIF extraction';

-- 20-fix-missing-client-uploads-columns.sql
-- Run this on PostgreSQL: psql -U postgres -d Temadigital_Data_Portal -f auth-server/sql/20-fix-missing-client-uploads-columns.sql

DO $$
BEGIN
  -- organization_name
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'organization_name') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN organization_name VARCHAR(255);
  END IF;

  -- project_description
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'project_description') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN project_description TEXT;
  END IF;

  -- category
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'category') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN category VARCHAR(128);
  END IF;

  -- latitude
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'latitude') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN latitude DOUBLE PRECISION;
  END IF;

  -- longitude
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'longitude') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN longitude DOUBLE PRECISION;
  END IF;

  -- area_coverage
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'area_coverage') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN area_coverage VARCHAR(255);
  END IF;

  -- image_metadata
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'image_metadata') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN image_metadata TEXT;
  END IF;

  -- drone_pos_file_path
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'drone_pos_file_path') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN drone_pos_file_path TEXT;
  END IF;

  -- total_size_bytes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'total_size_bytes') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN total_size_bytes BIGINT;
  END IF;

  -- tokens_charged
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ClientUploads' AND column_name = 'tokens_charged') THEN
    ALTER TABLE public."ClientUploads" ADD COLUMN tokens_charged NUMERIC(12,2);
  END IF;

END $$;

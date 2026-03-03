-- Admin portal tables: client uploads and 3D processing requests
-- Run this while connected to database Temadigital_Data_Portal (e.g. in pgAdmin).
-- Example: psql -U postgres -d Temadigital_Data_Portal -f sql/03-admin-tables-postgres.sql

-- Client uploads: metadata for images uploaded via the data portal upload page
CREATE TABLE IF NOT EXISTS public."ClientUploads" (
  id                SERIAL PRIMARY KEY,
  project_id        VARCHAR(128) NOT NULL,
  project_title     VARCHAR(255),
  upload_type       VARCHAR(32)  NOT NULL DEFAULT 'single',  -- 'single' | 'multiple'
  file_count        INTEGER      NOT NULL DEFAULT 0,
  file_paths        TEXT[],      -- paths under UPLOAD_DIR, e.g. {'uploads/abc123/img1.jpg', ...}
  camera_models     VARCHAR(512),
  capture_date      DATE,
  organization_name VARCHAR(255),
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_email  VARCHAR(255)
);

COMMENT ON TABLE public."ClientUploads" IS 'Metadata for client-uploaded image sets (from upload-data page)';
CREATE INDEX IF NOT EXISTS idx_client_uploads_project_id ON public."ClientUploads"(project_id);
CREATE INDEX IF NOT EXISTS idx_client_uploads_created_at ON public."ClientUploads"(created_at DESC);

-- Processing requests: admin requests to generate 3D model from a client upload
CREATE TABLE IF NOT EXISTS public."ProcessingRequests" (
  id                SERIAL PRIMARY KEY,
  upload_id         INTEGER NOT NULL REFERENCES public."ClientUploads"(id) ON DELETE CASCADE,
  status            VARCHAR(32) NOT NULL DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  requested_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  requested_by      VARCHAR(255),
  completed_at      TIMESTAMP WITH TIME ZONE,
  result_tileset_url VARCHAR(2048),  -- URL to tileset.json when completed
  notes             TEXT
);

COMMENT ON TABLE public."ProcessingRequests" IS 'Admin requests to process client uploads into 3D models';
CREATE INDEX IF NOT EXISTS idx_processing_requests_upload_id ON public."ProcessingRequests"(upload_id);
CREATE INDEX IF NOT EXISTS idx_processing_requests_status ON public."ProcessingRequests"(status);

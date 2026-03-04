-- Admin portal tables: client requests for custom image-to-3D processing (paid service)
-- Clients submit their own drone-captured images; we process them into 3D models and deliver back to the client (not to the overview map).
-- Run this while connected to database Temadigital_Data_Portal (e.g. in pgAdmin).
-- Example: psql -U postgres -d Temadigital_Data_Portal -f sql/03-admin-tables-postgres.sql

-- Client uploads: client requests for custom image processing to create 3D model (their images, our processing, delivered back to them with charges)
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
  created_by_email  VARCHAR(255),
  request_status    VARCHAR(32)  NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'rejected'
  rejected_reason   TEXT,        -- reason given by admin when rejecting
  decided_at        TIMESTAMP WITH TIME ZONE,
  decided_by        VARCHAR(255),
  drone_pos_file_path TEXT  -- optional path to uploaded Drone POS file (.txt/.csv) from upload page
);

COMMENT ON TABLE public."ClientUploads" IS 'Client requests for custom image-to-3D processing: clients upload their own drone images; processed 3D model is delivered back to them (paid service), not added to overview map';
COMMENT ON COLUMN public."ClientUploads"."request_status" IS 'Admin decision: pending, accepted, or rejected';
COMMENT ON COLUMN public."ClientUploads"."rejected_reason" IS 'Reason given to client when request is rejected';
CREATE INDEX IF NOT EXISTS idx_client_uploads_project_id ON public."ClientUploads"(project_id);
CREATE INDEX IF NOT EXISTS idx_client_uploads_created_at ON public."ClientUploads"(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_uploads_request_status ON public."ClientUploads"(request_status);

-- Processing requests: admin processing of a client upload; result 3D model is sent back to the client
CREATE TABLE IF NOT EXISTS public."ProcessingRequests" (
  id                SERIAL PRIMARY KEY,
  upload_id         INTEGER NOT NULL REFERENCES public."ClientUploads"(id) ON DELETE CASCADE,
  status            VARCHAR(32) NOT NULL DEFAULT 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  requested_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  requested_by      VARCHAR(255),
  completed_at      TIMESTAMP WITH TIME ZONE,
  result_tileset_url VARCHAR(2048),  -- URL or path to deliver the processed 3D model (tileset) back to the client
  notes             TEXT,
  delivered_at      TIMESTAMP WITH TIME ZONE,  -- when the 3D model was sent/delivered back to the client
  delivery_notes    TEXT  -- optional notes (e.g. download link, method)
);

COMMENT ON TABLE public."ProcessingRequests" IS 'Admin processing of client image uploads; completed 3D model is delivered to the client (paid service), not added to overview map';
COMMENT ON COLUMN public."ProcessingRequests".delivered_at IS 'When the processed 3D model was sent/delivered back to the client';
COMMENT ON COLUMN public."ProcessingRequests".delivery_notes IS 'Optional notes about delivery (e.g. download link, method)';
CREATE INDEX IF NOT EXISTS idx_processing_requests_upload_id ON public."ProcessingRequests"(upload_id);
CREATE INDEX IF NOT EXISTS idx_processing_requests_status ON public."ProcessingRequests"(status);

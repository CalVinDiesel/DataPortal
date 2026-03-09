-- Ensure your admin email exists in DataPortalUsers with role = 'admin'.
-- Run this in pgAdmin (Query Tool) on your Temadigital_Data_Portal database so Google/Microsoft login can open the admin portal.
-- Replace the email and name below with your admin account.

-- 1) Create table if it doesn't exist (same as 09-data-portal-users-table.sql)
CREATE TABLE IF NOT EXISTS public."DataPortalUsers" (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(255),
  username        VARCHAR(128),
  contact_number  VARCHAR(64),
  role            VARCHAR(32)  NOT NULL DEFAULT 'client',
  provider        VARCHAR(32)  NOT NULL DEFAULT 'local',
  password_hash   VARCHAR(255),
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_data_portal_users_email UNIQUE (email)
);

-- 2) Insert or update your admin — change the email to your admin Gmail
INSERT INTO public."DataPortalUsers" (email, name, username, contact_number, role, provider, password_hash)
VALUES (
  'mosestiquan23@gmail.com',
  'Moses Ti Quan',
  'tiquan',
  '+60138158234',
  'admin',
  'local',
  NULL
)
ON CONFLICT (email) DO UPDATE SET
  role       = 'admin',
  name       = COALESCE(EXCLUDED.name, public."DataPortalUsers".name),
  updated_at = NOW();

-- After running this, restart the auth server and log in again with Google or Microsoft using this email.

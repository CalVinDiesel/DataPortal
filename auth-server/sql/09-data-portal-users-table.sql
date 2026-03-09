-- Data Portal user directory: used by the Admin portal "Manage Users" and for auth roles.
-- This table is separate from Better Auth's internal tables and from MicrosoftUsers.
-- When PG_DATABASE is set, new registrations (email/password and OAuth complete-profile) are stored here,
-- and Admin → Manage Users reads from and updates this table.
-- Run while connected to database Temadigital_Data_Portal (e.g. in pgAdmin).
-- Example: psql -U postgres -d Temadigital_Data_Portal -f sql/09-data-portal-users-table.sql

CREATE TABLE IF NOT EXISTS public."DataPortalUsers" (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(255),
  username        VARCHAR(128),
  contact_number  VARCHAR(64),
  role            VARCHAR(32)  NOT NULL DEFAULT 'client',  -- 'client' | 'admin' (column used for roles)
  provider        VARCHAR(32)  NOT NULL DEFAULT 'local',  -- 'local' | 'google' | 'microsoft'
  password_hash   VARCHAR(255),                          -- null for OAuth-only users
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT uq_data_portal_users_email UNIQUE (email)
);

COMMENT ON TABLE public."DataPortalUsers" IS 'Data Portal user directory: registration and roles for Admin Manage Users; separate from Better Auth and MicrosoftUsers';
COMMENT ON COLUMN public."DataPortalUsers".role IS 'User role: client or admin';
COMMENT ON COLUMN public."DataPortalUsers".provider IS 'Auth provider: local (email/password), google, or microsoft';

CREATE INDEX IF NOT EXISTS idx_data_portal_users_email ON public."DataPortalUsers"(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_data_portal_users_role ON public."DataPortalUsers"(role);

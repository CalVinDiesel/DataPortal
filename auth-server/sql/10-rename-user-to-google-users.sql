-- Rename Better Auth's "user" table to "GoogleUsers" so it's clear it stores Google OAuth users.
-- Run this once in pgAdmin 4: connect to your database, open Query Tool, paste this script, and Execute (F5).
-- If you have not used Google sign-in yet, you can skip this and let Better Auth create "GoogleUsers" on first use.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user'
  ) THEN
    ALTER TABLE public."user" RENAME TO "GoogleUsers";
    RAISE NOTICE 'Renamed table "user" to "GoogleUsers".';
  ELSE
    RAISE NOTICE 'Table "user" does not exist; nothing to rename. Better Auth will create "GoogleUsers" when needed.';
  END IF;
END $$;

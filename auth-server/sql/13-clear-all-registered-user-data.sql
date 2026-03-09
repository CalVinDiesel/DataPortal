-- Clear ALL registered user data (clients and admins). Tables and structure stay; only data is removed.
-- Login (Google, Microsoft, email/password) will still work — users will need to register again.
-- Run in pgAdmin: Query Tool, execute on your Temadigital_Data_Portal database.

-- 1) Data Portal user directory (admin portal Manage Users, roles)
TRUNCATE TABLE public."DataPortalUsers" RESTART IDENTITY;

-- 2) Microsoft OAuth users
TRUNCATE TABLE public."MicrosoftUsers" RESTART IDENTITY;

-- 3) Better Auth: only truncate if tables exist (session, account, verification, then user table)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session') THEN
    TRUNCATE TABLE public.session RESTART IDENTITY CASCADE; RAISE NOTICE 'Cleared session.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account') THEN
    TRUNCATE TABLE public.account RESTART IDENTITY CASCADE; RAISE NOTICE 'Cleared account.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'verification') THEN
    TRUNCATE TABLE public.verification RESTART IDENTITY CASCADE; RAISE NOTICE 'Cleared verification.';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'GoogleUsers') THEN
    TRUNCATE TABLE public."GoogleUsers" RESTART IDENTITY CASCADE; RAISE NOTICE 'Cleared GoogleUsers.';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user') THEN
    TRUNCATE TABLE public."user" RESTART IDENTITY CASCADE; RAISE NOTICE 'Cleared user.';
  END IF;
END $$;

-- After running this script, also clear auth-server/data/users.json (set it to: [])
-- so that email/password users are cleared. The file has been emptied for you in the project.

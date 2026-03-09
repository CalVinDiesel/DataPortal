-- Optional: normalize email to lowercase and remove duplicate rows (same email, different case).
-- Run in pgAdmin if the same person has two rows (e.g. Admin@gmail.com and admin@gmail.com) so role is wrong when logging in with Microsoft.
-- Keeps one row per email; prefers the row with role='admin' when merging. Then sets all emails to lowercase.

-- Step 1: Delete duplicate rows (same LOWER(email)), keeping one per email (prefer role='admin')
WITH keep AS (
  SELECT DISTINCT ON (LOWER(email)) id
  FROM public."DataPortalUsers"
  ORDER BY LOWER(email), (CASE WHEN role = 'admin' THEN 0 ELSE 1 END), id
)
DELETE FROM public."DataPortalUsers" WHERE id NOT IN (SELECT id FROM keep);

-- Step 2: Normalize all emails to lowercase
UPDATE public."DataPortalUsers" SET email = LOWER(email) WHERE email <> LOWER(email);

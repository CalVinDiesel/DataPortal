-- Document that DataPortalUsers.role can be 'client', 'subscriber', or 'admin'.
-- No schema change needed; the role column is already VARCHAR(32).
-- Subscriber = upgraded client; can upload raw data and purchase 3D models.

COMMENT ON COLUMN public."DataPortalUsers".role IS 'User role: client (default), subscriber (can upload/purchase), or admin';

-- Clear all data in ClientUploads and ProcessingRequests. Tables and structure (columns, constraints, indexes, rules) are kept.
-- Run in pgAdmin: Query Tool, execute on your Temadigital_Data_Portal database.

-- ProcessingRequests references ClientUploads, so truncate the dependent table first
TRUNCATE TABLE public."ProcessingRequests" RESTART IDENTITY CASCADE;

TRUNCATE TABLE public."ClientUploads" RESTART IDENTITY CASCADE;

-- After running: both tables are empty; IDs will restart from 1 on next insert.

-- Step 1: Create the database (run this while connected to "postgres" or "template1")
-- In your database sidebar: connect to server localhost@5432, then run this in a query against "postgres".

CREATE DATABASE "Temadigital_Data_Portal"
  WITH ENCODING 'UTF8'
       LC_COLLATE = 'en_US.UTF-8'
       LC_CTYPE = 'en_US.UTF-8'
       TEMPLATE = template0;

-- If you get a locale error, use this instead:
-- CREATE DATABASE "Temadigital_Data_Portal" WITH ENCODING 'UTF8' TEMPLATE = template0;

-- After this, switch your connection to database "Temadigital_Data_Portal" and run 02-create-table-mapdata.sql

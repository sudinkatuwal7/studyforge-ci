-- Runs only when the Postgres data volume is created for the first time.
-- Application tables are created later by Django migrations.
CREATE EXTENSION IF NOT EXISTS vector;

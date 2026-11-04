-- Runs once, the first time the database container starts (docker-compose.yml mounts it into docker-entrypoint-initdb.d).
-- The automated tests use their own database so they can empty tables without touching your development data.
CREATE DATABASE campushop_test OWNER campushop;

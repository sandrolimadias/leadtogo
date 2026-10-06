#!/bin/bash
# Roda uma única vez, na criação do volume (docker-entrypoint-initdb.d), como superusuário.
# Cria os papéis do Leadtogo (ver docs/modelagem_banco.md, RLS):
#   leadtogo_owner: dono do banco e das tabelas; roda as migrações.
#   leadtogo_app:   usado pela API; sem BYPASSRLS e sem ser dono, para que o RLS valha.
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set owner_senha="$LEADTOGO_OWNER_PASSWORD" \
  --set app_senha="$LEADTOGO_APP_PASSWORD" \
  --set banco="$POSTGRES_DB" <<'SQL'
CREATE ROLE leadtogo_owner LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'owner_senha';
CREATE ROLE leadtogo_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'app_senha';

ALTER DATABASE :"banco" OWNER TO leadtogo_owner;
REVOKE ALL ON DATABASE :"banco" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"banco" TO leadtogo_app;

-- Extensões que exigem superusuário
CREATE EXTENSION IF NOT EXISTS postgis;

GRANT USAGE ON SCHEMA public TO leadtogo_app;

-- Tabelas e sequências criadas pelo owner (migrações) já nascem acessíveis ao app
ALTER DEFAULT PRIVILEGES FOR ROLE leadtogo_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leadtogo_app;
ALTER DEFAULT PRIVILEGES FOR ROLE leadtogo_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO leadtogo_app;
SQL

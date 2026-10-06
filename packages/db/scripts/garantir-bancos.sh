#!/usr/bin/env bash
# Garante, de forma idempotente, os bancos do Leadtogo e os papéis de cada um:
# cria o banco se faltar e aplica packages/db/sql/papeis.sql. Roda como superusuário.
#   BANCOS     bancos a garantir (padrão: "leadtogo leadtogo_test"; o CI usa só leadtogo_test)
#   SQL_DIR    pasta do papeis.sql (padrão: ../sql ao lado deste script)
#   PGHOST/PGUSER/PGPASSWORD...  conexão do psql; LEADTOGO_OWNER_PASSWORD e LEADTOGO_APP_PASSWORD obrigatórias
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"

BANCOS=${BANCOS:-"leadtogo leadtogo_test"}
SQL_DIR=${SQL_DIR:-"$(cd "$(dirname "$0")/../sql" && pwd)"}

: "${LEADTOGO_OWNER_PASSWORD:?defina LEADTOGO_OWNER_PASSWORD}"
: "${LEADTOGO_APP_PASSWORD:?defina LEADTOGO_APP_PASSWORD}"
export LEADTOGO_OWNER_PASSWORD LEADTOGO_APP_PASSWORD

for banco in $BANCOS; do
  psql -X -q -v ON_ERROR_STOP=1 -v banco="$banco" -d postgres <<'SQL'
SELECT format('CREATE DATABASE %I', :'banco')
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'banco') \gexec
SQL
  psql -X -q -v ON_ERROR_STOP=1 -d "$banco" -f "$SQL_DIR/papeis.sql"
  echo "Banco '$banco' pronto."
done

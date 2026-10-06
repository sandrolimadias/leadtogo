#!/usr/bin/env bash
# Sobe os serviços de dados locais e deixa tudo pronto. Pode ser repetido sem erro.
#   1. Postgres, Valkey e Garage saudáveis (docker compose up --wait)
#   2. bancos leadtogo e leadtogo_test + papéis (packages/db/scripts/garantir-bancos.sh)
#   3. layout, chave e bucket do Garage (docker/garage/init.sh)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo ".env não existe. Rode: cp .env.example .env" >&2
  exit 1
fi

COMPOSE=(docker compose --env-file .env -f docker/compose.dev.yml)

"${COMPOSE[@]}" up -d --wait
"${COMPOSE[@]}" exec -T -e PGUSER=postgres -e SQL_DIR=/sql postgres bash /scripts/garantir-bancos.sh
bash docker/garage/init.sh

#!/bin/bash
# Roda uma única vez, na criação do volume (docker-entrypoint-initdb.d), como superusuário.
# Cria os papéis e os bancos leadtogo e leadtogo_test (packages/db/scripts/garantir-bancos.sh).
# O `pnpm dev:up` repete o mesmo script, então volumes antigos também ficam em dia.
set -euo pipefail
PGUSER="$POSTGRES_USER" SQL_DIR=/sql bash /scripts/garantir-bancos.sh

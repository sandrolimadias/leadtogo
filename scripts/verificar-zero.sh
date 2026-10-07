#!/usr/bin/env bash
# Verificação "do zero" SEM tocar nos dados de desenvolvimento: cria bancos temporários (próprios para
# esta execução), aplica as migrações, roda o seed e a suíte completa contra eles, e apaga tudo no fim.
# O banco `leadtogo` (e os de teste de sempre) não são usados nem alterados.
#   pnpm verificar:zero             migrações + seed + testes (turbo) + E2E
#   pnpm verificar:zero --sem-e2e   sem o E2E do Playwright
# Pré-requisito: pnpm dev:up (Postgres, Valkey, Garage e Mailpit locais de pé).
set -euo pipefail
cd "$(dirname "$0")/.."

E2E=1
for a in "$@"; do
  case "$a" in
    --sem-e2e) E2E=0 ;;
    *) echo "Uso: pnpm verificar:zero [--sem-e2e]" >&2; exit 2 ;;
  esac
done

[ -f .env ] || { echo ".env não existe. Rode: cp .env.example .env" >&2; exit 1; }
# O .env não é um script de shell (valores com < >): lê só o que precisa, pelo carregador do Node
lerenv() { node --env-file=.env -e "process.stdout.write(process.env['$1'] ?? '')"; }
DATABASE_URL="$(lerenv DATABASE_URL)"
DATABASE_MIGRATION_URL="$(lerenv DATABASE_MIGRATION_URL)"
TEST_DATABASE_URL="$(lerenv TEST_DATABASE_URL)"
TEST_DATABASE_MIGRATION_URL="$(lerenv TEST_DATABASE_MIGRATION_URL)"
TEST_API_DATABASE_URL="$(lerenv TEST_API_DATABASE_URL)"
TEST_API_DATABASE_MIGRATION_URL="$(lerenv TEST_API_DATABASE_MIGRATION_URL)"
REDIS_URL="$(lerenv REDIS_URL)"

ID="vz$(date +%s)"
BANCO="leadtogo_${ID}"
BANCOS="${BANCO} ${BANCO}_test ${BANCO}_api_test"
COMPOSE=(docker compose --env-file .env -f docker/compose.dev.yml)
psql_admin() { "${COMPOSE[@]}" exec -T -e PGUSER=postgres postgres psql -X -q -v ON_ERROR_STOP=1 -d postgres "$@"; }

apagar() {
  local codigo=$?
  echo
  echo "==> Apagando os bancos temporários (${BANCOS})"
  for b in $BANCOS; do
    psql_admin -c "DROP DATABASE IF EXISTS \"${b}\" WITH (FORCE)" >/dev/null 2>&1 || echo "  não foi possível apagar ${b}" >&2
  done
  exit "$codigo"
}
trap apagar EXIT

# troca o nome do banco no fim de uma URL postgres://.../nome
com_banco() { echo "${1%/*}/$2"; }

echo "==> Criando os bancos temporários (${BANCOS})"
"${COMPOSE[@]}" exec -T -e PGUSER=postgres -e BANCOS="$BANCOS" -e SQL_DIR=/sql postgres bash /scripts/garantir-bancos.sh

# Tudo o que o app e os testes leem do ambiente aponta para os bancos temporários (o .env não é alterado)
export DATABASE_URL="$(com_banco "$DATABASE_URL" "$BANCO")"
export DATABASE_MIGRATION_URL="$(com_banco "$DATABASE_MIGRATION_URL" "$BANCO")"
export TEST_DATABASE_URL="$(com_banco "$TEST_DATABASE_URL" "${BANCO}_test")"
export TEST_DATABASE_MIGRATION_URL="$(com_banco "$TEST_DATABASE_MIGRATION_URL" "${BANCO}_test")"
export TEST_API_DATABASE_URL="$(com_banco "$TEST_API_DATABASE_URL" "${BANCO}_api_test")"
export TEST_API_DATABASE_MIGRATION_URL="$(com_banco "$TEST_API_DATABASE_MIGRATION_URL" "${BANCO}_api_test")"
# Valkey: o banco 9 só para esta verificação (o do desenvolvimento é o 0; os testes de sempre, o 1)
export TEST_REDIS_URL="$(echo "$REDIS_URL" | sed -E 's#^(redis://[^/]+).*#\1#')/9"

inicio=$(date +%s)
etapa() { echo; echo "==> $1"; }

etapa "Migrações"
pnpm db:migrate
etapa "Seed"
pnpm db:seed
etapa "Suíte completa (lint, tipos e testes, do zero)"
pnpm lint && pnpm typecheck && pnpm test --force
if [ "$E2E" = 1 ]; then
  etapa "E2E (Playwright contra API, worker e banco temporário)"
  pnpm --filter @leadtogo/web e2e
fi

echo
echo "==> Verificação do zero OK em $(( $(date +%s) - inicio )) s (banco temporário: ${BANCO})"

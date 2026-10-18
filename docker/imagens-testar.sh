#!/usr/bin/env bash
# Testa as IMAGENS de produção localmente (docker/compose.imagens.yml), sem tocar no banco `leadtogo` de
# desenvolvimento: cria um banco temporário, sobe migrar → api → worker → web → borda, confere /health, login e
# primeiro acesso pelo navegador (Playwright) e o encerramento do worker com `docker stop`; apaga tudo no fim.
#   pnpm imagens:testar                 constrói as imagens e testa (amd64 nativo)
#   pnpm imagens:testar --sem-build     usa as imagens leadtogo-api:teste e leadtogo-web:teste já construídas
#   pnpm imagens:testar --arm64         constrói e testa como linux/arm64 (emulação do Docker Desktop)
# Pré-requisito: pnpm dev:up (Postgres, Valkey, Garage e Mailpit locais de pé).
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD=1
ARM=0
for a in "$@"; do
  case "$a" in
    --sem-build) BUILD=0 ;;
    --arm64) ARM=1 ;;
    *) echo "Uso: pnpm imagens:testar [--sem-build] [--arm64]" >&2; exit 2 ;;
  esac
done

[ -f .env ] || { echo ".env não existe. Rode: cp .env.example .env" >&2; exit 1; }
VERSAO="teste-$(git rev-parse --short HEAD)$([ "$ARM" = 1 ] && echo -arm64 || true)"
SUFIXO=$([ "$ARM" = 1 ] && echo -arm64 || true)
API_IMAGEM="leadtogo-api:teste${SUFIXO}"
WEB_IMAGEM="leadtogo-web:teste${SUFIXO}"
PLATAFORMA=$([ "$ARM" = 1 ] && echo linux/arm64 || echo linux/amd64)
ID="img$(date +%s)"
export BANCO="leadtogo_${ID}"
export API_IMAGEM WEB_IMAGEM
export PORTA_BORDA="${PORTA_BORDA:-8080}" PORTA_API="${PORTA_API:-3300}" REDIS_DB=6
ARQUIVOS=(-f docker/compose.imagens.yml)
[ "$ARM" = 1 ] && ARQUIVOS+=(-f docker/compose.imagens.arm64.yml)
COMPOSE=(docker compose --env-file .env "${ARQUIVOS[@]}")
DEV=(docker compose --env-file .env -f docker/compose.dev.yml)

limpar() {
  local codigo=$?
  echo; echo "==> Limpando (containers, banco temporário e Valkey 6)"
  # o PMTiles de teste sai do Garage de desenvolvimento (a API ainda está de pé neste ponto)
  docker exec "$("${COMPOSE[@]}" ps -q api 2>/dev/null)" node --input-type=module -e '
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3"
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } })
await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: process.env.GEO_PMTILES_CHAVE }))
' >/dev/null 2>&1 || true
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  "${DEV[@]}" exec -T -e PGUSER=postgres postgres psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"${BANCO}\" WITH (FORCE)" >/dev/null 2>&1 || true
  "${DEV[@]}" exec -T valkey valkey-cli -n 6 FLUSHDB >/dev/null 2>&1 || true
  exit "$codigo"
}
trap limpar EXIT

tamanhos() {
  local img
  for img in "$API_IMAGEM" "$WEB_IMAGEM"; do
    local descompactada comp
    # `docker image ls` mostra o tamanho em disco (descompactado); `docker save | gzip` aproxima o que a VPS baixa
    descompactada=$(docker image ls --format '{{.Size}}' "$img")
    comp=$(docker save "$img" | gzip -c | wc -c)
    printf '   %-26s descompactada %-8s · compactada ~%d MB\n' "$img" "$descompactada" $((comp / 1000000))
  done
}

if [ "$BUILD" = 1 ]; then
  echo "==> Construindo as imagens (${PLATAFORMA}, versão ${VERSAO})"
  for par in "api:${API_IMAGEM}" "web:${WEB_IMAGEM}"; do
    docker buildx build --platform "$PLATAFORMA" --load -f "docker/${par%%:*}.Dockerfile" \
      --build-arg APP_VERSION="$VERSAO" --build-arg GIT_SHA="$(git rev-parse HEAD)" \
      --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" -t "${par#*:}" .
  done
fi
echo "==> Tamanhos"; tamanhos

echo "==> Criando o banco temporário ${BANCO}"
"${DEV[@]}" exec -T -e PGUSER=postgres -e BANCOS="$BANCO" -e SQL_DIR=/sql postgres bash /scripts/garantir-bancos.sh

echo "==> Subindo migrar → api + worker → web → borda"
"${COMPOSE[@]}" up -d --wait --wait-timeout 240
"${COMPOSE[@]}" ps -a --format 'table {{.Service}}\t{{.Status}}'
echo "-- migração:"; "${COMPOSE[@]}" logs migrar 2>&1 | grep -E "Aplicando|aplicadas|Falha" | tail -3
test "$(docker inspect -f '{{.State.ExitCode}}' "$("${COMPOSE[@]}" ps -a -q migrar)")" = 0 && echo "   migrar saiu com 0"
echo "-- PAPEL=api migrou/semeou ao iniciar e PAPEL=worker subiu sem a URL de migração:"
"${COMPOSE[@]}" logs api 2>&1 | grep -E "Aplicando|aplicadas|Referências em dia" | sed 's/^[^|]*| /   api: /' | tail -3
"${COMPOSE[@]}" logs worker 2>&1 | grep -E "Iniciando o worker|DATABASE_MIGRATION_URL" | sed 's/^[^|]*| /   worker: /' | tail -2
cnaes=$("${DEV[@]}" exec -T -e PGUSER=postgres postgres psql -X -At -d "$BANCO" -c "SELECT count(*) FROM cnaes")
test "$cnaes" = 1332 && echo "   referências no banco: $cnaes CNAEs" || { echo "   FALHA: $cnaes CNAEs (esperado 1332)" >&2; exit 1; }
echo "-- usuário e PID 1:"
docker exec "$("${COMPOSE[@]}" ps -q api)" sh -c 'echo "   api: uid=$(id -u) ($(id -un)), PID 1 = $(cat /proc/1/comm)"; ls /app/node_modules/.bin 2>/dev/null | grep -c drizzle-kit | sed "s/^/   drizzle-kit na imagem: /"'
echo "-- source maps ativos em qualquer comando node do container (NODE_OPTIONS da imagem):"
mapas=$(docker exec "$("${COMPOSE[@]}" ps -q api)" node -p 'process.sourceMapsEnabled')
test "$mapas" = true && echo "   api: node iniciado à mão com source maps ativos" || { echo "   FALHA: source maps desligados (process.sourceMapsEnabled=$mapas)" >&2; exit 1; }
echo "-- health dos containers (HEALTHCHECK da imagem):"
for s in api worker web; do
  echo "   $s: $(docker inspect -f '{{.State.Health.Status}}' "$("${COMPOSE[@]}" ps -q "$s")")"
done

echo "==> PMTiles de teste no Garage (o mapa precisa de uma base para a verificação do navegador)"
docker exec -i "$("${COMPOSE[@]}" ps -q api)" node --input-type=module -e '
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
const partes = []
for await (const p of process.stdin) partes.push(p)
const s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } })
await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: process.env.GEO_PMTILES_CHAVE, Body: Buffer.concat(partes) }))
console.log("   enviado:", Buffer.concat(partes).length, "bytes")
' < docker/fixtures/mapa-teste.pmtiles

echo "==> Navegador (Playwright) pela borda http://localhost:${PORTA_BORDA}"
BORDA_URL="http://localhost:${PORTA_BORDA}" API_URL="http://localhost:${PORTA_API}" VERSAO="$VERSAO" \
  node apps/web/scripts/testar-imagens.mjs

echo "==> Encerramento do worker com docker stop (grace de 45 s)"
WORKER=$("${COMPOSE[@]}" ps -q worker)
inicio=$(date +%s.%N)
docker stop "$WORKER" >/dev/null
fim=$(date +%s.%N)
saida=$(docker inspect -f '{{.State.ExitCode}}' "$WORKER")
tempo=$(awk -v a="$inicio" -v b="$fim" 'BEGIN{printf "%.1f", b-a}')
echo "   worker parou em ${tempo} s, código de saída ${saida}"
"${COMPOSE[@]}" logs worker 2>&1 | tail -4 | sed 's/^/   /'
[ "$saida" = 0 ] || { echo "   FALHA: o worker não saiu com 0 (foi morto?)" >&2; exit 1; }
awk -v t="$tempo" 'BEGIN{exit !(t < 40)}' || { echo "   FALHA: demorou ${tempo} s (esperado < 40 s)" >&2; exit 1; }

echo; echo "==> Imagens OK (${PLATAFORMA}, versão ${VERSAO})"

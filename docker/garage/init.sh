#!/usr/bin/env bash
# Prepara o Garage de desenvolvimento: layout de um nó, bucket e chave de acesso.
# Idempotente. Uso (na raiz do repositório, com o compose no ar):
#   bash docker/garage/init.sh
# A chave vem de S3_ACCESS_KEY / S3_SECRET_KEY do .env (formato do Garage:
# "GK" + 24 hex e 64 hex); sem .env, usa os valores de desenvolvimento do .env.example.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker/compose.dev.yml)
garage() { "${COMPOSE[@]}" exec -T -e RUST_LOG=warn garage /garage "$@"; }

# Lê uma variável do .env sem executá-lo
env_valor() {
  local arquivo valor
  for arquivo in .env .env.example; do
    [ -f "$arquivo" ] || continue
    valor=$(grep -E "^$1=" "$arquivo" | head -n1 | cut -d= -f2- || true)
    if [ -n "$valor" ]; then
      printf '%s' "$valor"
      return
    fi
  done
}

ACCESS_KEY=$(env_valor S3_ACCESS_KEY)
SECRET_KEY=$(env_valor S3_SECRET_KEY)
BUCKET=$(env_valor S3_BUCKET)
BUCKET=${BUCKET:-leadtogo-arquivos}

if [ -z "$ACCESS_KEY" ] || [ -z "$SECRET_KEY" ]; then
  echo "S3_ACCESS_KEY e S3_SECRET_KEY não definidos no .env." >&2
  exit 1
fi

echo "Aguardando o Garage..."
for _ in $(seq 1 30); do
  garage status >/dev/null 2>&1 && break
  sleep 2
done
garage status >/dev/null

# Layout: um nó, uma zona, 1 GB (suficiente para desenvolvimento)
if garage status | grep -q 'NO ROLE ASSIGNED'; then
  NODE_ID=$(garage node id -q | cut -d@ -f1)
  garage layout assign -z dev -c 1G "$NODE_ID" >/dev/null
  garage layout apply --version 1 >/dev/null
  echo "Layout aplicado."
fi

# Chave (importada, para ser a mesma do .env)
if ! garage key info "$ACCESS_KEY" >/dev/null 2>&1; then
  garage key import --yes -n leadtogo-dev "$ACCESS_KEY" "$SECRET_KEY" >/dev/null
fi

# Bucket privado + permissão da chave
garage bucket info "$BUCKET" >/dev/null 2>&1 || garage bucket create "$BUCKET" >/dev/null
garage bucket allow --read --write --owner "$BUCKET" --key "$ACCESS_KEY" >/dev/null

echo "Garage pronto: bucket '$BUCKET', chave '$ACCESS_KEY'."

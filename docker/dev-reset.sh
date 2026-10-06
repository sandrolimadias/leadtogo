#!/usr/bin/env bash
# Para os containers e apaga docker/.data/ (banco, Valkey e Garage), após confirmação.
# Uso: pnpm dev:reset   (para pular a pergunta: pnpm dev:reset --yes)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${1:-}" != "--yes" ]; then
  read -r -p "Isso apaga TODOS os dados locais em docker/.data/. Continuar? [s/N] " resposta
  case "$resposta" in
    s | S | sim | SIM) ;;
    *)
      echo "Cancelado."
      exit 0
      ;;
  esac
fi

docker compose -f docker/compose.dev.yml down

# Os arquivos pertencem ao usuário do container (ex.: postgres); sem sudo, apaga por um container
if [ -d docker/.data ]; then
  rm -rf docker/.data 2>/dev/null || docker run --rm \
    -v "$PWD/docker/.data:/dados" --entrypoint sh imresamu/postgis:17-3.5 \
    -c 'rm -rf /dados/* /dados/.[!.]*'
  rm -rf docker/.data
fi

echo "Dados locais apagados. Para recriar: pnpm dev:up"

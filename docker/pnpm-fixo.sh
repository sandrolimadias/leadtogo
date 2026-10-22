#!/bin/sh
# Fixa o pnpm na versão do package.json (campo packageManager) e o baixa COM TENTATIVAS. O pnpm 12 se instala
# sozinho no primeiro uso, baixando o binário do registro npm com prazo de 30 s; num build sem cache (o cache de
# camadas do GitHub expira) o download estourou o prazo em 21/10/2026 e derrubou o deploy várias vezes.
set -eu
versao=$(node -p "require('./package.json').packageManager")
corepack enable
for tentativa in 1 2 3 4 5 6; do
  if corepack prepare "$versao" --activate && pnpm --version >/dev/null; then
    echo "pnpm pronto: $(pnpm --version) (fixado em $versao)"
    exit 0
  fi
  echo "pnpm: o download falhou (tentativa $tentativa de 6); espero 15 s" >&2
  sleep 15
done
echo "pnpm: não foi possível baixar $versao" >&2
exit 1

#!/usr/bin/env bash
# Gate do pre-push numa CÓPIA LIMPA do commit que vai subir (git worktree), e não na pasta de trabalho:
# mudança ainda não commitada não esconde nem causa falha, e o que passa aqui é exatamente o que vai para a origin.
# Lê da entrada padrão as linhas do git (<ref local> <sha local> <ref remoto> <sha remoto>); sem elas, usa o HEAD.
# Roda lint, tipos e testes, um de cada vez (TURBO_CONCURRENCY=1), como no CI (docs/esteira_deploy.md, seção 10).
set -euo pipefail

raiz=$(git rev-parse --show-toplevel)
zero=0000000000000000000000000000000000000000

mapfile -t commits < <(awk -v z="$zero" '$2 != z { print $2 }' | sort -u)
if [ "${#commits[@]}" -eq 0 ]; then commits=("$(git rev-parse HEAD)"); fi

for commit in "${commits[@]}"; do
  dir=$(mktemp -d "${TMPDIR:-/tmp}/leadtogo-prepush.XXXXXX")
  limpar() { cd "$raiz"; git worktree remove --force "$dir" >/dev/null 2>&1 || rm -rf "$dir"; git worktree prune; }
  trap limpar EXIT
  echo "Gate numa cópia limpa de ${commit:0:7} (${dir})"
  git worktree add --detach "$dir" "$commit" >/dev/null
  # O .env não é versionado: as mesmas URLs de teste da pasta de trabalho (bancos e Valkey de desenvolvimento)
  cp "$raiz/.env" "$dir/.env"
  cd "$dir"
  pnpm install --frozen-lockfile --prefer-offline
  # Cache do Turborepo compartilhado com a pasta de trabalho (as chaves são por conteúdo)
  export TURBO_CACHE_DIR="$raiz/.turbo/cache"
  # Um comando por linha: com `a && b && c` o `set -e` não enxerga a falha de a ou b e o push passaria
  pnpm lint
  pnpm typecheck
  # O build do web como na imagem Docker (vite build + validar-dist): pega o que lint, tipos e testes não veem,
  # como um .js fora do precache do PWA (o push 3 do mapa só falhou aqui, na esteira). Leva ~30 s.
  (cd apps/web && node scripts/sincronizar-design-system.mjs && pnpm exec vite build && node scripts/validar-dist.mjs)
  TURBO_CONCURRENCY=1 pnpm test
  limpar
  trap - EXIT
done

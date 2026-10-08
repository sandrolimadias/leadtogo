#!/usr/bin/env bash
# Classifica uma mudança como "doc" (só documentação) ou "codigo". Fonte única da regra: o job `escopo`
# do CI e o hook pre-push usam este script.
#   bash scripts/escopo.sh arquivo1 arquivo2 ...     (ou um arquivo por linha na entrada padrão)
# Imprime `doc` ou `codigo`. Sem arquivos, imprime `codigo` (na dúvida, roda tudo).
# É documentação: *.md e docs/** — EXCETO docs/design-system/**, que alimenta o build do web
# (tokens, tema e fontes), e *.css/*.json/*.woff2 dentro dele.
set -euo pipefail

if [ "$#" -gt 0 ]; then
  arquivos=("$@")
else
  mapfile -t arquivos
fi

total=0
for f in "${arquivos[@]}"; do
  [ -n "$f" ] || continue
  total=$((total + 1))
  case "$f" in
    docs/design-system/*) echo codigo; exit 0 ;;
    docs/*.md | docs/*/*.md | docs/*/*/*.md | docs/*/*/*/*.md) ;;   # documentação
    docs/prototipo/*) ;;                                            # protótipo congelado (HTML de referência)
    *.md) ;;                                                        # README, CLAUDE.md etc.
    *) echo codigo; exit 0 ;;
  esac
done

if [ "$total" -eq 0 ]; then echo codigo; else echo doc; fi

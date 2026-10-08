#!/usr/bin/env bash
# Limpa versões antigas das imagens no GHCR. REGRAS DE SEGURANÇA (nesta ordem):
#   1. nunca apaga versão com a tag `latest`;
#   2. nunca apaga a versão em produção (SHA informado em PRODUCAO_SHA, lido do /health) nem a do commit atual;
#   3. só apaga versões com tag `sha-*`, mantendo as MANTER mais recentes; versões sem tag não são tocadas
#      (podem ser manifestos referenciados por outra versão);
#   4. se PRODUCAO_SHA estiver vazio, não apaga nada.
#   OWNER, PACOTES ("leadtogo-api leadtogo-web"), PRODUCAO_SHA, COMMIT_SHA, MANTER (padrão 15), SIMULAR=1 (só lista)
set -euo pipefail

: "${OWNER:?}" "${PACOTES:?}"
MANTER=${MANTER:-15}
if [ -z "${PRODUCAO_SHA:-}" ]; then
  echo "PRODUCAO_SHA vazio: não sei qual versão está em produção, nada será apagado."
  exit 0
fi

for pacote in $PACOTES; do
  echo "== $pacote"
  # Versões mais novas primeiro. O endpoint serve usuários e organizações; a conta é de usuário.
  gh api --paginate "/users/${OWNER}/packages/container/${pacote}/versions?per_page=100" \
    --jq '.[] | [.id, ((.metadata.container.tags // []) | join(","))] | @tsv' > "/tmp/versoes-${pacote}.tsv"
  ordem=0
  while IFS=$'\t' read -r id tags; do
    case ",${tags}," in
      *,sha-*) ;;
      *) continue ;;                                     # sem tag sha-: não toca
    esac
    ordem=$((ordem + 1))
    case ",${tags}," in
      *,latest,*) echo "mantém $id ($tags): latest"; continue ;;
    esac
    case ",${tags}," in
      *",sha-${PRODUCAO_SHA},"* | *",sha-${COMMIT_SHA:-nenhum},"*) echo "mantém $id ($tags): produção/atual"; continue ;;
    esac
    if [ "$ordem" -le "$MANTER" ]; then echo "mantém $id ($tags): entre as $MANTER mais recentes"; continue; fi
    if [ "${SIMULAR:-0}" = 1 ]; then echo "apagaria $id ($tags)"; continue; fi
    echo "apaga $id ($tags)"
    gh api -X DELETE "/users/${OWNER}/packages/container/${pacote}/versions/${id}" || echo "  (falhou; segue)"
  done < "/tmp/versoes-${pacote}.tsv"
done

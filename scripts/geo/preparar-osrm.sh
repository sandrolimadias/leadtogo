#!/usr/bin/env bash
# Prepara o OSRM do estado (perfil car, MLD) a partir do .osm.pbf já recortado (o mesmo do Nominatim).
# Preparo pesado: rode no SEU ambiente (WSL com Docker), NUNCA na VPS. Passo a passo e como levar
# para a VPS: docs/geo_atualizacao.md, seção "OSRM e VROOM".
#
#   scripts/geo/preparar-osrm.sh <estado.osm.pbf> [pasta-de-saida]
#
# Gera <pasta-de-saida>/osrm-<data>/ (os arquivos .osrm*) e o pacote osrm-<data>.tgz ao lado.
# A imagem é FIXADA: a VPS precisa rodar exatamente a mesma versão (os arquivos não servem entre versões).
set -euo pipefail

IMAGEM="ghcr.io/project-osrm/osrm-backend:v26.10.0-debian"

pbf="${1:?uso: scripts/geo/preparar-osrm.sh <estado.osm.pbf> [pasta-de-saida]}"
saida="${2:-$PWD}"
[ -f "$pbf" ] || { echo "Arquivo não encontrado: $pbf" >&2; exit 1; }

data="$(date +%Y%m%d)"
pasta="$saida/osrm-$data"
mkdir -p "$pasta"
cp "$pbf" "$pasta/estado.osm.pbf"

rodar() {
  local inicio=$SECONDS
  docker run --rm -u "$(id -u):$(id -g)" -v "$pasta":/data "$IMAGEM" "$@"
  echo "  $1: $((SECONDS - inicio)) s"
}

echo "Preparando o OSRM em $pasta (imagem $IMAGEM)"
rodar osrm-extract -p /opt/car.lua /data/estado.osm.pbf
rodar osrm-partition /data/estado.osrm
rodar osrm-customize /data/estado.osrm

# O .pbf não vai para a VPS: o osrm-routed só lê os .osrm*
rm "$pasta/estado.osm.pbf"
tar -czf "$saida/osrm-$data.tgz" -C "$pasta" .
echo
du -sh "$pasta" "$saida/osrm-$data.tgz"
echo "Pronto. Na VPS, extraia o .tgz no volume do serviço OSRM (docs/geo_atualizacao.md)."

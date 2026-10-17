# Geolocalização: preparar e atualizar os dados (passo a passo)

> Para o Ale pedir de novo daqui a meses. Decisões em `plano_geolocalizacao.md`; medições em `geo_g0_relatorio.md`.
> **Regra:** o preparo pesado (importar o Nominatim, recortar o mapa, indexar o CNEFE) roda **no seu ambiente (WSL ou outra máquina com Docker), nunca na VPS**. Na VPS e no Garage só sobem os arquivos prontos. A VPS tem 4 CPUs ARM já perto de 50%.

## Resumo: o que tem de dado e com que frequência atualizar

| Dado | Onde fica | De onde vem | Quando atualizar |
|---|---|---|---|
| **CNEFE 2022** (endereços com coordenada) | Postgres, schema `referencia_geo` (**dentro do backup** do Coolify) | IBGE, Censo 2022 | Só no próximo Censo, ou se o schema estiver vazio (seção 1). **A restauração do backup já o traz** |
| **Nominatim** (ruas e portas do OpenStreetMap, só o ES) | serviço no Coolify (1,5 GiB de RAM no máximo) | Geofabrik + recorte do ES | A cada 6 a 12 meses, ou quando o OSM do ES melhorar muito (seção 2) |
| **Mapa (PMTiles do ES)** | Garage (bucket privado, lido pela API com `Range`) | Protomaps | A cada 6 a 12 meses (seção 3) |
| Microrregiões e centro dos municípios | Postgres (seed) | IBGE | Só se o IBGE criar município (`node packages/db/seeds/gerar-dados.mjs municipios microrregioes`) |

## 1. CNEFE (no Postgres)

**Quando:** na primeira vez, quando sair um novo Censo, ou se o schema estiver vazio por qualquer motivo. O CNEFE fica **dentro do backup** do Coolify (decisão do Ale, 16/10/2026): o `pg_dumpall` o leva junto, então **uma restauração já o traz e não precisa recarregar**. Sem o CNEFE o sistema continua funcionando, mas a geocodificação perde a melhor camada (só o Nominatim e o CEP respondem).

> **Em produção, só com o "pode carregar" do Ale e fora do horário de uso**: a carga pesa no banco e na CPU. Na primeira carga, **meça e registre** (no relatório do módulo): tamanho do schema (`SELECT pg_size_pretty(sum(pg_total_relation_size(c.oid))) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'referencia_geo' AND c.relkind IN ('r','i')`), tamanho do dump compactado do Coolify **antes e depois** (R2, pasta do `runbook_backup.md`) e o tempo estimado de restauração. **Se o dump compactado crescer mais de 150 MB, pare e avise o Ale** para reavaliar (banco separado sem backup).

1. Baixe o CSV do estado (ES = 32), ~42 MB zipado:
   ```bash
   curl -O https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF/32_ES.zip
   ```
   Outro estado: troque o número (código da UF). Pode carregar vários de uma vez (a carga **substitui tudo**).
2. No repositório (`~/projetos/leadtogo`), compile o pacote compartilhado uma vez e rode a carga com a URL do **owner** do banco (a mesma `DATABASE_MIGRATION_URL` do Coolify, guardada na variável `URL_DO_OWNER` do seu terminal; **nunca** a do app):
   ```bash
   pnpm --filter @leadtogo/shared build
   DATABASE_MIGRATION_URL="$URL_DO_OWNER" \
     node scripts/geo/carregar-cnefe.mjs 32_ES.zip
   ```
   Para a VPS, abra um túnel SSH para a porta do Postgres (o banco não tem porta pública) e aponte o `HOST` para ele. A carga do ES leva alguns minutos e usa uma transação: ou carrega tudo ou nada, e quem consulta nunca vê a tabela pela metade.
3. Confira: o script termina com `N endereços, M ruas, K municípios` (ES: ~2,22 milhões de endereços, 78 municípios). Na tela Configurações → Geolocalização o aviso "CNEFE não carregado" some.

## 2. Nominatim (serviço novo no Coolify)

**Preparar no seu ambiente** (WSL com Docker; ~10 min e ~4 GiB de RAM no pico, medidos no G0):

```bash
# 1) PBF do ES: baixe o Sudeste (Geofabrik) e recorte com o polígono do ES (IBGE)
curl -L -o sudeste-latest.osm.pbf https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf
curl -o es-poligono.geojson 'https://servicodados.ibge.gov.br/api/v3/malhas/estados/32?formato=application/vnd.geo+json&qualidade=maxima'
docker run --rm -v "$PWD":/dados ubuntu:24.04 bash -c "apt-get update -qq && apt-get install -y -qq osmium-tool && osmium extract -p /dados/es-poligono.geojson --strategy=smart /dados/sudeste-latest.osm.pbf -o /dados/es.osm.pbf -O"

# 2) Importar (estilo address, sem Wikipedia) e esperar o serviço ficar de pé
docker run -d --name nominatim-es --shm-size=1g -e PBF_PATH=/nominatim/data.osm.pbf -e IMPORT_STYLE=address \
  -e THREADS=8 -e NOMINATIM_PASSWORD=SENHA -e IMPORT_WIKIPEDIA=false \
  -v "$PWD/es.osm.pbf":/nominatim/data.osm.pbf -v nominatim-es-pg:/var/lib/postgresql/16/main -p 8088:8080 mediagis/nominatim:4.5

# 3) Encolher: sem atualização incremental o banco cai de 3,7 GB para ~0,3 GB
docker exec nominatim-es nominatim freeze
docker exec -u postgres nominatim-es psql -d nominatim -c 'VACUUM FULL'
```

Depois, compacte o volume `nominatim-es-pg` (`docker run --rm -v nominatim-es-pg:/v -v "$PWD":/o ubuntu tar czf /o/nominatim-es-pg.tgz -C /v .`, ~430 MB) e suba para a VPS (scp). O passo a passo do serviço no Coolify (imagem `mediagis/nominatim:4.5`, volume, limite de **1,5 GiB** de memória, variável `NOMINATIM_URL` na API e no worker) está em `runbook_e13.md`, seção "Geolocalização".

## 3. Mapa (PMTiles do ES)

```bash
# Extrai só a caixa do ES do build diário do Protomaps (não baixa o planeta): ~1 min, ~227 MB até o zoom 14
docker run --rm -v "$PWD":/dados ghcr.io/protomaps/go-pmtiles extract https://build.protomaps.com/AAAAMMDD.pmtiles /dados/es.pmtiles --bbox=-41.9,-21.35,-39.6,-17.85 --maxzoom=14
```

Troque `AAAAMMDD` por uma data recente (https://maps.protomaps.com/builds/). Suba `es.pmtiles` para o Garage (bucket `leadtogo-arquivos`, chave `mapa/es.pmtiles`, privado). Outro estado: ajuste a caixa (`--bbox=oeste,sul,leste,norte`).

## 4. Depois de qualquer atualização

- CNEFE novo: nada a reiniciar. Empresas já geocodificadas não mudam sozinhas; para refazer, use um **lote** com "refazer as que já têm coordenada" (Configurações → Geolocalização).
- Nominatim novo: reinicie o serviço no Coolify; o cache de consultas (`geo_consultas`, 90 dias) pode devolver respostas antigas: ajuste `GEO_CACHE_DIAS=0` por um dia se quiser ignorá-lo.

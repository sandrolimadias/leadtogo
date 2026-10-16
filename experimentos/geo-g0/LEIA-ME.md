# G0: teste de qualidade da geocodificação e de consumo (Geolocalização e rotas)

Experimento descartável. **Nada daqui vai para produção**: sem migração, sem serviço novo no Coolify. O relatório é `docs/geo_g0_relatorio.md`.

- `scripts/`: Python (só biblioteca padrão), numerados na ordem em que rodam.
  1. `01_municipios.py` municípios do ES, microrregião e população (IBGE).
  2. `02_cnes.py` estabelecimentos do CNES (OpenDataSUS) e malha e centroide de cada município.
  3. `03_gabarito.py` monta o gabarito (51 endereços) filtrando coordenada suspeita. `09_mapa.py` gera `gabarito/mapa.html`.
  4. `04_cep.py` completa pelo CEP (ViaCEP e BrasilAPI).
  5. `05_publicos.py` e `05b_publicos_es.py` Nominatim e Photon públicos (1 req/s, User-Agent identificado, cache em disco).
  6. `06_cnefe_indice.py` e `07_cnefe_rodar.py` índice SQLite do CNEFE 2022 do ES e a busca.
  7. `10_locais.py` Nominatim e Photon locais (só ES).
  8. `08_avaliar.py`, `11_combinacoes.py` e `12_tabelas.py` métricas, ordem das camadas e tabelas.
- `gabarito/`: o gabarito (`gabarito.json` e `.csv`), o mapa para conferir (`mapa.html`) e os 10 pontos a conferir (`conferir.json`).
- `resultados/`: métricas geradas (JSON e tabelas).
- `vps-conferir.sh`: comando de leitura para rodar na VPS.
- `dados/` e `tmp/` (fora do git): arquivos públicos baixados, caches, índices e saídas pesadas.

## Como refazer (WSL ou Linux com Docker)

```
python3 scripts/01_municipios.py && python3 scripts/02_cnes.py && python3 scripts/03_gabarito.py && python3 scripts/04_cep.py
# CNEFE do ES e extrato do sudeste (Geofabrik)
curl -o dados/32_ES.zip https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF/32_ES.zip && unzip -d dados dados/32_ES.zip
curl -L -o dados/sudeste-latest.osm.pbf https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf
python3 scripts/06_cnefe_indice.py && python3 scripts/07_cnefe_rodar.py
# recorte do ES com osmium (polígono do IBGE: https://servicodados.ibge.gov.br/api/v3/malhas/estados/32?formato=application/vnd.geo+json&qualidade=maxima)
docker run --rm -v "$PWD/dados":/dados ubuntu:24.04 bash -c "apt-get update -qq && apt-get install -y -qq osmium-tool && osmium extract -p /dados/es-poligono.geojson --strategy=smart /dados/sudeste-latest.osm.pbf -o /dados/es.osm.pbf -O"
# Nominatim local (4.5, estilo address)  e Photon 1.3.0 a partir dele
docker run -d --name nom-g0 --shm-size=1g -e PBF_PATH=/nominatim/data.osm.pbf -e IMPORT_STYLE=address -e THREADS=8 -e NOMINATIM_PASSWORD=g0teste -e IMPORT_WIKIPEDIA=false -v "$PWD/dados/es.osm.pbf":/nominatim/data.osm.pbf -v nom-g0-pg:/var/lib/postgresql/16/main -p 8088:8080 mediagis/nominatim:4.5
docker run --rm --network container:nom-g0 -v "$PWD/dados/photon":/p -v photon-g0:/data eclipse-temurin:21-jre java -Xmx3g -jar /p/photon.jar import -j 6 -data-dir /data -password g0teste -host localhost -database nominatim -user nominatim -languages pt,en
docker run -d --name ph-g0 -v "$PWD/dados/photon":/p -v photon-g0:/data -p 2322:2322 eclipse-temurin:21-jre java -Xmx2g -jar /p/photon.jar serve -data-dir /data -listen-ip 0.0.0.0
python3 scripts/10_locais.py nominatim http://localhost:8088 && python3 scripts/10_locais.py photon http://localhost:2322
python3 scripts/05b_publicos_es.py   # lento: 1 req/s
python3 scripts/08_avaliar.py nominatim_local=resultados_nominatim_local.json photon_local=resultados_photon_local.json && python3 scripts/11_combinacoes.py && python3 scripts/12_tabelas.py
# OSRM (car, MLD) e VROOM
docker run --rm -v "$PWD/tmp/osrm":/data ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/es.osm.pbf   # depois osrm-partition e osrm-customize
docker run -d --name osrm-g0 --network g0net -v "$PWD/tmp/osrm":/data ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld --max-table-size 500 /data/es.osrm
# PMTiles do ES (Protomaps): extrai só a caixa do ES do build diário
docker run --rm -v "$PWD/dados":/dados ghcr.io/protomaps/go-pmtiles extract https://build.protomaps.com/AAAAMMDD.pmtiles /dados/es.pmtiles --bbox=-41.9,-21.35,-39.6,-17.85 --maxzoom=14
```

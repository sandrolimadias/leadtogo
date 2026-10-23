# Rotas em produção: OSRM e VROOM na VPS (passo a passo do Ale)

> Feito **no seu WSL e no terminal do servidor no Coolify** (sem SSH, sem túnel), como a carga do CNEFE (`roteiro_carga_geo_producao.md`): o WSL prepara e sobe para o Garage; o servidor baixa por **link pré-assinado + `curl`**. Pode ser em horário de uso: nada aqui mexe no banco.
> **Terminal do Coolify:** cole **uma linha por vez**. O `read -rp` engole a linha seguinte quando se cola um bloco; por isso as variáveis vão direto (`D=AAAAMMDD`).
> **Medição do passo 10.0 (23/10/2026, na VPS ARM):** 30 paradas, pior caso **0,11 s**; memória: OSRM **286 MiB de 512**, VROOM **50 MiB de 256**. A otimização responde na própria requisição (não precisa do worker).

**Situação:** a pilha subiu e foi medida (parte A) e a otimização foi **ligada em produção pelo Ale (parte B), funcionando** (23/10/2026). As duas partes ficam como registro e para reinstalar.

---

## Parte B. Ligar as rotas no app (depois do deploy do G4)

Sem `VROOM_URL` e `OSRM_URL` na API, a tela Rotas funciona para montar e ordenar à mão, com o aviso **"Otimização de rotas ainda não configurada"** e as distâncias estimadas em linha reta.

### B.1. Rede: qual opção escolher no Coolify

- **Escolha:** na pilha `leadtogo-rotas`, **Advanced → Connect to Predefined Network: LIGADO**. Sem isso a pilha fica numa rede só dela e a API não a enxerga. É o que a documentação do Coolify manda para "alcançar recursos de outra pilha".
- **O que muda com a opção ligada:** o Coolify dá a cada container o nome `<serviço>-<uuid da pilha>` (ex.: `leadtogo-vroom-k8s0w4…`), e a documentação avisa que o DNS interno pode "se comportar de forma inesperada" na rede compartilhada. Por isso:
  - **Dentro da pilha** (VROOM → OSRM), o nome do serviço continua valendo: as duas ficam também na rede própria da pilha. Os serviços passaram a se chamar **`leadtogo-osrm`** e **`leadtogo-vroom`** (antes `osrm` e `vroom`), para o nome não colidir com o de outra pilha na rede compartilhada. O `vroom-config.yml` aponta para `leadtogo-osrm`.
  - **Da API para a pilha**, use o **nome completo do container** (com o uuid), que é o que o Coolify garante na rede compartilhada.

### B.2. Atualizar a pilha com os nomes novos

1. No Coolify, em `leadtogo-rotas`, troque o compose pelo conteúdo atual de `scripts/geo/rotas-compose.yml` (só mudaram os nomes dos serviços) e salve.
2. **Advanced → Connect to Predefined Network**: ligado.
3. No **terminal do servidor**, ajuste a configuração do VROOM (uma linha):

```bash
sed -i "s/host: 'osrm'/host: 'leadtogo-osrm'/" /data/leadtogo/vroom/config.yml && grep -n "host:" /data/leadtogo/vroom/config.yml
```

Esperado: `host: 'leadtogo-osrm'`.

4. **Deploy** da pilha. Em ~1 min o `leadtogo-vroom` fica **healthy**.

### B.3. Anotar os nomes e conferir a pilha (terminal do servidor, uma linha por vez)

```bash
docker ps --format '{{.Names}}  {{.Status}}' | grep -E 'leadtogo-(osrm|vroom)'
```

Anote os dois nomes completos (ex.: `leadtogo-osrm-k8s0w4…` e `leadtogo-vroom-k8s0w4…`). Confira que o VROOM ainda acha o OSRM (troque `<VROOM>` pelo nome completo):

```bash
docker exec -e OSRM_URL=http://leadtogo-osrm:5000 <VROOM> node /conf/medir-vroom.mjs
```

Esperado: a linha final `OK: 30 paradas abaixo de 10 s`. (Se o `medir-vroom.mjs` não estiver mais em `/data/leadtogo/vroom`, pule: o passo B.5 confere pelo app.)

### B.4. Variáveis na API

No recurso **`leadtogo-api`** → *Environment Variables* (o worker não usa):

```
VROOM_URL=http://<nome completo do container leadtogo-vroom>:3000
OSRM_URL=http://<nome completo do container leadtogo-osrm>:5000
```

Opcionais (já têm padrão): `ROTA_MAX_PARADAS=30`, `ROTA_TEMPO_LIMITE_S=10`. Salve e **reimplante a API**.

> Se a API não resolver o nome (o aviso continua e o log da API mostra `ENOTFOUND`), confira que a pilha está com *Connect to Predefined Network* ligado e reimplantada. O nome curto (`http://leadtogo-vroom:3000`) costuma funcionar também, mas o nome completo é o garantido.
> O uuid do nome **não muda** em reimplantações; só muda se a pilha for apagada e criada de novo (aí, troque as duas variáveis).

### B.5. Conferir no app

1. **Rotas → Nova rota**: o aviso "Otimização de rotas ainda não configurada" **não** aparece.
2. Monte uma rota com 5 empresas, toque em **Otimizar ordem**: a ordem muda, e os totais mostram km e tempo **pelas ruas** (sem o selo "estimativa em linha reta"). Salve: o mapa desenha o trajeto pelas ruas.
3. Se aparecer **"Serviço de rotas indisponível: ordem estimada em linha reta"**, a API não alcançou o VROOM: confira os nomes e a rede (B.1 a B.4) e devolva o trecho do log da API.

---

## Parte A. Primeira subida e medição (feita em 23/10/2026; registro e reinstalação)

### No WSL

**A.0. O recorte do ES** (`~/geo-g0-dados/es.osm.pbf`). Se o arquivo não existir (outra máquina, pasta apagada), gere-o (~2 min, ~4 GiB de RAM no pico; o mesmo recorte do Nominatim, `geo_atualizacao.md`, seção 2):

```bash
mkdir -p ~/geo-g0-dados && cd ~/geo-g0-dados
curl -L -o sudeste-latest.osm.pbf https://download.geofabrik.de/south-america/brazil/sudeste-latest.osm.pbf
curl -o es-poligono.geojson 'https://servicodados.ibge.gov.br/api/v3/malhas/estados/32?formato=application/vnd.geo+json&qualidade=maxima'
docker run --rm -v "$PWD":/dados ubuntu:24.04 bash -c "apt-get update -qq && apt-get install -y -qq osmium-tool && osmium extract -p /dados/es-poligono.geojson --strategy=smart /dados/sudeste-latest.osm.pbf -o /dados/es.osm.pbf -O"
ls -lh es.osm.pbf                            # ~180 MB
```

**A.1. Preparar o OSRM** (~1 min):

```bash
cd ~/projetos/leadtogo && git pull
mkdir -p ~/geo
scripts/geo/preparar-osrm.sh ~/geo-g0-dados/es.osm.pbf ~/geo
```

Na tela: os tempos de `osrm-extract`, `osrm-partition` e `osrm-customize`, e no fim `~355M .../osrm-AAAAMMDD` e `~128M .../osrm-AAAAMMDD.tgz`. Anote a data do nome.

**A.2. Subir os três arquivos para o Garage** (chaves temporárias em `temporaria/`; mesmo `read -s` e a mesma função `s3` do passo a.2 do `roteiro_carga_geo_producao.md`; no WSL o `read` funciona, só o terminal do Coolify tem o problema). Troque `AAAAMMDD` pela data:

```bash
cd ~/geo
D=AAAAMMDD
cp ~/projetos/leadtogo/scripts/geo/vroom-config.yml ~/projetos/leadtogo/scripts/geo/medir-vroom.mjs .
sha256sum osrm-$D.tgz
s3 s3 cp /d/osrm-$D.tgz s3://leadtogo-arquivos/temporaria/osrm-$D.tgz
s3 s3 cp /d/vroom-config.yml s3://leadtogo-arquivos/temporaria/vroom-config.yml
s3 s3 cp /d/medir-vroom.mjs s3://leadtogo-arquivos/temporaria/medir-vroom.mjs
for f in osrm-$D.tgz vroom-config.yml medir-vroom.mjs; do s3 s3 presign s3://leadtogo-arquivos/temporaria/$f --expires-in 900; echo; done
```

Na tela: o hash e três URLs longas, na ordem: pacote, configuração e script (valem 15 min).

### No terminal do servidor (Coolify → Servers → seu servidor → Terminal), uma linha por vez

**A.3. Baixar e extrair** (troque `AAAAMMDD` e cole cada URL **entre aspas simples**):

```bash
uptime
D=AAAAMMDD
mkdir -p /data/leadtogo/osrm/osrm-$D /data/leadtogo/vroom
cd /data/leadtogo/osrm
curl -fsS -o osrm-$D.tgz '<URL DO PACOTE>'
sha256sum osrm-$D.tgz
tar -xzf osrm-$D.tgz -C osrm-$D && rm osrm-$D.tgz
ln -sfn /data/leadtogo/osrm/osrm-$D /data/leadtogo/osrm/atual
du -sh atual/
curl -fsS -o /data/leadtogo/vroom/config.yml '<URL DA CONFIGURAÇÃO>'
curl -fsS -o /data/leadtogo/vroom/medir-vroom.mjs '<URL DO SCRIPT>'
grep -n "host:" /data/leadtogo/vroom/config.yml
```

Esperado: o mesmo hash do WSL, `~355M atual/` e `host: 'leadtogo-osrm'`.

**A.4. Criar a pilha no Coolify:** *Projects → (projeto do Leadtogo) → + New → Docker Compose Empty*, nome **`leadtogo-rotas`**; cole `scripts/geo/rotas-compose.yml`; **sem domínio** nos dois serviços; **Advanced → Connect to Predefined Network: ligado** (B.1); **Deploy**.

**A.5. Medir:**

```bash
docker ps --format '{{.Names}}  {{.Status}}' | grep -E 'leadtogo-(osrm|vroom)'
V=$(docker ps --format '{{.Names}}' | grep leadtogo-vroom | head -1)
docker exec -e OSRM_URL=http://leadtogo-osrm:5000 "$V" node /conf/medir-vroom.mjs
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' | grep -E 'leadtogo-(osrm|vroom)'
uptime
```

Se aparecer `fetch failed` logo depois do deploy, espere 30 s e repita (o vroom-express demora a subir).

**A.6. Limpar o Garage** (no WSL, com o `s3` e o `D` carregados):

```bash
for f in osrm-$D.tgz vroom-config.yml medir-vroom.mjs; do s3 s3 rm s3://leadtogo-arquivos/temporaria/$f; done
```

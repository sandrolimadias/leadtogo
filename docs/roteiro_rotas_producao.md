# Rotas em produção: OSRM e VROOM na VPS e medição em ARM (passo a passo do Ale)

> Passo 10.0 do G4 (`plano_geolocalizacao.md`, seção 10.0). Feito **no seu WSL e no terminal do servidor no Coolify** (sem SSH, sem túnel), como a carga do CNEFE (`roteiro_carga_geo_producao.md`): o WSL prepara e sobe para o Garage; o servidor baixa por **link pré-assinado + `curl`**. Pode ser em horário de uso: nada aqui mexe no app, no banco nem nos deploys.
> **Por que medir:** no WSL (x86, 12 CPUs) 30 paradas otimizam em **0,05 s** e o OSRM fica em **~280 MiB** (23/10/2026). A VPS é ARM com 4 CPUs já perto de 50%: se 30 paradas passarem de **10 s** lá, a otimização vai para o worker.

## No WSL

**1. Preparar o OSRM** (~1 min no WSL; usa o mesmo recorte do ES do Nominatim, de 16/10/2026):

```bash
cd ~/projetos/leadtogo && git pull
mkdir -p ~/geo
scripts/geo/preparar-osrm.sh ~/geo-g0-dados/es.osm.pbf ~/geo
```

Na tela: os tempos de `osrm-extract`, `osrm-partition` e `osrm-customize`, e no fim `~355M .../osrm-AAAAMMDD` e `~128M .../osrm-AAAAMMDD.tgz`. Anote a data (`AAAAMMDD`) do nome.

**2. Subir os três arquivos para o Garage** (chaves temporárias em `temporaria/`; mesmo `read -s` e a mesma função `s3` do passo a.2 do `roteiro_carga_geo_producao.md`):

```bash
cd ~/geo
read -rp 'Data do pacote (AAAAMMDD): ' D
cp ~/projetos/leadtogo/scripts/geo/vroom-config.yml ~/projetos/leadtogo/scripts/geo/medir-vroom.mjs .
sha256sum osrm-$D.tgz                       # anote: será comparado no servidor
s3 s3 cp /d/osrm-$D.tgz s3://leadtogo-arquivos/temporaria/osrm-$D.tgz
s3 s3 cp /d/vroom-config.yml s3://leadtogo-arquivos/temporaria/vroom-config.yml
s3 s3 cp /d/medir-vroom.mjs s3://leadtogo-arquivos/temporaria/medir-vroom.mjs
# links de 15 min para o servidor baixar (gere pouco antes do passo 3)
for f in osrm-$D.tgz vroom-config.yml medir-vroom.mjs; do s3 s3 presign s3://leadtogo-arquivos/temporaria/$f --expires-in 900; echo; done
```

Na tela: três URLs longas (`https://files.crm.aledias.com.br/leadtogo-arquivos/temporaria/...?X-Amz-...`), na ordem: pacote, configuração e script.

## No terminal do servidor (Coolify → Servers → seu servidor → Terminal)

**3. Baixar e extrair** (cole cada URL **entre aspas simples**):

```bash
uptime                                       # anote a carga antes
read -rp 'Data do pacote (AAAAMMDD): ' D
mkdir -p /data/leadtogo/osrm/osrm-$D /data/leadtogo/vroom
cd /data/leadtogo/osrm
curl -fsS -o osrm-$D.tgz '<URL DO PACOTE>'
sha256sum osrm-$D.tgz                        # igual ao do WSL
tar -xzf osrm-$D.tgz -C osrm-$D && rm osrm-$D.tgz
ln -sfn /data/leadtogo/osrm/osrm-$D /data/leadtogo/osrm/atual
ls -lh atual/ | head -5; du -sh atual/       # esperado: ~355M
curl -fsS -o /data/leadtogo/vroom/config.yml '<URL DA CONFIGURAÇÃO>'
curl -fsS -o /data/leadtogo/vroom/medir-vroom.mjs '<URL DO SCRIPT>'
grep -n "host:" /data/leadtogo/vroom/config.yml   # esperado: host: 'osrm'
```

**4. Criar a pilha no Coolify:**
1. **Projects → (o projeto do Leadtogo) → + New → Docker Compose Empty**, nome **`leadtogo-rotas`**.
2. Cole o conteúdo de `scripts/geo/rotas-compose.yml` (o arquivo do repositório, igual) e salve.
3. **Sem domínio** nos dois serviços (osrm e vroom): deixe o campo de domínio vazio. Nada fica exposto na internet.
4. **Advanced → Connect to Predefined Network**: ligado (como nos demais recursos, para a API e o worker enxergarem o VROOM depois).
5. **Deploy**. Em ~1 min o `vroom` fica **healthy** (o `osrm` não tem healthcheck: a imagem não traz `curl`).

**5. Medir** (terminal do servidor):

```bash
docker ps --format '{{.Names}}  {{.Status}}' | grep -E 'osrm|vroom'     # anote os dois nomes
V=$(docker ps --format '{{.Names}}' | grep vroom | head -1)
docker exec -e OSRM_URL=http://osrm:5000 "$V" node /conf/medir-vroom.mjs
docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' | grep -E 'osrm|vroom'
uptime                                       # carga depois
```

Na tela: duas tabelas (Grande Vitória e Misto) com 10, 20 e 30 paradas, o tempo do VROOM (mediana e pior), km e minutos dirigindo, a matriz e o trajeto do OSRM, e no fim **`OK: 30 paradas abaixo de 10 s`** ou **`ATENÇÃO: ...`**. Se aparecer `fetch failed` logo depois do deploy, espere 30 s e repita (o vroom-express demora a subir).

**6. Limpar o Garage** (no WSL, com o `s3` carregado):

```bash
for f in osrm-$D.tgz vroom-config.yml medir-vroom.mjs; do s3 s3 rm s3://leadtogo-arquivos/temporaria/$f; done
```

## Devolva

1. A saída inteira do passo 5 (as duas tabelas e a linha final).
2. Os dois nomes dos containers e o `docker stats` (CPU e memória).
3. O `uptime` antes e depois.
4. Se algo falhou: a mensagem e o passo. Se o `osrm` reiniciar em ciclo, devolva `docker logs --tail 30 <nome do osrm>` (o mais provável é a pasta `atual` vazia ou de outra versão).

**Ainda não:** as variáveis `VROOM_URL` e `OSRM_URL` na API e no worker entram junto com o código das rotas (G4a, passo e); até lá a pilha só fica de pé, sem ninguém chamando.

# Carga da geolocalização em produção: PMTiles e CNEFE (passo a passo do Ale)

> Feito **no seu WSL**, **fora do horário de uso**, nesta ordem: (a) PMTiles no Garage, (b) CNEFE no Postgres. O Nominatim fica para depois do seu teste. Detalhes e motivos: `geo_atualizacao.md`.
> Variáveis de exemplo: `<VPS>` = o endereço SSH da VPS; `<DATA>` = data recente do build do Protomaps (https://maps.protomaps.com/builds/, formato `AAAAMMDD`).

## Antes de tudo

1. O deploy dos três ajustes (atribuição do mapa) está no ar: `curl -s https://api.crm.aledias.com.br/health` com a versão do último commit.
2. Foi feito um backup recente do banco no Coolify (Backups → "Backup Now") **antes** da carga, para medir o "antes" (passo b.1).

---

## (a) PMTiles no Garage

**a.1. Extrair o mapa do ES** (~1 min, ~227 MB):

```bash
mkdir -p ~/geo && cd ~/geo
docker run --rm -v "$PWD":/dados ghcr.io/protomaps/go-pmtiles extract \
  https://build.protomaps.com/<DATA>.pmtiles /dados/es.pmtiles \
  --bbox=-41.9,-21.35,-39.6,-17.85 --maxzoom=14
ls -lh es.pmtiles        # esperado: ~227 MB
```

**a.2. Subir para o Garage** (bucket privado `leadtogo-arquivos`, chave `mapa/es.pmtiles`). Use a chave `leadtogo-app` (gerenciador de senhas; ou `/garage key info leadtogo-app --show-secret` no container `leadtogo-files`):

```bash
export AWS_ACCESS_KEY_ID='GK...'        # leadtogo-app
export AWS_SECRET_ACCESS_KEY='...'
export AWS_DEFAULT_REGION=garage
docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
  -v "$PWD":/d amazon/aws-cli --endpoint-url https://files.crm.aledias.com.br \
  s3 cp /d/es.pmtiles s3://leadtogo-arquivos/mapa/es.pmtiles
```

**a.3. Conferir:**

```bash
docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION amazon/aws-cli \
  --endpoint-url https://files.crm.aledias.com.br s3api head-object \
  --bucket leadtogo-arquivos --key mapa/es.pmtiles      # ContentLength = tamanho do arquivo local
stat -c %s es.pmtiles
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
```

No app: abra **Mapa**. O fundo com ruas aparece (sem o aviso "O mapa base ainda não foi instalado") e o canto inferior direito mostra **© OpenStreetMap contributors** sempre visível. Dê zoom numa cidade e arraste: se travar ou falhar, **devolva** a mensagem do console do navegador (F12) e o resultado de `docker stats` do container `leadtogo-files` (limite de 512 MiB).

**Devolva:** tamanho do arquivo, se o mapa abriu, e a sensação de velocidade ao arrastar (o G1 deixou "Garage com 512 MiB lendo por faixas" para verificar).

---

## (b) CNEFE no Postgres (schema `referencia_geo`)

**Pare e avise se o dump compactado crescer mais de 150 MB.**

**b.1. Medir o "antes"** (tamanho do último dump no R2, na VPS como `root`):

```bash
docker run --rm --env-file /root/backup-garage.env rclone/rclone:latest lsl r2:vps-backup/data \
  | grep orq8miun4hoaqnvwbntlxzwt | sort -k2,3 | tail -n 2
```

Anote o **tamanho em bytes** da linha mais recente (o backup "Backup Now" de antes de começar).

**b.2. Baixar o CSV** (no WSL, ~42 MB):

```bash
cd ~/geo
curl -O https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF/32_ES.zip
ls -lh 32_ES.zip
```

**b.3. Túnel SSH até o Postgres** (o banco não tem porta pública). Em um terminal, na VPS, descubra o IP do container e abra o túnel:

```bash
# na VPS:
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' \
  $(docker ps --format '{{.Names}}' | grep orq8miun4hoaqnvwbntlxzwt)
# no WSL, em outro terminal que fica aberto (troque <IP> pelo primeiro número):
ssh -N -L 5433:<IP>:5432 root@<VPS>
```

**b.4. Carregar** (no repositório; use a URL do **owner** com o host trocado por `localhost:5433`; nunca a do app):

```bash
cd ~/projetos/leadtogo && git pull
pnpm install --frozen-lockfile && pnpm --filter @leadtogo/shared build
# monte a URL do owner (a mesma DATABASE_MIGRATION_URL do Coolify) trocando só o host e a porta por localhost:5433
export URL_DO_OWNER='<DATABASE_MIGRATION_URL do Coolify, com host localhost e porta 5433>'
time DATABASE_MIGRATION_URL="$URL_DO_OWNER" node scripts/geo/carregar-cnefe.mjs ~/geo/32_ES.zip
```

A saída termina com `N endereços, M ruas, K municípios`. **Esperado:** ~2,22 milhões de endereços e 78 municípios. Anote o `real` do `time`. A carga é uma transação: se falhar, nada muda.

**b.5. Conferir:**

```bash
psql "$URL_DO_OWNER" -c "SELECT pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS tamanho_do_schema
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'referencia_geo' AND c.relkind IN ('r','i')"
psql "$URL_DO_OWNER" -c "SELECT count(*) FROM referencia_geo.cnefe_enderecos"
unset URL_DO_OWNER
```

No app: Configurações → Geolocalização, o aviso "CNEFE não carregado" some.

**b.6. Medir o "depois"** (Coolify → banco → Backups → "Backup Now", e repita o comando do b.1). Depois, o **tempo de restauração**: refaça o teste descartável de `runbook_backup.md` (seção 2) com o dump novo e anote o tempo com `time` na linha `gunzip | psql`. Faça fora do horário (a VPS está perto de 50% de CPU).

**Desfazer, se precisar** (esvazia o CNEFE; as empresas já geocodificadas não mudam):

```bash
psql "$URL_DO_OWNER" -c "TRUNCATE referencia_geo.cnefe_enderecos, referencia_geo.cnefe_logradouros RESTART IDENTITY"
```

---

## O que devolver para o Claude registrar no relatório

| Medida | Onde pegar |
|---|---|
| Tamanho do `es.pmtiles` e velocidade do mapa | a.1, a.3 |
| Tempo da carga do CNEFE (`real`) e a linha final `N endereços, M ruas, K municípios` | b.4 |
| Tamanho do schema `referencia_geo` | b.5 |
| Dump compactado **antes** e **depois** (bytes) e a diferença (limite: +150 MB) | b.1, b.6 |
| Tempo de restauração do dump novo | b.6 |
| Qualquer erro, com a mensagem completa | todos |

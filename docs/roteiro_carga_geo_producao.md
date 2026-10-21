# Carga da geolocalização em produção: PMTiles e CNEFE (passo a passo do Ale)

> Feito **no seu WSL e no terminal do servidor no Coolify** (sem SSH, sem túnel), **fora do horário de uso**, nesta ordem: (a) PMTiles no Garage, (b) CNEFE no Postgres. O Nominatim fica para depois do seu teste. Detalhes e motivos: `geo_atualizacao.md`.
> **O aws-cli NÃO funciona no terminal do servidor** (atrás do Traefik, `GetObject` e `DeleteObject` respondem `InvalidRequest: signed header content-length is not present`; ver "Nota sobre o aws-cli" no fim). O Garage é usado só pelo WSL (upload, presign e exclusão); o servidor só baixa por **link pré-assinado + `curl`**. Validado na carga de 18/10/2026.
> Variáveis de exemplo: `<DATA>` = data recente do build do Protomaps (https://maps.protomaps.com/builds/, formato `AAAAMMDD`).

## Antes de tudo

1. O deploy dos três ajustes (atribuição do mapa) está no ar: `curl -s https://api.crm.aledias.com.br/health` com a versão do último commit.
2. Terminal do **servidor** no Coolify: *Servers → (seu servidor) → Terminal*. É o terminal da máquina, **não** o terminal de dentro de um recurso (esse não tem `docker`). Rode `whoami`: o Coolify conecta como o usuário configurado no servidor, normalmente `root` (é o mesmo `root` do `runbook_backup.md`). Se `docker ps` responder `permission denied`, coloque `sudo` na frente de cada `docker` abaixo.

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

> **Atualização (21/10/2026):** o mapa base passou para o **bucket público** `leadtogo-mapa`, lido direto pelo navegador (a API travou com o tráfego de faixas). O upload novo, versionado, está em `roteiro_mapa_publico.md`. O passo abaixo (bucket privado) é o caminho transitório e vale só até esse roteiro ser concluído.

**a.2. Subir para o Garage** (bucket privado `leadtogo-arquivos`, chave `mapa/es.pmtiles`). Use a chave `leadtogo-app` (gerenciador de senhas; ou `/garage key info leadtogo-app --show-secret` no container `leadtogo-files`). As chaves entram por `read -s`: não aparecem na tela nem no histórico.

```bash
read -rsp 'AWS_ACCESS_KEY_ID (leadtogo-app): ' AWS_ACCESS_KEY_ID; echo
read -rsp 'AWS_SECRET_ACCESS_KEY: ' AWS_SECRET_ACCESS_KEY; echo
export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=garage
# atalho para o aws-cli (as chaves vão por nome de variável, nunca por valor)
s3() { docker run --rm -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
  -v "$PWD":/d amazon/aws-cli --endpoint-url https://files.crm.aledias.com.br "$@"; }
s3 s3 cp /d/es.pmtiles s3://leadtogo-arquivos/mapa/es.pmtiles
```

Na tela: uma barra de progresso e, no fim, `upload: ../d/es.pmtiles to s3://leadtogo-arquivos/mapa/es.pmtiles`.

**a.3. Conferir** (mesmo terminal, com o `s3` e as chaves ainda carregados):

```bash
s3 s3api head-object --bucket leadtogo-arquivos --key mapa/es.pmtiles   # ContentLength = tamanho local
stat -c %s es.pmtiles
```

Na tela: um JSON com `"ContentLength": <n>` igual ao número do `stat`. Mantenha a sessão aberta para a parte (b) (ou refaça o `read -s` depois).

No app: abra **Mapa**. O fundo com ruas aparece (sem o aviso "O mapa base ainda não foi instalado") e o canto inferior direito mostra **© OpenStreetMap contributors** sempre visível. Dê zoom numa cidade e arraste: se travar ou falhar, **devolva** a mensagem do console do navegador (F12) e o resultado de `docker stats` do container `leadtogo-files` (limite de 512 MiB).

**Devolva:** tamanho do arquivo, se o mapa abriu, e a sensação de velocidade ao arrastar (o G1 deixou "Garage com 512 MiB lendo por faixas" para verificar).

---

## (b) CNEFE no Postgres (schema `referencia_geo`)

**Como funciona:** o WSL carrega o CNEFE no **Postgres local** e gera um arquivo SQL **só com dados** do schema `referencia_geo` (`pg_dump --data-only`). Esse arquivo vai para o Garage; o terminal do servidor baixa e aplica **numa única transação** (`TRUNCATE` + `COPY` + `ANALYZE`): ou tudo ou nada. Sem SSH e sem túnel.

**Sem DDL, mesma migração.** O arquivo não cria nem altera nada: só `TRUNCATE`, `COPY` (com a lista de colunas), `setval` das sequências e `ANALYZE`. Por isso a produção precisa estar **na mesma versão de migração (0026)**, o que o passo b.6 confere (27 migrações aplicadas e as colunas do schema com a mesma "impressão digital" nos dois bancos) **antes** de aplicar. O passo b.2 confere que o arquivo não tem nenhum `CREATE/ALTER/DROP/GRANT`. Nenhuma migração depois da 0026 mexe em `referencia_geo`; se uma futura mexer, gere o arquivo de novo.

**Limite:** o dump do Coolify (`pg_dumpall`) cresce quase o tamanho deste arquivo (os índices não entram no dump, só os dados). Se o arquivo gerado no b.2 passar de **150 MB**, **pare e avise** antes de subir.

### No WSL

**b.1. Baixar o CSV e carregar no Postgres local** (já com a migração 0026):

```bash
cd ~/projetos/leadtogo && git pull
pnpm dev:up                                   # sobe o Postgres local (docker/compose.dev.yml)
pnpm db:migrate                               # aplica até a 0026 no banco local
pnpm install --frozen-lockfile && pnpm --filter @leadtogo/shared build
mkdir -p ~/geo && cd ~/geo
curl -O https://ftp.ibge.gov.br/Cadastro_Nacional_de_Enderecos_para_Fins_Estatisticos/Censo_Demografico_2022/Arquivos_CNEFE/CSV/UF/32_ES.zip
ls -lh 32_ES.zip                              # ~42 MB
cd ~/projetos/leadtogo
set -a; source .env; set +a                   # DATABASE_MIGRATION_URL do banco LOCAL (localhost:5432)
echo "$DATABASE_MIGRATION_URL" | sed 's#//[^@]*@#//***@#'   # confira: tem de ser localhost, nunca a produção
time node scripts/geo/carregar-cnefe.mjs ~/geo/32_ES.zip
```

Na tela: progresso `… linhas lidas…`, `Endereços: …`, `Ruas: …` e, no fim, `Pronto em N s: ~2.22x.xxx endereços, … ruas, 78 municípios.` Anote o `real` do `time` e os três números.

**b.2. Gerar o arquivo só de dados** (uma transação: esvazia, insere, atualiza estatísticas):

```bash
cd ~/geo
PSQL="docker compose -f ~/projetos/leadtogo/docker/compose.dev.yml exec -T postgres"
{
  echo "TRUNCATE referencia_geo.cnefe_enderecos, referencia_geo.cnefe_logradouros RESTART IDENTITY;"
  $PSQL pg_dump -U postgres -d leadtogo --data-only --schema=referencia_geo --no-owner --no-privileges
  echo "ANALYZE referencia_geo.cnefe_enderecos;"
  echo "ANALYZE referencia_geo.cnefe_logradouros;"
} | gzip > cnefe-es.sql.gz

ls -l cnefe-es.sql.gz                         # tamanho em bytes; limite: 150 MB (157286400)
sha256sum cnefe-es.sql.gz                     # anote: será comparado no servidor
# conferências do conteúdo:
zcat cnefe-es.sql.gz | grep -vP '\t' | grep -Ec '^(CREATE|ALTER|DROP|GRANT|REVOKE)'   # tem de dar 0
zcat cnefe-es.sql.gz | grep -c '^COPY '                                                 # tem de dar 2
zcat cnefe-es.sql.gz | grep -c '^TRUNCATE '                                             # tem de dar 1
```

Na tela: o tamanho, o hash, e `0`, `2`, `1` nas três conferências. Se alguma diferir, **não suba**.

**b.3. Subir para o Garage pelo WSL** (chave temporária `temporaria/cnefe-es.sql.gz`, mesmo `s3` da parte a; se a sessão fechou, refaça os `read -s` e a função `s3` do passo a.2):

```bash
cd ~/geo
s3 s3 cp /d/cnefe-es.sql.gz s3://leadtogo-arquivos/temporaria/cnefe-es.sql.gz
s3 s3api head-object --bucket leadtogo-arquivos --key temporaria/cnefe-es.sql.gz   # ContentLength = ls -l
# link pré-assinado de 15 min para o servidor baixar (o servidor não tem chaves nem aws-cli)
s3 s3 presign s3://leadtogo-arquivos/temporaria/cnefe-es.sql.gz --expires-in 900
```

Na tela do `presign`: **uma URL longa** (`https://files.crm.aledias.com.br/leadtogo-arquivos/temporaria/cnefe-es.sql.gz?X-Amz-Algorithm=…&X-Amz-Signature=…`). Copie inteira; ela vale 15 min e dá leitura só desse arquivo. Gere-a pouco antes do b.7 (ou gere outra se vencer).

> O espelho do Garage para o R2 roda às **3h30**. Se o arquivo ficar lá durante a execução, uma cópia pode ficar em `garage-alterados/` por 90 dias depois que você o apagar. São dados públicos do IBGE, sem problema, mas prefira terminar antes das 3h30.

### No terminal do servidor (Coolify)

Cole os blocos nesta ordem. **Sem chaves e sem aws-cli aqui**: o download usa o link pré-assinado do b.3.

**b.4. Achar o container e o usuário (sem expor senha):**

```bash
whoami                                                    # root (se não, use sudo nos docker)
C=$(docker ps --format '{{.Names}}' | grep orq8miun4hoaqnvwbntlxzwt); echo "$C"
SU=$(docker exec "$C" printenv POSTGRES_USER); echo "$SU"
OWNER=$(docker exec "$C" psql -U "$SU" -d leadtogo -Atc "SELECT tableowner FROM pg_tables WHERE schemaname='referencia_geo' LIMIT 1"); echo "$OWNER"
```

Na tela: o nome do container (**uma** linha só, com o código `orq8miun4hoaqnvwbntlxzwt`; se vierem duas, use a que é o Postgres, a que não tem `helper`/`backup` no nome), o superusuário (provavelmente `postgres`) e o dono das tabelas (`leadtogo_owner`). Nenhuma senha é lida: dentro do container o `psql` entra pelo socket local, que na imagem padrão do Postgres é de confiança (`local all all trust`). Se o `psql -U "$OWNER"` do b.8 responder `password authentication failed`, use `-U "$SU"` no lugar: o resultado é o mesmo (a carga não muda o dono das tabelas).

**b.5. Medir o "antes"** (opcional; na carga de 18/10/2026 **não foi feito** e a medição saiu do backup noturno, ver "Medir pelo backup noturno" abaixo. O mesmo `pg_dumpall` compactado do backup do Coolify, medido em bytes; pesa na CPU, faça fora do horário):

```bash
time docker exec "$C" sh -c 'pg_dumpall -U "$POSTGRES_USER" | gzip' | wc -c
```

Na tela: um número (bytes) e o `real`. Anote como **ANTES**.

**b.6. Conferir que a produção está na mesma migração do arquivo:**

```bash
CONF="SELECT md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_identity, ',' ORDER BY table_name, ordinal_position)) FROM information_schema.columns WHERE table_schema='referencia_geo'"
docker exec "$C" psql -U "$OWNER" -d leadtogo -Atc "SELECT count(*) FROM drizzle.__drizzle_migrations"
docker exec "$C" psql -U "$OWNER" -d leadtogo -Atc "$CONF"
```

Na tela: `27` e um hash (32 caracteres). No **WSL**, rode o mesmo contra o banco local e compare:

```bash
$PSQL psql -U postgres -d leadtogo -Atc "SELECT count(*) FROM drizzle.__drizzle_migrations"
$PSQL psql -U postgres -d leadtogo -Atc "$CONF"     # (defina CONF no WSL com o mesmo texto acima)
```

`27` e o **mesmo hash** nos dois lados. Se diferir, **pare**: a produção não está na 0026 (ou o schema divergiu) e o arquivo não deve ser aplicado.

**b.7. Baixar com o link pré-assinado e conferir o hash:**

```bash
mkdir -p /root/cnefe-tmp && cd /root/cnefe-tmp
read -rsp 'URL pré-assinada (do b.3): ' URL; echo       # cole a URL inteira; não aparece na tela nem no histórico
curl -fSL --retry 3 -o cnefe-es.sql.gz "$URL"; unset URL
ls -l cnefe-es.sql.gz && sha256sum cnefe-es.sql.gz        # igual ao do WSL (b.2)
gzip -t cnefe-es.sql.gz && echo "gzip ok"
```

Na tela: a barra do `curl`, o tamanho e o hash **idênticos** aos do WSL, e `gzip ok`. Se vier `403` ou `SignatureDoesNotMatch`, o link venceu ou foi colado cortado: gere outro no WSL. Se o hash diferir, baixe de novo.

**b.8. Aplicar (uma transação, para no primeiro erro).** Em segundo plano, para a conexão do navegador não derrubar a carga; ela continua mesmo se a página fechar:

```bash
nohup bash -c 'time (gunzip -c /root/cnefe-tmp/cnefe-es.sql.gz | docker exec -i "'"$C"'" psql -U "'"$OWNER"'" -d leadtogo --single-transaction -v ON_ERROR_STOP=1); echo "FIM: código $?"' > /root/cnefe-tmp/carga.log 2>&1 &
sleep 5; tail -f /root/cnefe-tmp/carga.log      # Ctrl+C sai do tail sem parar a carga
```

Na tela, ao terminar, nesta ordem: várias linhas `SET`, uma tabela do `set_config`, `TRUNCATE TABLE`, `COPY <~2,22 milhões>`, uma tabela do `setval`, `COPY <nº de ruas, igual ao "Ruas:" do b.1>`, `ANALYZE` duas vezes, o `real` do `time` e **`FIM: código 0`**. Qualquer outro código ou linha `ERROR:`: a transação foi **desfeita** e o CNEFE continua como estava; me mande o log (`cat /root/cnefe-tmp/carga.log`).

**b.9. Conferir (contagem e tamanho):**

```bash
Q() { docker exec "$C" psql -U "$OWNER" -d leadtogo -Atc "$1"; }
Q "SELECT count(*) FROM referencia_geo.cnefe_enderecos"
Q "SELECT count(*) FROM referencia_geo.cnefe_logradouros"
Q "SELECT count(DISTINCT municipio_codigo) FROM referencia_geo.cnefe_enderecos"
Q "SELECT pg_size_pretty(sum(pg_total_relation_size(c.oid))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='referencia_geo' AND c.relkind IN ('r','i')"
```

Na tela: ~2,22 milhões, o nº de ruas do b.1, `78` e o tamanho do schema (anote). No app: Configurações → Geolocalização, o aviso "CNEFE não carregado" some.

**b.10. Medir o "depois"** (repita o b.5):

```bash
time docker exec "$C" sh -c 'pg_dumpall -U "$POSTGRES_USER" | gzip' | wc -c
```

Anote como **DEPOIS**. Diferença = DEPOIS − ANTES. **Se passar de 150 MB (157286400 bytes), pare e me avise.** Este número é o do mesmo tipo de dump do Coolify; o tempo do `time` e o do b.8 dão a ordem de grandeza da restauração (a COPY dos dados domina). O teste real de restauração continua sendo o do `runbook_backup.md`, seção 2, que você pode repetir depois com o backup noturno.

**b.11. Limpar.** No **servidor** (só o arquivo local; não há chaves nem aws-cli aqui):

```bash
cd / && rm -rf /root/cnefe-tmp
```

No **WSL** (a exclusão do Garage é feita por lá, com o `s3` da parte a):

```bash
s3 s3 rm s3://leadtogo-arquivos/temporaria/cnefe-es.sql.gz
s3 s3 ls s3://leadtogo-arquivos/temporaria/         # não deve listar nada
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY; unset -f s3
```

Na tela: `delete: s3://leadtogo-arquivos/temporaria/cnefe-es.sql.gz` e nenhuma linha no `ls`. O `cnefe-es.sql.gz` local pode ficar em `~/geo`, fora do repositório.

**Desfazer, se precisar** (esvazia o CNEFE; empresas já geocodificadas não mudam), no servidor:

```bash
docker exec "$C" psql -U "$OWNER" -d leadtogo -c "TRUNCATE referencia_geo.cnefe_enderecos, referencia_geo.cnefe_logradouros RESTART IDENTITY"
```

---

## O que devolver para o Claude registrar no relatório

| Medida | Onde pegar |
|---|---|
| Tamanho do `es.pmtiles` e velocidade do mapa | a.1, a.3 |
| Tempo da carga local (`real`) e a linha final `N endereços, M ruas, K municípios` | b.1 |
| Tamanho do `cnefe-es.sql.gz` e o `real` e o `FIM: código` da aplicação em produção | b.2, b.8 |
| Tamanho do schema `referencia_geo` | b.9 |
| Dump compactado **antes** e **depois** (bytes, e o `real` de cada) e a diferença (limite: +150 MB) | b.5, b.10 |
| Qualquer erro, com a mensagem completa | todos |

---

## Medir pelo backup noturno (quando o antes/depois não foi medido na hora)

O Coolify faz o backup às 3h. Compare o último arquivo **anterior** à carga com o primeiro **posterior** (na VPS, como `root`, no terminal do servidor):

```bash
docker run --rm --env-file /root/backup-garage.env rclone/rclone:latest lsl r2:vps-backup/data \
  | grep orq8miun4hoaqnvwbntlxzwt | sort -k2,3 | tail -n 4
```

Na tela: quatro linhas `<bytes> <data> <hora> <caminho>`. Anote o tamanho do arquivo imediatamente anterior à carga e o do primeiro depois dela; a diferença é o crescimento. **Se passar de 150 MB (157286400 bytes), avise o Ale** (reavaliar: banco separado sem backup).

## Nota sobre o aws-cli no servidor (18/10/2026)

No terminal do servidor, o `amazon/aws-cli:latest` falha atrás do Traefik: `HeadObject` dá 400 (resolvido com `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` e `AWS_RESPONSE_CHECKSUM_VALIDATION=when_required`), mas `GetObject` e `DeleteObject` dão `InvalidRequest: signed header content-length is not present`. Do WSL, o mesmo aws-cli funciona (upload, presign e exclusão). Testado em 18/10/2026 contra o Garage de desenvolvimento **direto, sem Traefik** (aws-cli 2.37.9): `cp` nos dois sentidos, `rm` e `presign` funcionam. Logo o defeito está no caminho do servidor até o Garage, não no Garage nem no aws-cli sozinhos. Não resolvido; o caminho acima (presign + `curl`) evita o problema.

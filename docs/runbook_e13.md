# Runbook da E13 — primeiro deploy no Coolify

Roteiro para o Ale executar, do zero até a esteira fazendo o deploy sozinha. Tudo que é para copiar está em bloco de código. Referências: `esteira_deploy.md` (seções 5, 7 e 8) e `plano_implantacao.md` (E13).

**Ordem:** 1 DNS → 2 Segredos → 3 GHCR → 4 Banco → 5 Recursos (api, worker, web) → 6 Primeira conta → 7 Deploy automático → 8 Checklist → 9 Rollback.

**Valores fixos deste roteiro**

| Item | Valor |
|---|---|
| Domínio do app | `crm.aledias.com.br` |
| Domínio das integrações | `api.crm.aledias.com.br` |
| Arquivos (Garage) | `files.crm.aledias.com.br` |
| Imagens | `ghcr.io/sandrolimadias/leadtogo-api:latest` e `ghcr.io/sandrolimadias/leadtogo-web:latest` |
| Banco / cache | `leadtogo-db` (banco `leadtogo`, PostGIS já ativo) e `leadtogo-cache` (Valkey) |
| Remetente | `Leadtogo <nao-responda@aledias.com.br>` |

> **Decisão que mudou em relação ao plano: o papel do container vem da variável `PAPEL`, e a migração roda ao iniciar a API.** O recurso **Docker Image do Coolify não tem campo de comando de partida** (verificado no primeiro deploy real: o container sobe sempre com o `CMD` da imagem) e o "pré-deploy" executa no container **antigo** (e é pulado no primeiro deploy). Por isso a imagem tem um `CMD` padrão, `node dist/iniciar.js`, que escolhe o papel por `PAPEL`: `api` (padrão) migra o banco, semeia as referências, descarta a `DATABASE_MIGRATION_URL` do ambiente e sobe a API; `worker` só sobe o worker. Se a migração falhar, o container sai com código 1, não fica saudável e o Coolify **mantém a versão antiga no ar**. Deixe **vazios** o campo de comando e o *Pre-deployment command*. A regra "expandir e depois contrair" (esteira_deploy.md, 7.2) continua obrigatória, porque durante a migração a versão antiga ainda atende com o esquema novo.

---

## 1. Cloudflare (DNS) e Resend

### 1.1 Registros do app
Em Cloudflare → `aledias.com.br` → DNS → *Add record*. **Proxy desligado (nuvem cinza, "DNS only")** nos dois: o certificado é emitido pelo Traefik (Let's Encrypt, HTTP-01), e com o proxy ligado a emissão e o `/health` da esteira podem falhar.

| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `crm` | `<IP_DA_VPS>` | **DNS only** |
| A | `*.crm` | `<IP_DA_VPS>` | **DNS only** |

O curinga `*.crm` cobre `api.crm` e `files.crm`. Se `crm` e `files.crm` já existirem (o Garage já responde), só confira que o proxy está desligado e acrescente o que faltar. Conferir (do WSL):

```bash
dig +short crm.aledias.com.br api.crm.aledias.com.br files.crm.aledias.com.br
# os três devem mostrar o IP da VPS
```

### 1.2 Domínio de envio no Resend
1. Resend → *Domains* → *Add Domain* → `aledias.com.br`. O Resend mostra os registros (SPF, DKIM e, se pedir, MX do subdomínio `send`).
2. Crie exatamente esses registros no Cloudflare (TXT/MX/CNAME não têm proxy). Se já houver um SPF em `aledias.com.br`, **não crie um segundo**: acrescente o `include:` do Resend ao existente.
3. Clique em *Verify* no Resend e espere o status **Verified**.
4. *API Keys* → *Create API Key* → permissão **Sending access**, restrita ao domínio `aledias.com.br`. Copie a chave (`re_...`): ela é a `SMTP_PASSWORD`. Sem domínio verificado, o Resend recusa o remetente `nao-responda@aledias.com.br`.

---

## 2. Segredos a gerar

Rode no WSL e **guarde o resultado num gerenciador de senhas** (nunca no repositório). Os de senha usam `hex` de propósito: sem `+`, `/` e `=`, que quebram URLs de conexão (a senha vai no meio da URL de conexão).

```bash
echo "LEADTOGO_OWNER_PASSWORD=$(openssl rand -hex 24)"   # papel leadtogo_owner (migrações)
echo "LEADTOGO_APP_PASSWORD=$(openssl rand -hex 24)"     # papel leadtogo_app (API e worker)
echo "BETTER_AUTH_SECRET=$(openssl rand -hex 32)"        # 64 caracteres; assina cookies e cifra o 2FA
echo "TOKEN_ENCRYPTION_KEY=$(openssl rand -base64 32)"   # 32 bytes em base64 (exigido assim pela API)
```

| Segredo | Observação |
|---|---|
| `LEADTOGO_OWNER_PASSWORD`, `LEADTOGO_APP_PASSWORD` | Entram no `papeis.sql` (seção 4) e nas URLs do banco |
| `BETTER_AUTH_SECRET` | Trocar depois invalida todas as sessões e os 2FA cadastrados |
| `TOKEN_ENCRYPTION_KEY` | Pode ter `+`, `/` e `=` (não vai em URL). **Guarde uma cópia**: sem ela, e-mails que esperam na fila não podem ser enviados, e futuros segredos cifrados (ex.: SMTP próprio) ficam ilegíveis. Mesma chave na API e no worker |
| Senha do Postgres (superusuário) e do Valkey | Já criadas pelo Coolify; aparecem na página de cada banco |
| Chave do Garage `leadtogo-app` | Já existe (seção 5.1, variáveis S3) |
| API key do Resend | Seção 1.2 |

No Coolify, ao colar valores, **não use aspas** e confira que a variável não está marcada como *Build Variable* (todas são de execução).

---

## 3. GHCR: a VPS baixar as imagens privadas

As imagens são privadas. O Coolify não tem campo de registro para o GHCR: ele usa o `docker login` feito **na VPS, com o usuário que o Coolify usa para o SSH** (normalmente `root`).

1. GitHub → Settings → Developer settings → *Personal access tokens* → **Tokens (classic)** → *Generate new token (classic)*. Marque **somente `read:packages`**. Validade: a mais longa que aceitar, e anote a data para renovar. (Token *fine-grained* não serve para pacotes.)
2. Na VPS (SSH como o usuário do Coolify):

```bash
read -rsp 'Token read:packages: ' GH_TOKEN; echo
echo "$GH_TOKEN" | docker login ghcr.io -u sandrolimadias --password-stdin
unset GH_TOKEN
docker pull ghcr.io/sandrolimadias/leadtogo-api:latest   # deve baixar sem erro
```

3. Se o `pull` funcionar no SSH mas o deploy do Coolify der `pull access denied`, o login foi feito num usuário diferente do que o Coolify usa: repita o login com ele (o arquivo é `~/.docker/config.json` desse usuário).
4. A credencial fica guardada em `~/.docker/config.json`. Quando o token expirar, repita o passo 2.

---

## 4. Banco: papéis e permissões (`papeis.sql`)

O script `packages/db/sql/papeis.sql` cria `leadtogo_owner` (dono das tabelas, roda as migrações) e `leadtogo_app` (API e worker, sem `BYPASSRLS`), ajusta o dono do banco, os privilégios padrão e cria a extensão PostGIS. É idempotente e **não tem senhas no arquivo**: elas entram por variável de ambiente.

### 4.1 Levar o script ao container
O repositório é privado e o container não tem o arquivo. No **WSL**, gere um bloco pronto para colar e copie para a área de transferência do Windows:

```bash
cd ~/projetos/leadtogo
{ echo "cat > /tmp/papeis.sql <<'FIM_PAPEIS'"; cat packages/db/sql/papeis.sql; echo "FIM_PAPEIS"; } | clip.exe
```

### 4.2 Executar no terminal do `leadtogo-db`
Coolify → projeto Leadtogo → `leadtogo-db` → aba **Terminal** (shell dentro do container). **Cole** o bloco do passo anterior (cria `/tmp/papeis.sql`) e rode:

```bash
read -rsp 'LEADTOGO_OWNER_PASSWORD: ' LEADTOGO_OWNER_PASSWORD; echo
read -rsp 'LEADTOGO_APP_PASSWORD: ' LEADTOGO_APP_PASSWORD; echo
export LEADTOGO_OWNER_PASSWORD LEADTOGO_APP_PASSWORD
psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d leadtogo -f /tmp/papeis.sql
rm -f /tmp/papeis.sql
unset LEADTOGO_OWNER_PASSWORD LEADTOGO_APP_PASSWORD
```

Saída esperada: sem erros (podem aparecer só `NOTICE`). Repetir é seguro (recria o que faltar e reaplica senhas). Se a senha for trocada depois, rode de novo e atualize as URLs nos recursos.

### 4.3 Conferir os papéis
```bash
psql -X -U "$POSTGRES_USER" -d leadtogo <<'SQL'
SELECT rolname, rolcanlogin AS login, rolsuper AS super, rolbypassrls AS bypassrls
  FROM pg_roles WHERE rolname LIKE 'leadtogo_%' ORDER BY 1;
SELECT datname, pg_get_userbyid(datdba) AS dono FROM pg_database WHERE datname = 'leadtogo';
SELECT extname FROM pg_extension WHERE extname = 'postgis';
SQL
```
Esperado: `leadtogo_app` e `leadtogo_owner` com `login = t`, `super = f`, `bypassrls = f`; dono do banco `leadtogo_owner`; `postgis` presente.

### 4.4 Conferir que o `leadtogo_owner` consegue migrar
As migrações do Leadtogo criam as extensões `pg_trgm`, `unaccent`, `pgcrypto` e `citext` (todas "trusted" no PostgreSQL 13+, então o **dono do banco** pode criá-las sem ser superusuário) e `postgis` (já criada pelo `papeis.sql`, que roda como superusuário). Conferência no terminal do `leadtogo-db`:

```bash
# 1) as extensões são "trusted"? (esperado: 4 linhas com trusted = t)
psql -X -U "$POSTGRES_USER" -d leadtogo -c \
  "SELECT name, trusted FROM pg_available_extension_versions WHERE name IN ('pg_trgm','unaccent','pgcrypto','citext') ORDER BY 1;"

# 2) o owner entra e pode criar objetos e extensões no banco (nada fica: tudo na transação desfeita)
read -rsp 'LEADTOGO_OWNER_PASSWORD: ' PGPASSWORD; echo; export PGPASSWORD
psql -X -h 127.0.0.1 -U leadtogo_owner -d leadtogo <<'SQL'
BEGIN;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TABLE _teste_owner (id int);
DROP TABLE _teste_owner;
ROLLBACK;
SELECT 'owner ok' AS resultado;
SQL
unset PGPASSWORD
```
Esperado: `owner ok` sem erros. Esta é a mesma situação que a esteira exercita a cada push (`docker/dev-up.sh` cria papéis com este mesmo `papeis.sql` e o `pnpm db:migrate` roda como `leadtogo_owner`); a prova definitiva em produção é o primeiro deploy da API (seção 5.2), cujo log mostra "Aplicando migrações... Migrações aplicadas."

### 4.5 Endereços internos (para as URLs)
- **Postgres:** `leadtogo-db` → *General* → **Postgres URL (internal)**. O trecho entre `@` e `:5432` é o **host interno** (um UUID). Anote só ele.
- **Valkey:** `leadtogo-cache` → *General* → **Redis URL (internal)**. Use-a **inteira** como `REDIS_URL`.
- **Monte as URLs do banco** (no WSL; pergunta o host e as duas senhas e imprime as linhas prontas para colar no Coolify; o resultado contém senhas, então não salve em arquivo):

```bash
read -rp 'Host interno do Postgres: ' H
read -rsp 'LEADTOGO_APP_PASSWORD: ' A; echo
read -rsp 'LEADTOGO_OWNER_PASSWORD: ' O; echo
printf 'DATABASE_URL=%s://%s:%s@%s:5432/leadtogo\n' postgres leadtogo_app "$A" "$H"
printf 'DATABASE_MIGRATION_URL=%s://%s:%s@%s:5432/leadtogo\n' postgres leadtogo_owner "$O" "$H"
unset H A O
```

- Se a API não resolver o `<uuid>` (erro `ENOTFOUND`), os recursos não estão na mesma rede: em **cada** recurso (db, cache, api, worker) ligue *Advanced → Connect to Predefined Network* e reimplante (ou conecte-os à `leadtogo-net`, plano 4.2).

---

## 5. Recursos no Coolify

Em todos: projeto **Leadtogo**, ambiente **production** (do Coolify), servidor da VPS, tipo **Docker Image** (*New Resource → Docker Image*). Em **Advanced**, deixe **Pre/Post-deployment command vazios**.

#### Healthcheck e atualização sem queda

Segundo a documentação do Coolify v4, a versão antiga só fica no ar até a nova ficar saudável **se existir um healthcheck**, e ele pode vir de **dois lugares**: do painel do Coolify ou do `HEALTHCHECK` da imagem. Quando a imagem tem `HEALTHCHECK`, o Coolify o detecta e **usa o da imagem no lugar do configurado no painel** ([Health checks](https://coolify.io/docs/knowledge-base/health-checks), [Rolling updates](https://coolify.io/docs/applications/deployments/rolling-updates)). As três imagens do Leadtogo já têm `HEALTHCHECK`, então **não é preciso ligar o healthcheck do painel**: ele seria ignorado.

| Imagem | `HEALTHCHECK` embutido | Ferramenta |
|---|---|---|
| `leadtogo-api` (API e worker) | `node dist/saude.js` (30 s, 5 s, início 40 s, 3 falhas; detecta o papel) | Node (não depende de `curl`/`wget`) |
| `leadtogo-web` | `wget -q -O /dev/null http://127.0.0.1:8080/health` (início 10 s) | `wget` e `curl` presentes |

Confirme, **depois do primeiro deploy**, que o Docker enxerga a verificação (na VPS):

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep -i leadtogo   # cada um termina em (healthy)
```

**Plano B (só se algum container não mostrar `healthy`/`unhealthy` no `docker ps`, ou seja, sem healthcheck nenhum):** ligue o do painel em *Healthcheck* de cada recurso, método `GET`, esquema `http`, host `127.0.0.1`, e use `wget` (a imagem da API e a do web têm `wget`; a da API **não tem `curl`**):

| Recurso | Porta | Caminho |
|---|---|---|
| `leadtogo-api` | `3000` | `/health` |
| `leadtogo-web` | `8080` | `/health` |
| `leadtogo-worker` | `3001` | `/health` (o servidor de saúde do worker só existe no loopback do container, por isso o host é `127.0.0.1`) |

**O que acontece quando a migração falha no comando de partida**

- **Com healthcheck (o caso das nossas imagens):** o `iniciar.js` sai com código 1 e a API nem chega a subir, o container termina, nunca fica `healthy`, e o Coolify **marca o deploy como falho e mantém a versão antiga no ar**, sem queda. O log do deploy mostra `Falha na migração: ...` (sem a URL do banco).
- **Sem nenhum healthcheck:** o Coolify trata "container iniciado" como pronto, e a documentação **não garante** o comportamento quando o container novo morre logo depois. Pode haver uma janela em que a versão antiga já foi parada e a nova caiu. É por isso que a verificação do `docker ps` acima não é opcional.
- Em ambos os casos, corrija a causa e faça um novo push (a migração é segura de repetir; uma trava do Postgres impede duas ao mesmo tempo).

Mesmo com healthcheck, o Coolify avisa que atualização sem queda não é garantida: por isso a regra "expandir e depois contrair" (esteira_deploy.md, 7.2) continua obrigatória.

**Dica para não repetir variáveis:** em *Environment → Shared Variables* cadastre uma vez as comuns e use `{{environment.NOME}}` na API e no worker. Se preferir, cole o mesmo bloco nos dois.

### 5.1 `leadtogo-api`

| Campo | Valor |
|---|---|
| Imagem / tag | `ghcr.io/sandrolimadias/leadtogo-api` / `latest` |
| Comando de partida | **vazio** (vale o `CMD` da imagem, `node dist/iniciar.js`); o papel vem de `PAPEL=api` |
| Porta exposta | `3000` |
| Domínios | `https://crm.aledias.com.br/v1,https://api.crm.aledias.com.br` (**só estes dois**: veja o aviso dos domínios `www` abaixo) |
| Strip Prefixes (Advanced) | **DESLIGADO** |
| Limite de memória | 768 MB |
| Stop timeout | padrão |
| Healthcheck | o da imagem (ver "Healthcheck e atualização sem queda"); painel desligado |

Ao iniciar, `PAPEL=api` migra o banco, semeia as **referências globais** (estados, municípios, países, portes, qualificações e CNAEs; nunca a demonstração), **descarta a credencial do dono das tabelas** do ambiente do processo e só então sobe a API. A semeadura é repetível e barata: só grava o que falta ou mudou (cerca de 1 s quando não há nada a fazer). Se ela falhar, a API sobe mesmo assim e o log mostra `Aviso: referências não semeadas`; repita à mão no terminal do container com `node dist/seed-referencias.js` (o terminal do Coolify herda as variáveis do recurso, inclusive a `DATABASE_MIGRATION_URL`; só o processo da API a descarta da própria memória). `SEMEAR_REFERENCIAS=false` desliga a semeadura. Migração com erro → container sai com código 1 → o deploy falha e a versão antiga continua.

> **⚠ Remova os domínios `www` que o Coolify cria sozinho.** Ao salvar o campo *Domains*, o Coolify acrescenta por conta própria a variante `www.` de cada domínio (ex.: `https://www.crm.aledias.com.br`). Não existe DNS para `www.crm` (só `crm` e `*.crm`, e o curinga não cobre `www.crm.aledias.com.br` como queremos tratar), então o Traefik tenta emitir certificado que nunca valida e o roteador fica inconsistente. **Depois de salvar os domínios da API e do web, reabra o campo e apague toda entrada `www.`**, salve e reimplante. Confira no fim: a lista de domínios de cada recurso tem exatamente o que está na tabela.
>
> **⚠ Não corte o prefixo `/v1`.** A API responde em `/v1/*` (inclusive o login em `/v1/auth/*`). O Coolify, por padrão, aplica o **Strip Prefixes** e removeria `/v1` antes de chegar à API: tudo daria 404. Desligue em *Advanced → Strip Prefixes* **antes do primeiro deploy**.
>
> **⚠ Prioridade da rota sobre o web.** `crm.aledias.com.br/v1` (API) e `crm.aledias.com.br` (web) disputam o mesmo domínio. O Traefik escolhe a regra mais longa por padrão, então `Host + PathPrefix(/v1)` vence `Host`. Confira depois do deploy (seção 8, item 1): `/v1/primeiro-acesso/estado` precisa devolver JSON, e `/` precisa devolver a página do app. Se o `/v1` cair no web (HTML em vez de JSON), em *Advanced → Custom Labels* da API acrescente a prioridade explícita (troque `<nome>` pelo nome do roteador que aparece nas labels geradas, em *Configuration → Labels*): `traefik.http.routers.<nome>.priority=100`.

**Variáveis de ambiente da API**

| Variável | Valor / de onde vem | Secreta |
|---|---|---|
| `PAPEL` | `api` | não |
| `NODE_ENV` | `production` | não |
| `PORT` | `3000` | não |
| `LOG_LEVEL` | `info` | não |
| `APP_URL` | `https://crm.aledias.com.br` | não |
| `API_URL` | `https://crm.aledias.com.br` | não |
| `TRUST_PROXY` | `1` (um proxy na frente: o Traefik) | não |
| `DATABASE_URL` | linha `DATABASE_URL=` gerada na seção 4.5 (usuário `leadtogo_app`) | **sim** |
| `DATABASE_MIGRATION_URL` | linha `DATABASE_MIGRATION_URL=` gerada na seção 4.5 (usuário `leadtogo_owner`; **só na API**) | **sim** |
| `REDIS_URL` | Redis URL (internal) do `leadtogo-cache` (seção 4.5) | **sim** |
| `BETTER_AUTH_SECRET` | seção 2 | **sim** |
| `TOKEN_ENCRYPTION_KEY` | seção 2 | **sim** |
| `VERIFICACAO_EMAIL` | `true` | não |
| `PRIMEIRO_ACESSO` | `fechado` | não |
| `SMTP_HOST` | `smtp.resend.com` | não |
| `SMTP_PORT` | `465` | não |
| `SMTP_SECURE` | `true` (465 usa TLS direto) | não |
| `SMTP_USER` | `resend` | não |
| `SMTP_PASSWORD` | API key do Resend (`re_...`) | **sim** |
| `SMTP_FROM` | `Leadtogo <nao-responda@aledias.com.br>` (sem aspas) | não |
| `S3_ENDPOINT` | `https://files.crm.aledias.com.br` (**público**: as URLs assinadas são abertas pelo navegador; o endereço interno do Garage não funcionaria) | não |
| `S3_REGION` | `garage` | não |
| `S3_BUCKET` | `leadtogo-arquivos` | não |
| `S3_FORCE_PATH_STYLE` | `true` | não |
| `S3_ACCESS_KEY` | chave `leadtogo-app` do Garage (começa com `GK`) | **sim** |
| `S3_SECRET_KEY` | segredo da chave `leadtogo-app` | **sim** |

Não defina `APP_VERSION`: a imagem já traz o commit (é o que o `/health` mostra e a esteira confere). `LOGIN_GOOGLE`, `GOOGLE_*`, `SENTRY_DSN` e integrações ficam de fora até serem usados. Os demais ajustes (`RATE_LIMIT_*`, `EMAIL_*`, `OUTBOX_INTERVALO_MS`, `SMTP_TIMEOUT_MS`) têm padrões adequados.

**Chave do Garage:** se não tiver a chave anotada, no terminal do container do Garage (recurso `leadtogo-files`):
```bash
/garage key info leadtogo-app --show-secret
```
(Se o binário não estiver em `/garage`, rode `which garage` ou `ls /`.) A chave precisa ter permissão de leitura e escrita no bucket `leadtogo-arquivos`.

**Primeiro deploy:** clique em *Deploy*. No log, procure `Aplicando migrações...`, `Migrações aplicadas.` e `Referências em dia: {...}` (na primeira vez, `cnaes: 1332` e `municipios: 5571`), depois o container `healthy`. Se falhar com `ErroConfiguracao`, o log lista as variáveis com problema (nunca os valores).

### 5.2 `leadtogo-worker`

Faça o deploy **depois** de a API estar saudável (o worker usa as tabelas migradas pela API).

| Campo | Valor |
|---|---|
| Imagem / tag | `ghcr.io/sandrolimadias/leadtogo-api` / `latest` (**a mesma da API**) |
| Comando de partida | **vazio** (`CMD` da imagem; o papel vem de `PAPEL=worker`) |
| Porta / domínio | nenhum (o healthcheck escuta só em `127.0.0.1:3001`, dentro do container) |
| Limite de memória | 512 MB |
| Stop timeout | **padrão do Docker (10 s)**: o Coolify ignora `--stop-timeout`, então o prazo de parada vem de `WORKER_ENCERRAMENTO_S=8` |
| Healthcheck | o da imagem (detecta o papel de worker sozinho) |

**Por que 8 s:** o Coolify não aplica `--stop-timeout` (confirmado no primeiro deploy real: `docker inspect -f '{{.Config.StopTimeout}}' <container-do-worker>` mostra `<nil>`, ou seja, os 10 s padrão do Docker). Com `WORKER_ENCERRAMENTO_S=8` o worker para de pegar jobs, espera os em andamento por até 8 s e sai com código 0 antes do SIGKILL. O job que não terminar nesse prazo perde o lock (30 s) e outro worker o refaz (entrega "pelo menos uma vez", esteira_deploy.md, 7.1.1). Se um dia o Coolify passar a respeitar o stop timeout, dá para voltar ao padrão de 30 s com `--stop-timeout 45`.

**Variáveis do worker:** as mesmas da API, **exceto `DATABASE_MIGRATION_URL`** (o worker não migra e não deve conhecer a credencial do dono), mais:

| Variável | Valor | Secreta |
|---|---|---|
| `PAPEL` | `worker` | não |
| `WORKER_ENCERRAMENTO_S` | **`8`** (menor que os 10 s do Docker; o padrão do código, 30 s, estouraria o prazo e o worker seria morto com SIGKILL) | não |
| `WORKER_CONCORRENCIA` | `5` | não |

Fica **saudável** quando os consumidores das filas estão rodando e o Valkey e o Postgres respondem (esteira_deploy.md, 7.1.1).

### 5.3 `leadtogo-web`

| Campo | Valor |
|---|---|
| Imagem / tag | `ghcr.io/sandrolimadias/leadtogo-web` / `latest` |
| Comando de partida | vazio (padrão da imagem, Caddy) |
| Porta exposta | **8080** |
| Domínio | `https://crm.aledias.com.br` (**só este**: veja o aviso dos domínios `www` abaixo) |
| Strip Prefixes | indiferente (o domínio não tem prefixo) |
| Limite de memória | 128 MB |
| Healthcheck | o da imagem (`/health` do Caddy, na 8080) |

**Variáveis:** nenhuma. A imagem é a mesma em qualquer ambiente (caminhos relativos `/v1/...`).

**Ordem do primeiro deploy:** api → (saudável) → worker → web. Depois de tudo no ar, os certificados (Let's Encrypt) levam de alguns segundos a poucos minutos.

---

## 6. Referências e primeira conta

Antes da conta, confirme que as referências foram semeadas (terminal do `leadtogo-db`; esperado `1332`, `5571` e `27`):

```bash
psql -X -U "$POSTGRES_USER" -d leadtogo -At -c "SELECT (SELECT count(*) FROM cnaes), (SELECT count(*) FROM municipios), (SELECT count(*) FROM estados)"
```

Se vier `0|0|0`, rode no terminal do `leadtogo-api`: `node dist/seed-referencias.js`.

### Primeira conta

Coolify → `leadtogo-api` → aba **Terminal** (shell dentro do container). Ajuste os dados:

```bash
node dist/criar-conta.js \
  --nome "Nome do Administrador" \
  --email seu-email@aledias.com.br \
  --empresa "Razão Social Ltda"
```

- A senha é pedida num **prompt oculto** (de 10 a 128 caracteres); não vai em argumento.
- O e-mail do administrador já nasce **confirmado** (não depende do Resend).
- No primeiro login a API exige ativar o **2FA** (aplicativo autenticador e códigos de recuperação). Guarde os códigos de recuperação.
- Saída `0` = criada; `1` = e-mail ou CNPJ já cadastrado/configuração inválida; `2` = dados inválidos. `node dist/criar-conta.js --ajuda` mostra o uso completo.
- `PRIMEIRO_ACESSO` continua `fechado`: o cadastro público (`POST /v1/primeiro-acesso`) fica recusado.

---

## 7. Deploy automático (GitHub Actions → Coolify)

Faça **depois** de os três recursos terem sido implantados à mão com sucesso (seções 5 e 6).

### 7.1 Token da API do Coolify
1. Coolify → *Settings → Advanced* → ligue **API Access** (se ainda estiver desligado) e salve.
2. *Keys & Tokens → API tokens → Create*: nome `github-deploy`, permissão **somente `deploy`** (nenhuma outra: nem `read`, nem `write`, nem `root`). Copie o token (aparece uma vez).
3. `COOLIFY_URL` é o endereço do painel, com `https://` e **sem barra no final** (ex.: `https://coolify.aledias.com.br`).

### 7.2 UUIDs dos recursos
Abra cada recurso (`leadtogo-api`, `leadtogo-worker`, `leadtogo-web`) no painel: o **UUID** é o último trecho da URL do navegador, `.../project/<id>/environment/<id>/application/<UUID>`. Anote os três.

### 7.3 Secrets e variável no GitHub
Pelo `gh` no WSL (cada comando pergunta o valor; nada fica no histórico):

```bash
cd ~/projetos/leadtogo
gh secret set COOLIFY_URL
gh secret set COOLIFY_TOKEN
gh secret set COOLIFY_UUID_API
gh secret set COOLIFY_UUID_WORKER
gh secret set COOLIFY_UUID_WEB
gh secret list
```

(Ou pelo site: repositório → Settings → *Secrets and variables → Actions → New repository secret*.) Os secrets são do **repositório** (o job de deploy não usa *Environments* do GitHub: em repositório privado no plano gratuito eles não oferecem proteção, e o `DEPLOY_ENABLED` já é o interruptor).

### 7.4 Quando ligar o `DEPLOY_ENABLED`
Só com **tudo isto verdadeiro**: os três recursos saudáveis, a primeira conta criada, o checklist da seção 8 (itens 1 a 4) aprovado e os cinco secrets cadastrados. Então:

```bash
gh variable set DEPLOY_ENABLED --body true
```

O deploy automático dispara a cada push de **código** na `main` (push só de documentação não passa pela esteira). Para testá-lo, faça um commit pequeno de código (ex.: um comentário) e acompanhe: `gh run watch`. Para **desligar** (ex.: durante um rollback): `gh variable set DEPLOY_ENABLED --body false`.

O que a esteira faz: `build` publica `sha-<commit>` e `latest` → `deploy` chama `GET /api/v1/deploy?uuid=<UUID>` para api, worker e web → `verify` espera `api.crm.aledias.com.br/health` mostrar o commit novo (até 5 min), abre `crm.aledias.com.br/` e `crm.aledias.com.br/v1/primeiro-acesso/estado` → `limpeza` apaga imagens antigas do GHCR.

---

## 8. Checklist de verificação

1. **Domínio, certificado e roteamento**
   ```bash
   curl -sSI https://crm.aledias.com.br/ | head -5                       # 200, sem erro de certificado
   curl -sS https://crm.aledias.com.br/v1/primeiro-acesso/estado         # {"aberto":false} (JSON, não HTML)
   curl -sS https://api.crm.aledias.com.br/health                        # "version" = commit atual
   echo | openssl s_client -connect crm.aledias.com.br:443 -servername crm.aledias.com.br 2>/dev/null | openssl x509 -noout -issuer -dates
   ```
   O emissor deve ser Let's Encrypt (não "TRAEFIK DEFAULT CERT"). `{"aberto":false}` confirma `PRIMEIRO_ACESSO=fechado` e que o `/v1` chegou à API.
2. **Login com 2FA:** em `https://crm.aledias.com.br`, entre com a conta da seção 6, ative o 2FA, saia e entre de novo com o código. No DevTools, o cookie de sessão deve ser do host `crm.aledias.com.br`, `HttpOnly`, `Secure`, `SameSite=Lax`.
3. **E-mail de recuperação pelo Resend:** na tela de login, "Esqueci a senha" com o seu e-mail; a mensagem chega de `Leadtogo <nao-responda@aledias.com.br>` e o link abre em `crm.aledias.com.br`. No painel do Resend (*Emails*) o envio aparece como *Delivered*. Se não chegar: log do worker (a fila tenta 6 vezes com espera crescente), `SMTP_*` e o status do domínio no Resend.
4. **Worker saudável:** na VPS, `docker ps --format '{{.Names}}\t{{.Status}}' | grep -i healthy` mostra os três containers `(healthy)`; no Coolify, o worker em verde (*Running (healthy)*); o log do worker não mostra erros de conexão.
5. **PWA instalável no celular:** no Android (Chrome), abra `https://crm.aledias.com.br` e use *Instalar app*/*Adicionar à tela inicial*; no iPhone (Safari), *Compartilhar → Adicionar à Tela de Início*. O app abre em tela cheia, com o ícone do Leadtogo. (Exige HTTPS válido: item 1.)
6. **Deploy automático:** ligue o `DEPLOY_ENABLED` (7.4), faça um push de código e confirme no `gh run watch` os jobs `build`, `deploy`, `verify` (teste de fumaça) e `limpeza` verdes; `curl https://api.crm.aledias.com.br/health` mostra o commit novo.

**Fora do escopo da E13 (anote para quando chegar a hora):** antes da primeira funcionalidade de anexos, o navegador falará direto com `files.crm.aledias.com.br` (URLs assinadas), então será preciso liberar CORS no bucket do Garage para `https://crm.aledias.com.br` e ampliar a CSP do web (`connect-src` e `img-src`, em `docker/web.Caddyfile`) para esse host. Backups (plano 4.4) e Uptime Kuma/Sentry (E14) também seguem pendentes.

---

## 9. Rollback

As imagens ficam no GHCR com a tag `sha-<commit completo de 40 caracteres>`. Para voltar:

1. **Pare as publicações automáticas:** `gh variable set DEPLOY_ENABLED --body false` (senão o próximo push sobrescreve o rollback).
2. **Descubra o commit anterior bom:** `git log --oneline -10`, e o SHA completo com `git rev-parse <abreviado>`; confirme que a tag existe em GitHub → Packages → `leadtogo-api` (a limpeza mantém as 15 `sha-*` mais recentes).
3. **No Coolify**, nos recursos `leadtogo-api`, `leadtogo-worker` e `leadtogo-web`: troque a **Tag** de `latest` para `sha-<40 caracteres>` (a mesma nos três) e clique em *Deploy*. Leva cerca de 1 minuto; a API e o worker usam a mesma imagem, então voltam juntos.
4. Confira: `curl https://api.crm.aledias.com.br/health` mostra o SHA antigo.
5. **Banco:** o rollback de imagem não desfaz migração. A regra "expandir e depois contrair" garante que o código antigo funciona com o esquema novo; a imagem antiga ignora migrações posteriores a ela. Se a própria migração for o problema, corrija com **uma nova migração** (nunca edite uma já aplicada); em último caso, restaure o backup.
6. **Definitivo:** `git revert <commit>` + push (a esteira refaz tudo). Depois volte a **Tag** dos três recursos para `latest` e religue o `DEPLOY_ENABLED`.

Se um deploy novo **não ficou saudável** (migração com erro, variável faltando), nada precisa ser feito: o Coolify mantém a versão anterior no ar. Veja o log do deploy no Coolify, corrija e envie um novo push.

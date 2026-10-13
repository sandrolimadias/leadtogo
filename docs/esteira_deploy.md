# Leadtogo — Esteira de Desenvolvimento e Deploy

> Status: **Aprovado (v1.1)** · Data: 05/10/2026
> v1.1: ambiente local definido como WSL2
> Base: `configuracao_tecnologia.md` (v1.3)

---

## 1. Decisões

| # | Decisão | Escolha |
|---|---|---|
| 1 | Quem programa | Você, com o **Claude Code** |
| 2 | Repositório | **A pasta `CRM ALESSANDRO` vira o repositório** (privado, GitHub): código + documentação + design system |
| 3 | Fluxo de branches | **Push direto na `main`**. O deploy só acontece se todos os testes passarem |
| 4 | Build | **GitHub Actions** constrói as imagens Docker e publica no **GHCR** (GitHub Container Registry). A VPS não compila |
| 5 | Deploy | **Coolify** baixa a imagem nova e sobe, acionado pelo GitHub Actions |
| 6 | Ambientes | Dev local + Produção (sem staging e sem prévias por PR por enquanto) |
| 7 | Ambiente local | **WSL2 (Ubuntu 24.04)** + Docker Desktop; repositório em `~/projetos/leadtogo` |

---

## 2. Visão geral da esteira

```
 Seu computador (Claude Code)            GitHub                                    VPS (Coolify)
 ───────────────────────────        ─────────────────────────────────          ──────────────────────────
 1. Código + testes locais    push   2. CI: lint · tipos · testes ·      ok     5. Baixa imagens novas
    (hook pre-push roda os    ───►      testes de RLS · build              ───►   6. Roda migrações
    mesmos testes do CI)             3. Build das imagens Docker                  7. Sobe API, worker e web
                                     4. Publica no GHCR (tag = commit)             8. Healthcheck
                                        e chama o deploy do Coolify               9. Se falhar → mantém a
                                                     │                               versão anterior no ar
                                                     └── falhou em 2 ou 3? Nada vai para produção
```

**Regra de ouro:** como não há staging nem revisão de PR, **o CI é o único portão** antes da produção. Nada vai para o ar se lint, tipos, testes ou build falharem.

---

## 3. Repositório

### 3.1 Estrutura (monorepo)
```
CRM ALESSANDRO/                  ← raiz do repositório Git
├── apps/
│   ├── api/                     → NestJS (imagem: leadtogo-api, também usada pelo worker)
│   └── web/                     → React + Vite PWA (imagem: leadtogo-web)
├── packages/
│   ├── shared/                  → schemas Zod, tipos, regras comuns
│   ├── db/                      → schema Drizzle, migrações, políticas RLS, seeds
│   └── api-client/              → cliente gerado do OpenAPI
├── docs/                        → documentação do projeto (os .md atuais vêm para cá)
│   ├── configuracao_tecnologia.md
│   ├── funcionalidades.md
│   ├── modelagem_banco.md
│   ├── design_system.md
│   ├── esteira_deploy.md
│   └── design-system/           → pacote do design system (tokens, componentes, catálogo)
├── docker/
│   ├── api.Dockerfile
│   ├── web.Dockerfile
│   └── compose.dev.yml          → Postgres+PostGIS, Valkey e Garage para desenvolvimento
├── .github/
│   ├── workflows/ci-cd.yml      → esteira principal
│   └── dependabot.yml           → atualização semanal de dependências
├── CLAUDE.md                    → instruções permanentes para o Claude Code
├── .env.example                 → variáveis necessárias (sem valores reais)
├── .gitignore                   → inclui .env, node_modules, dist
├── package.json · pnpm-workspace.yaml · turbo.json
├── tsconfig.base.json           → TypeScript estrito compartilhado
├── eslint.config.js · .prettierrc.json · commitlint.config.js · .secretlintrc.json
└── lefthook.yml                 → hooks locais (pre-commit / commit-msg / pre-push)
```

> **Estrutura criada em 05/10/2026:** os documentos já estão em `docs/` e o design system em `docs/design-system/`. As pastas de código têm um README que descreve o conteúdo, e o Claude Code cria o código dentro delas.

### 3.2 Configuração no GitHub
- Repositório **privado**.
- **Secret scanning** e **push protection** ligados, para bloquear o push de senhas e tokens por engano.
- **Dependabot** para npm, GitHub Actions, Docker e Docker Compose (semanal, agrupado; sem major de PostGIS e Garage).
- Proteção da `main`: **não usar** "exigir PR" (por causa do push direto); bloquear apenas *force push* e exclusão da branch.

---

## 4. Ciclo de trabalho com o Claude Code

1. **Pedir a funcionalidade** ao Claude Code, citando o documento (`docs/funcionalidades.md`, seção X).
2. O Claude Code **lê o `CLAUDE.md`** e os documentos, implementa e **escreve os testes junto**.
3. **Testar localmente:** `pnpm dev` (app) e `pnpm test` (testes), com o banco de desenvolvimento no Docker.
4. **Commit** em Conventional Commits (`feat: cadastro de empresas com consulta à Receita`).
5. **Push na `main`.** O hook `pre-push` roda lint, tipos e testes antes de enviar; se algo falhar, o push é bloqueado.
6. **Acompanhar** no GitHub (aba Actions) e, ao final, conferir em produção.

> O hook local é a **primeira barreira** e o CI é a **segunda**. Os dois rodam os mesmos comandos, então o que passa no computador passa no CI.

---

## 5. CI/CD — GitHub Actions (`.github/workflows/ci-cd.yml`)

### 5.1 Gatilhos
- `push` na `main` → CI completo + build + deploy.
- `push` em outras branches (se um dia usar) → só o CI, sem build e sem deploy.
- `workflow_dispatch` → botão para rodar manualmente (ex.: redeploy).
- **Push só de documentação** (`*.md`, `docs/**`, exceto `docs/design-system/`, que alimenta o build do web): o job `escopo` classifica e todo o resto é dispensado. A regra mora em `scripts/escopo.sh`, a mesma que o hook `pre-push` usa.
- **Concorrência:** um pipeline por branch; na `main` um push novo **espera** o anterior terminar (nunca cancela, para não interromper um deploy no meio). O job `deploy` ainda tem o grupo `deploy-prod`, de um por vez.
- **Actions fixadas por SHA** (`uses: actions/checkout@<sha> # v7.0.1`); o Dependabot de `github-actions` atualiza o SHA e o comentário juntos.

### 5.2 Jobs

| Job | O que faz | Bloqueia o deploy? |
|---|---|---|
| **escopo** | Classifica o push: só documentação ou código (`scripts/escopo.sh`). Só documentação dispensa os demais jobs | — |
| **quality** | `pnpm install --frozen-lockfile`, lint (ESLint), formatação (Prettier), tipos (`tsc`) | Sim |
| **test** | Sobe os mesmos serviços do desenvolvimento (`docker/dev-up.sh`: Postgres+PostGIS, Valkey, Garage e Mailpit), roda os testes (Vitest, migrações do zero, **isolamento multiempresa/RLS**) e depois o **E2E do Playwright** (API, worker e Vite reais; Chromium instalado no job) | Sim |
| **security** | `pnpm audit` (alto/crítico), varredura de segredos (gitleaks) | Sim (alto/crítico) |
| **build** | Build Docker de `api` e `web` num **runner ARM64 nativo** (`ubuntu-24.04-arm`, sem QEMU), com cache do Actions, publicando no GHCR (`linux/arm64`) com as tags `sha-<commit>` e `latest`. Só na `main` | Sim |
| **deploy** | Chama a API do Coolify para atualizar `api`, `worker` e `web`, e espera o healthcheck | — |
| **verify** | Smoke test em produção: `api.crm.aledias.com.br/health` com o commit novo; `crm.aledias.com.br/` (web) respondendo o app; e uma rota pública `/v1` (`/v1/primeiro-acesso/estado`) por `crm.aledias.com.br`, o caminho do usuário (prova o roteamento do Traefik) | Avisa se falhar |
| **limpeza** | Apaga versões antigas no GHCR (`scripts/limpar-ghcr.sh`): mantém as 15 `sha-*` mais recentes e **nunca apaga a `latest`, a versão em produção (lida do `/health`) nem a atual**; sem saber a versão em produção, não apaga nada | Não (falha não derruba) |
| **notify** | Mensagem de sucesso ou falha (e-mail do GitHub, ou Telegram/WhatsApp via n8n) | — |

> **Runner fixo em `ubuntu-24.04`** (e o build ARM em `ubuntu-24.04-arm`), em vez de `ubuntu-latest`: o GitHub passa o `ubuntu-latest` para o Ubuntu 26 em **19/10/2026**, e uma troca silenciosa de sistema poderia quebrar a esteira sem nenhuma mudança nossa. **A troca de versão do runner será feita de forma planejada, num commit próprio**, conferindo antes Node, Playwright (Chromium), Docker e o serviço do PostGIS.

### 5.3 O workflow
O roteiro de implantação no Coolify (DNS, segredos, GHCR, banco, recursos, token e rollback) está em **`runbook_e13.md`**. O arquivo de verdade do workflow é **`.github/workflows/ci-cd.yml`** (o esqueleto antigo deste documento foi aposentado). Pontos que não aparecem na tabela acima:
- **Deploy desligado** até a E13: o job `deploy` só roda com a variável do repositório `DEPLOY_ENABLED=true` (Settings → Secrets and variables → Actions → Variables); `verify` e `limpeza` dependem dele.
- O `test` usa o `.env.example` como `.env` (senhas de teste, nenhum segredo) e os mesmos scripts do desenvolvimento, para o CI não divergir do que se roda localmente.
- O build passa `APP_VERSION`, `GIT_SHA`, `SOURCE` e `BUILD_DATE` como build-args e desliga o atestado de proveniência (`provenance: false`), que criaria versões sem tag no GHCR.
- **Custo (repositório privado, 2 000 min/mês no plano gratuito).** Primeiro run completo verde (08/10/2026), por tempo de relógio: `test` 7 min (inclui E2E), `quality` 1 min 48 s, `build api` 2 min 12 s e `build web` 1 min 24 s (ARM nativo, com cache frio), `security` 14 s, `escopo` 8 s. Cada job é arredondado para cima ao minuto: **cerca de 13 min de relógio e 17 min faturáveis por push de código**, antes de qualquer multiplicador. **Medido na tela de uso** (github.com/settings/billing → *Usage*, 08/10/2026): **80 min cobrados em 20 execuções** no mês (incluindo a montagem do CI, com várias execuções de teste e só de documentação), ou seja, cerca de 4 min por execução em média e 4% da cota de 2 000 min. Com ~17 min por push, 2 000 min dão ~115 pushes de código por mês; push só de documentação gasta ~1 min (job `escopo`).

### 5.4 Secrets no GitHub (Settings → Secrets → Actions)
| Secret | Conteúdo |
|---|---|
| `COOLIFY_URL` | Endereço do painel do Coolify (HTTPS) |
| `COOLIFY_TOKEN` | Token da API do Coolify **só com permissão de deploy** |
| `COOLIFY_UUID_API`, `COOLIFY_UUID_WORKER`, `COOLIFY_UUID_WEB` | Identificadores dos três recursos no Coolify |
| `SENTRY_AUTH_TOKEN` | Token da API do GlitchTip (escrita em projetos e releases). **Opcional**: sem ele o build do web não gera source maps. Entra no `docker build` como segredo do BuildKit (`--mount=type=secret`), nunca em camada da imagem |
| (automático) `GITHUB_TOKEN` | Publica as imagens no GHCR |

**Variables** (Settings → Secrets and variables → Actions → *Variables*; não são segredos): `DEPLOY_ENABLED`, `SENTRY_DSN_WEB` (DSN do projeto `leadtogo-web`, vira o build arg `VITE_SENTRY_DSN`; o DSN do navegador é público), `SENTRY_URL` (`https://erros.crm.aledias.com.br`) e `SENTRY_ORG` (slug da organização no GlitchTip). Passo a passo em `runbook_observabilidade.md`.

---

## 6. Imagens Docker

> **Imagem `amd64` (decidida em 13/10/2026, ainda não feita):** por causa do modelo comercial (SaaS, com on-premise possível; ver `configuracao_tecnologia.md`, seção 17), as imagens ganham também `linux/amd64`, mas **só nas versões numeradas** (release com tag), geradas nessa hora e **não a cada push**. Cada arquitetura é construída em **runner nativo** (`ubuntu-24.04` e `ubuntu-24.04-arm`, sem QEMU) e as duas viram um manifesto multi-arquitetura no GHCR. O deploy contínuo da `main` (arm64) segue como está. Entra como **commit de CI separado, quando o primeiro release com tag for preparado**.

> **A VPS é ARM64.** As imagens do Leadtogo são publicadas para `linux/arm64`. No GitHub Actions, o build usa QEMU (emulação), que é mais lento; se o tempo incomodar, o job de build já usa o runner ARM nativo (`ubuntu-24.04-arm`), sem QEMU; se o plano deixar de permitir, volte ao QEMU (`docker/setup-qemu-action`). Localmente (WSL, amd64), o Docker builda para a arquitetura da máquina; o teste em ARM64 é `pnpm imagens:testar --arm64` (emulação do Docker Desktop).

| Imagem | Base final | Conteúdo | Usada por | Tamanho (descompactado · compactado) |
|---|---|---|---|---|
| `leadtogo-api` | `node:24-alpine` (oficial) | `apps/api/dist`, `packages/{db,shared}/dist` (com as migrações SQL) e só as dependências de **produção** (podadas: sem `*.map`, `*.d.ts`, documentação e testes) | **API** (`node dist/main.js`), **worker** (`node dist/worker.js`) e **migração** (`node dist/migrate.js`) | ~354 MB (amd64, medido em 09/10/2026 com o SDK do Sentry; era 335 MB) · ~75 MB |
| `leadtogo-web` | `caddy:2-alpine` (oficial) | `vite build` do PWA + `docker/web.Caddyfile` | **Web** (porta 8080) | 94 MB (amd64) / 90 MB (arm64) · ~24 MB |

Metas: API < 360 MB (era 350: o `@sentry/node` 11 e suas dependências somam ~20 MB, já descontados ~27 MB de ferramentas de build que o Dockerfile remove) e web < 100 MB (descompactados). As bases são as imagens oficiais, que recebem as correções de segurança; o Dependabot acompanha o `FROM` de cada Dockerfile.

**`docker/api.Dockerfile`** (contexto: a raiz do repositório; `docker build -f docker/api.Dockerfile --build-arg APP_VERSION=<sha> --build-arg GIT_SHA=<sha> .`)
- **Três estágios.** `build` roda em `--platform=$BUILDPLATFORM` (o TypeScript compila igual em qualquer arquitetura: `pnpm --filter "@leadtogo/api..." run build`). `deps` instala **só as dependências de produção na arquitetura de destino** (`pnpm install --prod --frozen-lockfile --ignore-scripts --filter "@leadtogo/api..."`) e poda o `node_modules` (inclusive `sentry` e `oxc-parser`, que o `@sentry/node` 11 traz só para os plugins de bundler). `final` junta tudo na árvore do monorepo (os pacotes internos são links relativos).
- **Sem `drizzle-kit` nem ferramentas de desenvolvimento.** Isso depende de `autoInstallPeers: false` e `dedupePeerDependents: false` no `pnpm-workspace.yaml`: sem eles o `better-auth` herdava `drizzle-kit`, `vitest` e `react` do db e do web (a árvore de produção tinha 290 MB; agora 78 MB podada). Os peers que o código usa de verdade são dependências explícitas (`pnpm peers check` só deve apontar o `typescript` do `openapi-typescript`).
- **Usuário `node` (não-root)**, `NODE_ENV=production`, **`tini` como PID 1** (o SIGTERM do `docker stop` chega ao Node; o worker termina os jobs e sai com 0). A imagem não tem npm, yarn nem corepack.
- **Comandos:** `node dist/iniciar.js` (**`CMD` padrão**: escolhe o papel por `PAPEL=api|worker`; a API migra, semeia as referências e sobe), e, sozinhos, `node dist/main.js`, `node dist/worker.js`, `node dist/migrate.js` (migrador do drizzle-orm; as migrações vão em `packages/db/dist/migrations`), `node dist/seed-referencias.js` (só as referências globais, nunca a demonstração; os dados vão em `packages/db/seeds/dados`) e `node dist/criar-conta.js`. Comandos de operação: `node dist/outbox-tratar.js` (lista, reprocessa e descarta os eventos do outbox que esgotaram as tentativas, registrando quem tratou) e `node dist/testar-erro.js` (erro de teste para o GlitchTip). A imagem define `ENV NODE_OPTIONS=--enable-source-maps` (vale para qualquer `node` do container, inclusive `docker exec`), e os `.map` do `tsc` ficam na imagem (privada), para a pilha dos erros mostrar o `.ts` original.
- **HEALTHCHECK `node dist/saude.js`**, o mesmo para os dois papéis: tenta `GET 127.0.0.1:$PORT/health` (API); se a porta recusar a conexão, consulta o servidor de saúde do worker (`WORKER_SAUDE_PORTA`, padrão 3001). Uma API que responde 503 é **não saudável** (não cai no worker). `PAPEL=api` ou `PAPEL=worker` força o papel. No Coolify o worker pode usar o mesmo healthcheck da imagem, ou o comando `node dist/saude-worker.js` já documentado em 7.1.1.
- **Versão e labels:** `APP_VERSION` (build-arg) vira variável de ambiente (aparece em `/health`); `GIT_SHA`, `SOURCE` e `BUILD_DATE` alimentam as labels OCI `org.opencontainers.image.{source,revision,version,created,title}`.
- Em produção a API recusa `APP_URL`/`API_URL` sem `https`, **exceto `localhost`** (o teste local das imagens roda em modo produção).

**`docker/web.Dockerfile`**
- O build copia `docs/design-system/` para o contexto **antes** do `vite build` (o `sincronizar-design-system` traz tokens, tema e fontes); por isso o `.dockerignore` mantém `docs/design-system/` e exclui o resto de `docs/`. Roda em `$BUILDPLATFORM` com `vite build` (os tipos são conferidos no CI). `APP_VERSION` é build-arg (aparece no rodapé do app).
- **Caddy na porta 8080, usuário `web` (não-root)** e `HEALTHCHECK` em `/health`. O TLS é do Traefik.
- **Observabilidade no build:** `VITE_SENTRY_DSN`, `SENTRY_URL` e `SENTRY_ORG` são build args; o segredo `sentry_auth_token` (BuildKit) só existe durante o `vite build`. Com ele, o `@sentry/vite-plugin` injeta os debug IDs, envia os mapas ao GlitchTip e os apaga; sem ele, **nenhum mapa é gerado**. `scripts/validar-dist.mjs` roda no fim do build: apaga qualquer `.map` que sobrar (upload que falhou não derruba o deploy) e confere o precache do service worker (cada entrada existe e a revisão bate com o arquivo final). A imagem final nunca tem `.map`.
- **Domínio único:** o front usa caminhos relativos (`/v1/...`), então **a mesma imagem serve a qualquer ambiente** (nada de URL da API no build). A CSP é `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://erros.crm.aledias.com.br; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` (único domínio externo: o GlitchTip, em `connect-src`; `'unsafe-inline'` só em estilos, porque o Radix e o Sonner injetam `<style>`; não há script inline).
- **Cabeçalhos:** HSTS (1 ano), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`. **Cache:** `index.html`, `sw.js`, `registerSW.js`, `manifest.webmanifest` e o fallback de SPA (qualquer rota do app) com `no-cache`; `/assets/*` (arquivos com hash) com `public, max-age=31536000, immutable`; `/icons/*` e `favicon.svg` com 1 dia. Compressão `zstd`/`gzip`. Assim o PWA atualiza sem o usuário limpar nada.

**Teste local das imagens (`docker/compose.imagens.yml`)**: `pnpm dev:up` e depois `pnpm imagens:testar` (`--sem-build` reaproveita as imagens; `--arm64` testa como `linux/arm64`). O script cria um **banco temporário** (o `leadtogo` de desenvolvimento não é tocado), sobe `migrar` (roda e sai) → `api` + `worker` → `web` → `borda`, e confere: migração com saída 0, usuário não-root e `tini` como PID 1, ausência do `drizzle-kit`, `HEALTHCHECK` saudável nos três, cabeçalhos e cache do web, `/health` da API (versão), **primeiro acesso, login e senha errada no navegador (Playwright) pela borda**, cookie de sessão `HttpOnly; Secure; SameSite=Lax` só do host, nenhuma requisição para outra origem nem violação de CSP, e o **`docker stop` do worker** (sai com 0 em segundos). A `borda` é um Caddy (`docker/edge.Caddyfile`) que **reproduz o Traefik da produção numa porta só: `/v1/*` → API, o resto → web**; a API também fica direta em `127.0.0.1:3300` (como o `api.crm.aledias.com.br`).

---

## 7. Coolify (produção)

### 7.1 Recursos
| Recurso | Tipo no Coolify | Imagem / origem | Domínio |
|---|---|---|---|
| leadtogo-api | Docker Image | `ghcr.io/<usuario>/leadtogo-api:latest` | `crm.aledias.com.br/v1` (usuários) e `api.crm.aledias.com.br` (integrações servidor a servidor) |
| leadtogo-worker | Docker Image | `ghcr.io/<usuario>/leadtogo-api:latest` (`PAPEL=worker`) | — (sem domínio) |
| leadtogo-web | Docker Image (porta **8080**) | `ghcr.io/<usuario>/leadtogo-web:latest` | `crm.aledias.com.br` (o resto do domínio) |
| leadtogo-db | Database (PostgreSQL) | `imresamu/postgis:17-3.5` (ARM64) | — (só rede interna) |
| leadtogo-cache | Database (Redis/Valkey) | `valkey/valkey` | — |
| leadtogo-files | Docker Compose (Garage) | `dxflrs/garage:v2.1.0` | `files.crm.aledias.com.br` (API S3, porta 3900) |

- **Domínios `www`:** o Coolify cria sozinho a variante `www.` de cada domínio cadastrado (ex.: `www.crm.aledias.com.br`), que não é usada (rota e certificado extras, resolvidos pelo curinga `*.crm` do DNS). **Remova-as** dos recursos `leadtogo-api` e `leadtogo-web` e deixe só os domínios abaixo (`runbook_e13.md`, seção 5).
- **Domínio único (Traefik do Coolify):** `crm.aledias.com.br` atende os dois recursos. No `leadtogo-api`, cadastre os domínios `https://crm.aledias.com.br/v1` e `https://api.crm.aledias.com.br` (porta 3000); no `leadtogo-web`, `https://crm.aledias.com.br`. O Traefik escolhe o prefixo mais longo (`/v1` vai para a API, o resto para o web) e **não remove o prefixo** (a API já responde em `/v1/*`). Variáveis da API: `APP_URL=https://crm.aledias.com.br` e `API_URL=https://crm.aledias.com.br` (os links dos e-mails de senha e de verificação passam por esse domínio) e `TRUST_PROXY=1`. O cookie de sessão é só do host `crm.aledias.com.br`; não há CORS para o front. `api.crm.aledias.com.br` serve só a integrações servidor a servidor (webhooks, n8n, Evolution) e ao health check da esteira. O `docker/compose.imagens.yml` reproduz esse roteamento localmente.
- **Healthchecks:** API e worker usam o `HEALTHCHECK` da própria imagem (`node dist/saude.js`, que detecta o papel); o web, o `/health` do Caddy.
- **Credencial do GHCR no Coolify:** registrar `ghcr.io` com um token do GitHub com permissão **somente `read:packages`**, para baixar as imagens privadas.
- **Variáveis de ambiente** de produção (banco, Valkey, Garage, chaves do Better Auth, Evolution, n8n, Sentry) ficam **só no Coolify**. O repositório tem apenas o `.env.example`.
- **Limites de memória** definidos por container (a VPS é compartilhada com n8n e Evolution).
- **Healthchecks** em todos os recursos (acima); o Coolify só troca a versão quando a nova responde saudável (sem tempo fora do ar).

### 7.1.1 Worker: saúde, parada e retenção
- **Healthcheck (sem porta publicada):** o worker não serve HTTP. Ele abre um servidor mínimo em `127.0.0.1:3001` (`WORKER_SAUDE_PORTA`), só no loopback do container: nem outros containers o alcançam. O comando de saúde do Coolify é **`node dist/saude-worker.js`** (sai com 0 saudável, 1 caso contrário). O servidor responde 200 só se os consumidores das filas estiverem rodando, o Valkey e o Postgres responderem e (com o relay do outbox ligado) o último ciclo tiver menos de 30 s.
- **Parada gradual (SIGTERM):** o worker deixa de pegar jobs novos e espera os em andamento por `WORKER_ENCERRAMENTO_S` segundos. **Em produção: `WORKER_ENCERRAMENTO_S=8`.** O Coolify **ignora** a opção `--stop-timeout` (verificado no primeiro deploy real: `docker inspect` mostra `StopTimeout` vazio), então o Docker usa o prazo padrão de **10 s** até o SIGKILL, e o prazo do worker precisa ser MENOR que isso (8 s deixa 2 s de folga para fechar conexões e sair com 0). O padrão do código (30 s) só serve onde o stop timeout é maior (ex.: `docker/compose.imagens.yml`, 45 s). Passado o prazo o worker sai e o job que sobrou perde o lock (`FILA_LOCK_MS`, 30 s) e volta para a fila: outro worker o conclui, então nenhum job se perde (até 3 recuperações; a entrega é "pelo menos uma vez").
- **Retenção no Valkey:** jobs **concluídos** ficam 24 h e **falhos** 14 dias (`removeOnComplete: { age: 86400 }`, `removeOnFail: { age: 1209600 }`). O `jobId` só descarta repetição enquanto o job existe, por isso os consumidores também são idempotentes (a chave única é o id do evento).
- **Variáveis novas (cadastrar no Coolify, na API e no worker):** `TOKEN_ENCRYPTION_KEY` (obrigatória em produção; `openssl rand -base64 32`; guarde uma cópia: sem ela os e-mails que esperam na fila não podem ser enviados). Opcionais: `OUTBOX_INTERVALO_MS` (2000), `EMAIL_TENTATIVAS` (6), `EMAIL_ESPERA_MS` (5000), `SMTP_TIMEOUT_MS` (10000).
- Mais de um worker pode rodar ao mesmo tempo: os jobs agendados usam `upsertJobScheduler` (um só job por horário) e o outbox é reservado com `FOR UPDATE SKIP LOCKED`.

### 7.2 Migrações do banco
- Rodam **ao iniciar a API**: o `CMD` padrão da imagem é `node dist/iniciar.js`, que escolhe o papel pela variável `PAPEL` (`api`, o padrão, ou `worker`) e, na API, migra o banco **antes** de subir (e semeia as referências, ver abaixo). Isso existe porque o recurso **Docker Image do Coolify não tem campo de comando de partida** (o container sobe sempre com o `CMD` da imagem, então um comando por recurso, como `node dist/worker.js`, é impossível). **Não** usamos comando de partida **nem** o "pré-deploy" (roda no container *antigo*, e é pulado no primeiro deploy). Se a migração falhar, `iniciar.js` sai com código 1, o container novo nunca fica saudável e o Coolify mantém a versão antiga no ar. Depois de migrar, o `iniciar.js` apaga a `DATABASE_MIGRATION_URL` do `process.env` (nenhum processo de longa duração guarda a credencial do dono das tabelas). `PAPEL=worker` não migra, não semeia e descarta a `DATABASE_MIGRATION_URL` se ela vier por engano. Passo a passo em `runbook_e13.md`.
- `dist/migrate.js` usa o **migrador do `drizzle-orm`** (`aplicarMigracoes()` do `@leadtogo/db`) com `DATABASE_MIGRATION_URL` (usuário `leadtogo_owner`); o **`drizzle-kit` não vai para a imagem**. O build copia as migrações SQL para `packages/db/dist/migrations`, e a imagem precisa levar essa pasta junto com o `dist` (E11). Exige só `DATABASE_MIGRATION_URL`. Código de saída 1 (com mensagem curta, sem a URL) interrompe o deploy. Uma trava consultiva do Postgres faz dois deploys simultâneos esperarem um ao outro, e repetir é seguro.
- O worker **não** roda migrações (evita duas execuções ao mesmo tempo).
- **Referências globais** (estados, municípios, países, portes, qualificações e CNAEs): o `PAPEL=api` as semeia logo depois de migrar, com a mesma credencial do dono das tabelas. O upsert só grava o que falta ou mudou (`IS DISTINCT FROM`), então com tudo em dia leva cerca de 1 s e não gera escrita; uma falha só avisa no log (a API sobe) e `node dist/seed-referencias.js` repete à mão. `SEMEAR_REFERENCIAS=false` desliga. A demonstração (`pnpm db:seed`) nunca roda em produção.
- **Regra "expandir e depois contrair"** (obrigatória, já que o push vai direto para produção):
  1. Primeiro deploy: **adiciona** (coluna nova opcional, tabela nova). O código antigo continua funcionando.
  2. Deploy seguinte: o código passa a usar o novo.
  3. Deploy posterior: **remove** o antigo (se necessário).
  - Nunca renomear ou apagar uma coluna no mesmo deploy em que o código muda.
- **Migração destrutiva** (apagar coluna ou tabela, alterar tipo com perda): fazer **backup manual** no Coolify antes do push e registrar no commit (`BREAKING-DB:`).
- Mudanças em **políticas RLS** sempre acompanhadas de teste de isolamento.

### 7.3 Criar a primeira conta (produção)
Em produção o endpoint público de cadastro (`POST /v1/primeiro-acesso`) fica **fechado** (`PRIMEIRO_ACESSO=fechado`, o padrão em produção): ninguém cria conta e empresa no servidor sem convite. A primeira conta nasce pelo terminal do recurso `leadtogo-api` no Coolify (aba *Terminal*), com o mesmo fluxo do endpoint (usuário, conta dona, empresa, configurações e membro admin):

```bash
node dist/criar-conta.js \
  --nome "Nome do Administrador" \
  --email admin@empresa.com.br \
  --empresa "Razão Social Ltda" \
  [--cnpj 12.ABC.345/01DE-35] [--nome-fantasia "Fantasia"] [--conta "Nome da conta"]
```
- A **senha não vai em argumento** (ficaria no histórico do shell): o comando a pede num **prompt oculto**. Alternativas: `CRIAR_CONTA_SENHA=... node dist/criar-conta.js ...` ou `echo "$SENHA" | node dist/criar-conta.js ...`. A senha precisa ter de 10 a 128 caracteres e nunca é impressa.
- O e-mail do administrador **já nasce confirmado** (não depende de SMTP). Ele entra com o e-mail e a senha e, por ser administrador, **precisa ativar o 2FA** no primeiro acesso (até lá a API responde `403 2fa_obrigatorio`; a política de 2FA da empresa pode ampliar a exigência a gestores ou a todos).
- Códigos de saída: `0` criada · `1` falha (e-mail ou CNPJ já cadastrado, configuração inválida) · `2` dados inválidos. `node dist/criar-conta.js --ajuda` mostra o uso.
- O SMTP de produção é o **Resend** (`smtp.resend.com`, porta 465, `SMTP_SECURE=true`, usuário `resend`, senha = API key). Com a verificação de e-mail ligada (o padrão em produção) a API exige `SMTP_HOST` e não sobe sem ele; só desligue `VERIFICACAO_EMAIL` num ambiente sem SMTP.
- Para abrir o cadastro público (não recomendado em produção): `PRIMEIRO_ACESSO=aberto`.

---

## 8. Rollback (voltar versão)

| Situação | Como voltar |
|---|---|
| Bug no código, banco intacto | **Opção rápida:** no Coolify, trocar a tag da imagem de `latest` para `sha-<commit anterior>` e fazer redeploy (cerca de 1 minuto). **Opção definitiva:** `git revert` do commit + push, e a esteira refaz tudo |
| Deploy não ficou saudável | Automático: o Coolify mantém a versão anterior no ar |
| Migração com problema | Corrigir com **uma nova migração** (nunca editar migração já aplicada); em último caso, restaurar o backup |
| Desastre na VPS | Restaurar o backup externo do banco + Garage numa VPS nova e apontar o DNS (procedimento em `docs/runbook.md`, seção 5) |

---

## 9. Ambiente de desenvolvimento local — WSL2

**Decisão:** o desenvolvimento roda dentro do **WSL2 (Ubuntu)**. Código, Node, pnpm, Git e Claude Code ficam no Linux; o Docker Desktop do Windows atende o WSL. O navegador do Windows acessa o app normalmente em `http://localhost:5173`.

### 9.1 Onde fica o repositório
- O repositório de trabalho fica **dentro do Linux**: `~/projetos/leadtogo`.
- **Nunca trabalhe em `/mnt/c/...`** (arquivos do Windows vistos pelo Linux): instalação de pacotes, testes e recarga ficam muito lentos.
- **Pasta `C:\CRM ALESSANDRO` (decidido em 06/10/2026):** é uma **segunda cópia do repositório**, usada pelo Claude (Cowork) **só para a documentação (`docs/`)**, porque o app não acessa pastas do WSL. O código é editado **apenas** no WSL.
  - Antes de o Claude mexer na documentação: `cd "/mnt/c/CRM ALESSANDRO" && git pull`.
  - Depois: `cd "/mnt/c/CRM ALESSANDRO" && git add docs && git commit -m "docs: ..." && git push` e, no WSL, `cd ~/projetos/leadtogo && git pull`.

### 9.2 Instalação (uma vez)
1. **WSL2 + Ubuntu** (PowerShell como administrador): `wsl --install -d Ubuntu-24.04`, reiniciar e criar o usuário Linux.
2. **Limite de recursos do WSL** em `C:\Users\<voce>\.wslconfig` (evita que o Linux tome toda a RAM do Windows):
   ```ini
   [wsl2]
   memory=8GB
   processors=4
   ```
3. **Docker Desktop** no Windows: *Settings → General → Use the WSL 2 based engine* e *Resources → WSL integration →* ligar **Ubuntu-24.04**. Testar no Ubuntu: `docker run hello-world`.
4. **Ferramentas no Ubuntu:**
   ```bash
   sudo apt update && sudo apt install -y git curl build-essential unzip
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash   # reabrir o terminal
   nvm install 24 && corepack enable && corepack prepare pnpm@latest --activate
   git config --global user.name "Seu Nome"
   git config --global user.email "seu-email@exemplo.com"
   git config --global core.autocrlf input
   git config --global init.defaultBranch main
   ```
5. **GitHub CLI** (`gh`): instalar pelo repositório oficial do GitHub para Ubuntu e rodar `gh auth login`, para clonar e enviar sem digitar senha.
6. **Claude Code dentro do Ubuntu:** instalar seguindo a documentação oficial (instalador nativo para Linux) e rodar `claude` dentro da pasta do projeto.
7. **VS Code** no Windows com a extensão **WSL**: no Ubuntu, `cd ~/projetos/leadtogo && code .`.

### 9.3 Migração da pasta para o WSL (depois do primeiro push)
```bash
mkdir -p ~/projetos && cd ~/projetos
gh repo clone <usuario>/leadtogo
cd leadtogo && cp .env.example .env    # preencher os valores de desenvolvimento
```

### 9.4 Rotina diária

**Serviços de dados (`docker/compose.dev.yml`)**

| Serviço | Imagem | Porta (só `127.0.0.1`) | Observação |
|---|---|---|---|
| postgres | `imresamu/postgis:17-3.5` | 5432 | bancos `leadtogo` e `leadtogo_test`; papéis de `packages/db/sql/papeis.sql` |
| valkey | `valkey/valkey:8` | 6379 | persistência AOF |
| garage | `dxflrs/garage:v2.1.0` | 3900 (S3) | um nó; config em `docker/garage/garage.toml` |
| mailpit | `axllent/mailpit:v1.31` | 1025 (SMTP) · 8025 (interface e API) | captura os e-mails de desenvolvimento (recuperação de senha, verificação, convites); não guarda em disco |

Todos têm *healthcheck*; `up -d --wait` só retorna quando estão saudáveis. Os dados ficam em `docker/.data/` (ignorado pelo Git).

**Primeira vez**
```bash
cp .env.example .env
pnpm dev:up      # serviços (--wait), bancos e papéis do Postgres e init do Garage
```
- `pnpm dev:up` (`docker/dev-up.sh`) sobe os serviços com `--env-file .env` (o compose lê as senhas e o segredo do `.env` da raiz; sem a variável valem os padrões do `.env.example`), garante os bancos e papéis e roda o init do Garage. **Pode ser repetido sem erro**, inclusive com volumes antigos.
- **Bancos e papéis:** `packages/db/scripts/garantir-bancos.sh` cria `leadtogo`, `leadtogo_test` (testes do `packages/db`) e `leadtogo_api_test` (testes da API) se faltarem e aplica `packages/db/sql/papeis.sql` em cada um. O mesmo script roda no primeiro start do volume (`docker/postgres/init.sh`) e no CI (com `BANCOS="leadtogo_test leadtogo_api_test"`).
- **`papeis.sql`** (idempotente, **sem senhas no arquivo**; as senhas vêm de `LEADTOGO_OWNER_PASSWORD` e `LEADTOGO_APP_PASSWORD` na hora de executar): cria `leadtogo_owner` (dono do banco e das tabelas; roda as migrações) e `leadtogo_app` (usado pela API e pelo worker; sem `BYPASSRLS` e sem ser dono, para o RLS valer), instala o PostGIS e define o privilégio mínimo: nada é concedido automaticamente sobre tabelas e funções do owner, cada migração concede o que o app precisa. **Produção:** `LEADTOGO_OWNER_PASSWORD=... LEADTOGO_APP_PASSWORD=... psql -v ON_ERROR_STOP=1 -d leadtogo -f packages/db/sql/papeis.sql`, como superusuário, uma vez (repetir é seguro).
- **Testes de banco:** rodam em `leadtogo_test`, conectados como `leadtogo_app` (`TEST_DATABASE_URL`) e `leadtogo_owner` (`TEST_DATABASE_MIGRATION_URL`). O setup global do Vitest em `packages/db` apaga o que o owner criou e aplica as migrações do zero; os testes se recusam a rodar em banco que não termine em `_test`.
- `docker/garage/init.sh` é **idempotente**: só aplica o layout de um nó se ainda não houver, importa a chave `S3_ACCESS_KEY`/`S3_SECRET_KEY` do `.env` (formato do Garage: `GK` + 24 hex e 64 hex) se ela não existir e cria o bucket privado `leadtogo-arquivos` se não existir, liberando o acesso da chave. Pode ser repetido sem erro.
- **Parar:** `pnpm dev:down` (mantém os dados).
- **Zerar o ambiente:** `pnpm dev:reset` (pede confirmação; `--yes` pula a pergunta; para os containers e apaga `docker/.data/`). Depois, `pnpm dev:up` recria tudo; o init do Postgres só roda com o volume vazio.

**Dia a dia**
- `pnpm dev:up`: Postgres+PostGIS, Valkey e Garage (S3)
- `pnpm install` · `pnpm db:migrate` · `pnpm db:seed` (estados, países, portes, qualificações, CNAEs, municípios e o tenant de demonstração; os cadastros padrão entram quando essas tabelas existirem). Em produção: `pnpm db:seed:referencias` (sem a demonstração). Os dados vêm de `packages/db/seeds/dados/`; o seed não baixa nada.
- `pnpm dev`: API, worker e web com recarga automática
- `.env` nunca vai para o Git; novas variáveis entram no `.env.example`.

### 9.5 Cuidados
- Acessar os arquivos do Linux pelo Windows: Explorador → `\\wsl.localhost\Ubuntu-24.04\home\<usuario>\projetos`.
- Se `localhost` não abrir no navegador do Windows, conferir se o app escuta em `0.0.0.0` (o Vite já é configurado assim no projeto).
- Fazer backup do WSL de vez em quando (`wsl --export Ubuntu-24.04 backup.tar`), embora o código esteja seguro no GitHub.

---

## 10. Hooks locais (`lefthook.yml`)

| Momento | Roda | Tempo |
|---|---|---|
| `pre-commit` | Prettier e ESLint **só nos arquivos alterados** + verificação de segredos (secretlint) | segundos |
| `commit-msg` | Valida o padrão Conventional Commits (commitlint) | instantâneo |
| `pre-push` | `pnpm lint` + `pnpm typecheck` + `pnpm test` (mesmos comandos do CI). **Dispensado** quando o push só tem documentação (`scripts/escopo.sh`, a mesma regra do job `escopo`) | 1–3 min (0 em docs) |

> Os hooks são instalados pelo `pnpm install` (script `prepare`). O secretlint aceita apenas as strings de conexão de exemplo em `localhost` (senhas `senha`/`test`), configuradas em `.secretlintrc.json`.
> O `.lefthook.rc` (apontado por `rc: ./.lefthook.rc` no `lefthook.yml`) acrescenta ao PATH o bin do Node 24 mais recente do nvm (se existir) antes de cada comando dos hooks; assim o commit funciona de qualquer shell (IDE, Claude Code) sem ajustar o PATH. Não renomeie para `.lefthookrc`: o hook gerado pelo lefthook carrega esse nome sozinho com `. .lefthookrc`, que o `sh` (dash) do Ubuntu não encontra, e o commit aborta.

---

## 11. Versionamento e histórico

- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), o que gera o **CHANGELOG** automaticamente.
- Cada deploy fica identificado pelo **commit** (imagem `sha-…`, `/health`, Sentry).
- Marcos importantes recebem **tag de versão** (`v1.0.0` = MVP), feita manualmente.

---

## 12. Observabilidade da esteira

- **GlitchTip** (SDK do Sentry) recebe a versão de cada deploy (`release` = commit): erros novos aparecem ligados ao commit que os introduziu. O CI envia os source maps do web quando `SENTRY_AUTH_TOKEN` existe.
- **Uptime Kuma** monitora o web, `api./health`, a rota `/v1`, `api./health/alertas` (eventos do outbox esgotados e jobs falhos), o painel do Coolify e o GlitchTip, com alerta **por e-mail** (Resend).
- **Falha de deploy ou de backup:** e-mail do GitHub (workflow) e das notificações do Coolify.
- **Evolução futura:** notificação de deploy (sucesso ou falha) e alertas por Telegram/WhatsApp, via webhook para o **n8n**/Evolution.
- Passo a passo e testes: `runbook_observabilidade.md`.

---

## 13. Instruções permanentes para o Claude Code (`CLAUDE.md`)

O `CLAUDE.md` na raiz do repositório orienta o Claude Code em toda sessão. Resumo do conteúdo (o rascunho completo está no arquivo `CLAUDE.md` da pasta):
- Ler `docs/` antes de implementar; documentação é a fonte da verdade e deve ser atualizada junto com o código.
- Stack e convenções (nomes em português no banco, TypeScript estrito, Zod compartilhado).
- **Toda tabela de negócio com `tenant_id` + RLS + teste de isolamento.**
- Migrações sempre no padrão "expandir e depois contrair"; nunca editar migração aplicada.
- Rodar `pnpm lint && pnpm typecheck && pnpm test` antes de cada commit.
- Nunca commitar `.env`, tokens ou dados reais de clientes.
- Commits em Conventional Commits, pequenos e com uma intenção só.

---

## 14. Checklist de implantação da esteira (uma vez)

1. [ ] Criar o repositório privado no GitHub e ligar *secret scanning* + *push protection*.
2. [x] Reorganizar a pasta `CRM ALESSANDRO` como raiz do repositório (feito em 05/10/2026).
2.1 [ ] Inicializar o Git e fazer o primeiro push (a partir de `C:\CRM ALESSANDRO`).
2.2 [ ] Preparar o WSL2 (seção 9.2) e clonar o repositório em `~/projetos/leadtogo` (seção 9.3).
3. [ ] Criar o esqueleto do monorepo, os Dockerfiles, o `compose.dev.yml` e o `ci-cd.yml`.
4. [ ] No Coolify: criar banco (PostGIS), Valkey e Garage; registrar o GHCR com token `read:packages`.
5. [ ] No Coolify: criar os recursos `api`, `worker` e `web` (Docker Image), com variáveis, domínios, healthchecks, limites de memória e migração no comando de partida da API (ver `runbook_e13.md`).
6. [ ] Gerar o token da API do Coolify (só deploy) e cadastrar os secrets no GitHub.
7. [ ] Configurar o backup automático do banco para o S3 externo e testar uma restauração.
8. [ ] Primeiro push com uma página "Olá, Leadtogo" e `/health`, para validar a esteira de ponta a ponta.
9. [ ] Configurar o Uptime Kuma, o GlitchTip e as notificações por e-mail (`runbook_observabilidade.md`).

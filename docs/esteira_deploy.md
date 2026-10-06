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
│   └── compose.dev.yml          → Postgres+PostGIS, Valkey e MinIO para desenvolvimento
├── .github/
│   ├── workflows/ci-cd.yml      → esteira principal
│   └── dependabot.yml           → atualização semanal de dependências
├── CLAUDE.md                    → instruções permanentes para o Claude Code
├── .env.example                 → variáveis necessárias (sem valores reais)
├── .gitignore                   → inclui .env, node_modules, dist
├── package.json · pnpm-workspace.yaml · turbo.json
└── lefthook.yml                 → hooks locais (pre-commit / pre-push)
```

> **Estrutura criada em 05/10/2026:** os documentos já estão em `docs/` e o design system em `docs/design-system/`. As pastas de código têm um README que descreve o conteúdo, e o Claude Code cria o código dentro delas.

### 3.2 Configuração no GitHub
- Repositório **privado**.
- **Secret scanning** e **push protection** ligados, para bloquear o push de senhas e tokens por engano.
- **Dependabot** para npm, GitHub Actions e Docker (semanal, agrupado).
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
- `push` em outras branches (se um dia usar) → só o CI, sem deploy.
- `workflow_dispatch` → botão para rodar manualmente (ex.: redeploy).
- **Concorrência:** um deploy por vez. Um push novo cancela o pipeline anterior ainda em andamento (`concurrency: deploy-prod`).

### 5.2 Jobs

| Job | O que faz | Bloqueia o deploy? |
|---|---|---|
| **quality** | `pnpm install --frozen-lockfile`, lint (ESLint), formatação (Prettier), tipos (`tsc`) | Sim |
| **test** | Testes unitários e de integração (Vitest) com **Postgres+PostGIS e Valkey como serviços**, aplicando as migrações do zero. Inclui os **testes de isolamento multiempresa (RLS)** | Sim |
| **security** | `pnpm audit` (alto/crítico), varredura de segredos (gitleaks) | Sim (alto/crítico) |
| **build** | Build Docker multi-stage de `api` e `web`, com cache, publicando no GHCR com as tags `sha-<commit>` e `latest` | Sim |
| **deploy** | Chama a API do Coolify para atualizar `api`, `worker` e `web`, e espera o healthcheck | — |
| **verify** | Smoke test em produção: `GET /health` da API e página inicial do web respondendo 200 | Avisa se falhar |
| **notify** | Mensagem de sucesso ou falha (e-mail do GitHub, ou Telegram/WhatsApp via n8n) | — |

### 5.3 Esqueleto do workflow (referência para o Claude Code)
```yaml
name: ci-cd
on:
  push: { branches: [main] }
  workflow_dispatch:
concurrency: { group: deploy-prod, cancel-in-progress: true }
permissions: { contents: read, packages: write }

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint && pnpm format:check && pnpm typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:17-3.5
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: leadtogo_test }
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 5s --health-retries 10
      valkey:
        image: valkey/valkey:8
        ports: ['6379:6379']
    env:
      DATABASE_URL: postgres://postgres:test@localhost:5432/leadtogo_test
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:migrate && pnpm test

  build:
    needs: [quality, test]
    runs-on: ubuntu-latest
    strategy: { matrix: { app: [api, web] } }
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with: { registry: ghcr.io, username: '${{ github.actor }}', password: '${{ secrets.GITHUB_TOKEN }}' }
      - uses: docker/build-push-action@v6
        with:
          file: docker/${{ matrix.app }}.Dockerfile
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/leadtogo-${{ matrix.app }}:sha-${{ github.sha }}
            ghcr.io/${{ github.repository_owner }}/leadtogo-${{ matrix.app }}:latest
          build-args: APP_VERSION=${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy no Coolify (api, worker, web)
        run: |
          for UUID in ${{ secrets.COOLIFY_UUID_API }} ${{ secrets.COOLIFY_UUID_WORKER }} ${{ secrets.COOLIFY_UUID_WEB }}; do
            curl -fsS -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
              "${{ secrets.COOLIFY_URL }}/api/v1/deploy?uuid=$UUID&force=false"
          done
      - name: Smoke test
        run: |
          for i in $(seq 1 30); do
            curl -fsS https://api.SEUDOMINIO/health | grep -q '"version":"${{ github.sha }}"' && exit 0
            sleep 10
          done
          echo "Nova versão não respondeu em 5 minutos" && exit 1
```
> O esqueleto é referência: o Claude Code ajusta nomes, domínios e versões ao criar o repositório.

### 5.4 Secrets no GitHub (Settings → Secrets → Actions)
| Secret | Conteúdo |
|---|---|
| `COOLIFY_URL` | Endereço do painel do Coolify (HTTPS) |
| `COOLIFY_TOKEN` | Token da API do Coolify **só com permissão de deploy** |
| `COOLIFY_UUID_API`, `COOLIFY_UUID_WORKER`, `COOLIFY_UUID_WEB` | Identificadores dos três recursos no Coolify |
| (automático) `GITHUB_TOKEN` | Publica as imagens no GHCR |

---

## 6. Imagens Docker

| Imagem | Base | Conteúdo | Usada por |
|---|---|---|---|
| `leadtogo-api` | `node:<LTS>-alpine` (multi-stage) | API NestJS compilada + migrações | **API** (`node dist/main.js`) e **worker** (`node dist/worker.js`) |
| `leadtogo-web` | Build Vite → `caddy:alpine` | Arquivos estáticos do PWA, com cache e compressão | **Web** |

- Multi-stage: dependências e build numa etapa, imagem final só com o necessário (menor e mais segura).
- Usuário **não-root**, `NODE_ENV=production`, `HEALTHCHECK` na imagem.
- A versão (`APP_VERSION` = commit) vai para a imagem e aparece em `/health`, no rodapé do app e no Sentry, para saber exatamente o que está no ar.
- Em `leadtogo-web`, o `index.html` e o service worker **sem cache**, e os arquivos com hash **com cache longo**. Assim o PWA atualiza sem o usuário precisar limpar nada.

---

## 7. Coolify (produção)

### 7.1 Recursos
| Recurso | Tipo no Coolify | Imagem / origem | Domínio |
|---|---|---|---|
| leadtogo-api | Docker Image | `ghcr.io/<usuario>/leadtogo-api:latest` | `api.seudominio` |
| leadtogo-worker | Docker Image | `ghcr.io/<usuario>/leadtogo-api:latest` (comando: worker) | — (sem domínio) |
| leadtogo-web | Docker Image | `ghcr.io/<usuario>/leadtogo-web:latest` | `app.seudominio` |
| leadtogo-db | Database (PostgreSQL) | `postgis/postgis` | — (só rede interna) |
| leadtogo-cache | Database (Redis/Valkey) | `valkey/valkey` | — |
| leadtogo-files | Service (MinIO) | `minio/minio` | `files.seudominio` (se necessário) |

- **Credencial do GHCR no Coolify:** registrar `ghcr.io` com um token do GitHub com permissão **somente `read:packages`**, para baixar as imagens privadas.
- **Variáveis de ambiente** de produção (banco, Valkey, MinIO, chaves do Better Auth, Evolution, n8n, Sentry) ficam **só no Coolify**. O repositório tem apenas o `.env.example`.
- **Limites de memória** definidos por container (a VPS é compartilhada com n8n e Evolution).
- **Healthchecks** em todos os recursos; o Coolify só troca a versão quando a nova responde saudável (sem tempo fora do ar).

### 7.2 Migrações do banco
- Rodam no **comando de pré-deploy** do recurso `leadtogo-api` (`node dist/migrate.js`), **antes** de a nova versão receber tráfego. Se a migração falhar, o deploy para e a versão antiga continua no ar.
- O worker **não** roda migrações (evita duas execuções ao mesmo tempo).
- **Regra "expandir e depois contrair"** (obrigatória, já que o push vai direto para produção):
  1. Primeiro deploy: **adiciona** (coluna nova opcional, tabela nova). O código antigo continua funcionando.
  2. Deploy seguinte: o código passa a usar o novo.
  3. Deploy posterior: **remove** o antigo (se necessário).
  - Nunca renomear ou apagar uma coluna no mesmo deploy em que o código muda.
- **Migração destrutiva** (apagar coluna ou tabela, alterar tipo com perda): fazer **backup manual** no Coolify antes do push e registrar no commit (`BREAKING-DB:`).
- Mudanças em **políticas RLS** sempre acompanhadas de teste de isolamento.

---

## 8. Rollback (voltar versão)

| Situação | Como voltar |
|---|---|
| Bug no código, banco intacto | **Opção rápida:** no Coolify, trocar a tag da imagem de `latest` para `sha-<commit anterior>` e fazer redeploy (cerca de 1 minuto). **Opção definitiva:** `git revert` do commit + push, e a esteira refaz tudo |
| Deploy não ficou saudável | Automático: o Coolify mantém a versão anterior no ar |
| Migração com problema | Corrigir com **uma nova migração** (nunca editar migração já aplicada); em último caso, restaurar o backup |
| Desastre na VPS | Restaurar o backup externo do banco + MinIO numa VPS nova e apontar o DNS (procedimento em `docs/runbook.md`, a criar) |

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
- `docker compose -f docker/compose.dev.yml up -d`: Postgres+PostGIS, Valkey e MinIO (com o painel do MinIO)
- `pnpm install` · `pnpm db:migrate` · `pnpm db:seed` (tenant de exemplo, tags e funil padrão, CNAEs, municípios)
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
| `pre-commit` | Prettier e ESLint **só nos arquivos alterados** + verificação de segredos | segundos |
| `commit-msg` | Valida o padrão Conventional Commits | instantâneo |
| `pre-push` | `pnpm typecheck` + `pnpm test` (mesmos comandos do CI) | 1–3 min |

---

## 11. Versionamento e histórico

- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), o que gera o **CHANGELOG** automaticamente.
- Cada deploy fica identificado pelo **commit** (imagem `sha-…`, `/health`, Sentry).
- Marcos importantes recebem **tag de versão** (`v1.0.0` = MVP), feita manualmente.

---

## 12. Observabilidade da esteira

- **Sentry** (ou GlitchTip) recebe a versão de cada deploy: erros novos aparecem ligados ao commit que os introduziu.
- **Uptime Kuma** monitora `app.`, `api.` e `/health`, com alerta.
- **Notificação de deploy** (sucesso ou falha), por e-mail do GitHub ou por um webhook do **n8n** que avisa no WhatsApp/Telegram.

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
4. [ ] No Coolify: criar banco (PostGIS), Valkey e MinIO; registrar o GHCR com token `read:packages`.
5. [ ] No Coolify: criar os recursos `api`, `worker` e `web` (Docker Image), com variáveis, domínios, healthchecks, limites de memória e comando de pré-deploy (migrações).
6. [ ] Gerar o token da API do Coolify (só deploy) e cadastrar os secrets no GitHub.
7. [ ] Configurar o backup automático do banco para o S3 externo e testar uma restauração.
8. [ ] Primeiro push com uma página "Olá, Leadtogo" e `/health`, para validar a esteira de ponta a ponta.
9. [ ] Configurar o Uptime Kuma, o Sentry e a notificação de deploy.

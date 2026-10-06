# Leadtogo — Plano de Implantação da Estrutura (Fase 0)

> Status: **Aprovado para execução (v1.0)** · Data: 06/10/2026
> Base: `configuracao_tecnologia.md` (v1.3) · `modelagem_banco.md` (v1.1) · `esteira_deploy.md` (v1.1) · `design_system.md` · `prototipo/`

---

## 1. Objetivo

Deixar **toda a fundação técnica pronta e em produção** antes de programar as funcionalidades do CRM:

- computador preparado (WSL2), repositório no GitHub e esteira de CI/CD funcionando;
- VPS com banco (PostgreSQL + PostGIS), cache (Valkey), arquivos (Garage) e backups externos;
- monorepo com API, worker e web rodando localmente e em produção;
- **login multiempresa** funcionando, com isolamento entre empresas (RLS) testado;
- **casca do app** (menu, barra superior, navegação do celular, temas) igual ao protótipo;
- monitoramento, alertas e procedimento de recuperação documentados.

**Resultado esperado:** acessar `https://crm.aledias.com.br`, criar a conta e a primeira empresa, entrar, trocar de empresa e ver a casca do Leadtogo vazia. Tudo isso entregue por um `git push` que passou pela esteira.

> Fora desta fase: telas de negócio (empresas, contatos, atividades, oportunidades). Elas entram no escopo do MVP, a ser definido em seguida.

---

## 2. Visão geral das etapas

| # | Etapa | Quem | Depende de | Duração estimada |
|---|---|---|---|---|
| E1 | Preparar o computador (WSL2) | Ale | — | 2–3 h |
| E2 | Repositório no GitHub | Ale + Claude Code | E1 | 1 h |
| E3 | Domínio e DNS | Ale | — | 30 min (+ propagação) |
| E4 | Preparar a VPS e o Coolify (dados) | Ale | E3 | 3–4 h |
| E5 | Esqueleto do monorepo | Claude Code | E2 | 1 dia |
| E6 | Ambiente de desenvolvimento (Docker local) | Claude Code | E5 | 2 h |
| E7 | Banco: base, papéis, RLS e referências | Claude Code | E6 | 2 dias |
| E8 | API base (NestJS + Better Auth + tenant) | Claude Code | E7 | 2–3 dias |
| E9 | Web base (casca do app + login) | Claude Code | E8 | 3 dias |
| E10 | Worker base (filas e eventos) | Claude Code | E8 | 1 dia |
| E11 | Imagens Docker | Claude Code | E8–E10 | 0,5 dia |
| E12 | CI/CD e hooks locais | Claude Code | E11 | 1 dia |
| E13 | Recursos da aplicação no Coolify e 1º deploy | Ale + Claude Code | E4, E12 | 3–4 h |
| E14 | Observabilidade e alertas | Ale + Claude Code | E13 | 2–3 h |
| E15 | Segurança e endurecimento | Ale + Claude Code | E13 | 0,5 dia |
| E16 | Validação final e runbook | Ale + Claude Code | todas | 0,5 dia |

**Total estimado:** de 2 a 3 semanas, com dedicação parcial. E3 e E4 podem andar em paralelo com E5–E10.

```
E1 ─► E2 ─► E5 ─► E6 ─► E7 ─► E8 ─┬─► E9  ─┐
                                   ├─► E10 ─┼─► E11 ─► E12 ─┐
E3 ─► E4 ──────────────────────────┴────────┘               ├─► E13 ─► E14 ─► E15 ─► E16
                                                             │
```

---

## 3. Como trabalhar com o Claude Code nesta fase

- Abra o Claude Code **dentro do WSL**, na pasta do projeto: `cd ~/projetos/leadtogo && claude`.
- Cada etapa abaixo traz um **pedido pronto**. Cole o pedido e deixe o Claude Code ler o `CLAUDE.md` e os documentos.
- **Uma etapa por vez.** Ao fim de cada etapa: rode os testes, confira o critério de pronto e faça o commit (o Claude Code sugere a mensagem).
- Se o Claude Code propuser algo diferente dos documentos, ele deve **atualizar o documento no mesmo commit** (regra do `CLAUDE.md`).
- Guarde neste arquivo o andamento: marque `[x]` nos itens concluídos.

---

## E1. Preparar o computador (WSL2) — Ale

Seguir `esteira_deploy.md`, seção 9.2. Resumo:

- [x] `wsl --install -d Ubuntu-24.04` (PowerShell como administrador), reiniciar e criar o usuário.
- [x] Criar `C:\Users\<voce>\.wslconfig` com `memory=8GB` e `processors=4`.
- [x] Docker Desktop: engine WSL2 + integração com Ubuntu-24.04 → `docker run hello-world` no Ubuntu.
- [x] No Ubuntu: `git`, `build-essential`, `nvm` → `nvm install 24`, `corepack enable`, pnpm.
- [x] `git config` (nome, e-mail, `core.autocrlf input`, `init.defaultBranch main`).
- [x] GitHub CLI: `gh auth login`.
- [x] Claude Code instalado no Ubuntu (instalador oficial para Linux) e logado.
- [x] VS Code com a extensão **WSL**.

✅ **Concluído em 06/10/2026.** **Pronto quando:** no Ubuntu, `node -v` mostra v24, `pnpm -v`, `docker ps`, `gh auth status` e `claude --version` funcionam.

---

## E2. Repositório no GitHub — Ale + Claude Code

1. [x] Criar o repositório **privado** `leadtogo` no GitHub.
2. [x] Settings → Advanced Security: ligar **Dependency graph**, **Dependabot alerts** e **Dependabot security updates**. *Secret scanning e Push protection não estão disponíveis para repositório privado no plano gratuito; a proteção contra segredos é feita pelo secretlint no hook local (E5) e pelo gitleaks no CI (E12).*
3. [x] Primeiro push **a partir de `C:\CRM ALESSANDRO`** (pode ser no PowerShell ou no Ubuntu via `/mnt/c`, só desta vez):
   ```bash
   cd "/mnt/c/CRM ALESSANDRO"
   git init && git add . && git commit -m "docs: documentação inicial do Leadtogo"
   git remote add origin https://github.com/<usuario>/leadtogo.git
   git push -u origin main
   ```
4. [x] Clonar no WSL: `mkdir -p ~/projetos && cd ~/projetos && gh repo clone <usuario>/leadtogo`.
5. [x] ~~Conectar a pasta do WSL no Claude (Cowork)~~: o app não acessa caminhos `\\wsl.localhost`. **Combinado:** `C:\CRM ALESSANDRO` vira uma segunda cópia do repositório, usada pelo Claude (Cowork) **só para `docs/`**; sincronização por `git pull`/`git push` (ver `esteira_deploy.md`, 9.1).
6. [ ] Proteção da `main` (Settings → Rulesets): bloquear *force push* e exclusão (sem exigir PR). *No plano gratuito com repositório privado, o GitHub pode criar a regra sem aplicá-la; nesse caso, fica como pendência opcional.*

✅ **Repositório criado e primeiro push feito em 06/10/2026** (itens 5 e 6 pendentes de confirmação). **Pronto quando:** o repositório no GitHub mostra `docs/`, `CLAUDE.md` e `README.md`, e o clone no WSL está atualizado.

---

## E3. Domínio e DNS — Ale

**Decisão (06/10/2026):** o Leadtogo roda em subdomínios de **`crm.aledias.com.br`**. Um domínio próprio da marca (ex.: `leadtogo.com.br`) pode ser adotado depois sem mudar o código, só as variáveis de ambiente e o DNS.

| Endereço | Uso |
|---|---|
| `crm.aledias.com.br` | Aplicação web (PWA): é o endereço que os usuários acessam |
| `api.crm.aledias.com.br` | API |
| `files.crm.aledias.com.br` | Garage (só se for preciso acesso externo direto) |
| `t.crm.aledias.com.br` | Rastreamento de e-mail (fase futura) |
| `status.crm.aledias.com.br` | Página do Uptime Kuma (opcional) |

Passos no painel de DNS de `aledias.com.br` (Registro.br, Cloudflare ou onde estiver):
- [ ] Registro **A** `crm` → IP da VPS.
- [ ] Registro **A** `*.crm` (curinga) → IP da VPS. Cobre `api.crm`, `files.crm`, `t.crm` e `status.crm` de uma vez. Se o painel não aceitar curinga, crie um registro A para cada um.
- [ ] TTL de 300 segundos (5 min) durante a implantação.
- [ ] Se o DNS estiver na Cloudflare: proxy **desligado** (nuvem cinza) até os certificados do Coolify serem emitidos; depois pode ligar com SSL "Full (strict)".
- [ ] Se existir um registro **CAA** no domínio, ele precisa permitir `letsencrypt.org`.

> **Cookies de login:** o app e a API ficam no mesmo site (`aledias.com.br`), então o login por cookie funciona sem truques. A API configura o cookie para o domínio `crm.aledias.com.br` e o CORS libera só `https://crm.aledias.com.br`.

**Pronto quando:** `nslookup crm.aledias.com.br` e `nslookup api.crm.aledias.com.br` respondem com o IP da VPS.

---

## E4. Preparar a VPS e o Coolify (serviços de dados) — Ale

### 4.1 Levantamento e limpeza
- [x] Medir o consumo atual. **06/10/2026:** Oracle Cloud **ARM64**, 4 vCPU, 23 GB (5 GB em uso), 167 GB livres; n8n, Evolution, 2 WordPress/MySQL e Coolify 4.x.
- [x] Supabase: já não está rodando.
- [x] Disco livre suficiente (167 GB).
- [ ] Atualizar o sistema e o Coolify para a versão estável mais recente.

> **Pendências registradas em 06/10/2026 (fazer antes da E13):**
> - **Firewall da Oracle (Security List):** conferir as regras de entrada e fechar **8000, 6001, 6002, 8080 e 111**, mantendo 22, 80 e 443 (o painel é acessado por `painel.aledias.com.br`). As portas publicadas pelo Docker não passam pelo `iptables INPUT`, então quem protege é a Security List.
> - **Backup externo (Cloudflare R2):** ainda não existe para nenhum serviço da VPS (n8n, Evolution, WordPress). Configurar o quanto antes, e obrigatoriamente antes de dados reais no CRM.

### 4.2 Rede e segurança da VPS
- [ ] Firewall: liberar só **22 (SSH), 80, 443** e a porta do painel do Coolify (ou acesso ao painel apenas por domínio com HTTPS).
- [x] SSH somente por chave (já configurado: `PasswordAuthentication no`). `fail2ban` opcional.
- [ ] Criar no Coolify uma **rede Docker compartilhada** (ex.: `leadtogo-net`) e conectar n8n e Evolution a ela (`configuracao_tecnologia.md`, 11.1).

### 4.3 Serviços de dados (no Coolify, projeto "Leadtogo", ambiente "production")
| Serviço | Configuração |
|---|---|
| **leadtogo-db** | PostgreSQL com imagem **`imresamu/postgis:17-3.5`** (a oficial não tem ARM64) · senha forte · **sem porta pública** · limite de memória 3 GB · rede `leadtogo-net` |
| **leadtogo-cache** | Valkey 8 · senha · sem porta pública · limite 512 MB · `maxmemory-policy noeviction` (filas não podem perder dados) |
| **leadtogo-files** | **Garage** (`dxflrs/garage:v2.1.0`) via Docker Compose · bucket `leadtogo-arquivos` **privado** · chave de acesso própria · limite 512 MB · domínio `files.crm.aledias.com.br` (porta 3900) |

> **Status 06/10/2026:** ✅ `leadtogo-db` (imagem `imresamu/postgis:17-3.5`, banco `leadtogo` criado, PostGIS ativo, sem porta pública) · ✅ `leadtogo-cache` (Valkey) · ✅ `leadtogo-files` (Garage `dxflrs/garage:v2.1.0`): bucket `leadtogo-arquivos` e chave `leadtogo-app` criados; `https://files.crm.aledias.com.br` com certificado Let's Encrypt e respondendo `AccessDenied` sem credencial.
>
> **Lição aprendida:** em recurso *Docker Compose Empty*, o Coolify 4.x mostrou o domínio na tela mas **não gerou as regras do Traefik** (resultado: 503 e certificado provisório). Solução: declarar as regras como `labels` no próprio compose (`traefik.enable`, `routers.*.rule=Host(...)`, `entrypoints=https`, `tls.certresolver=letsencrypt`, `loadbalancer.server.port`) e deixar o campo Domains vazio. Usar o mesmo padrão em outros recursos de compose, se o problema se repetir.

- [ ] No banco, criar os papéis (o Claude Code fornece o script na E7):
  - `leadtogo_owner`: dono das tabelas, usado só pelas migrações;
  - `leadtogo_app`: usado pela aplicação, **sem** `BYPASSRLS` e sem ser dono das tabelas.

### 4.4 Backups externos (antes de qualquer dado real)
- [ ] Criar um bucket num S3 externo (Cloudflare R2 ou Backblaze B2) e cadastrá-lo no Coolify como destino S3.
- [ ] Backup do `leadtogo-db`: **diário**, retenção 7 diários / 4 semanais / 3 mensais.
- [ ] Sincronização diária do bucket do Garage para o R2 com `rclone` (o Claude Code prepara o script na E15).
- [ ] Incluir no backup externo os bancos do **n8n** e da **Evolution**, se ainda não estiverem.
- [ ] **Teste de restauração:** restaurar o backup num banco temporário e conferir.

### 4.5 Registro de imagens
- [ ] No GitHub: criar um token *classic* com **somente `read:packages`**.
- [ ] No Coolify: cadastrar o registro `ghcr.io` com esse token.

✅ **Serviços concluídos em 06/10/2026** (backups e firewall pendentes, ver acima). **Pronto quando:** banco, cache e Garage estão "healthy" no Coolify, sem portas públicas; um backup foi gerado no S3 externo e restaurado com sucesso.

---

## E5. Esqueleto do monorepo — Claude Code

**Pedido ao Claude Code:**
> Leia o `CLAUDE.md`, `docs/configuracao_tecnologia.md` (seções 2, 3 e 4) e `docs/esteira_deploy.md` (seções 3, 9, 10 e 11). Crie o esqueleto do monorepo pnpm + Turborepo com `apps/api` (NestJS), `apps/web` (React + Vite), `apps/api` também com o entrypoint do worker, `packages/shared`, `packages/db` e `packages/api-client`. Configure TypeScript estrito (tsconfig base compartilhado), ESLint (flat config), Prettier, Vitest, lefthook (pre-commit, commit-msg com Conventional Commits, pre-push) e os scripts raiz `dev`, `build`, `lint`, `format`, `format:check`, `typecheck`, `test`, `db:generate`, `db:migrate`, `db:seed`, `db:studio`. Não crie funcionalidades ainda. Mantenha os READMEs das pastas atualizados.

Checklist:
- [x] `package.json` raiz, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc` (24).
- [x] `tsconfig.base.json` com `strict`, `noUncheckedIndexedAccess`; os pacotes internos são resolvidos pela condição `@leadtogo/source` (no lugar de `paths`).
- [x] ESLint (flat, com checagem de tipos) + Prettier + `lefthook.yml` (secretlint, Prettier, ESLint · commitlint · lint/typecheck/test no pre-push) + commitlint.
- [x] Vitest configurado em cada pacote (teste de exemplo em `GET /health` e no `App`).
- [ ] Renovate ou `.github/dependabot.yml` (npm, actions, docker; semanal, agrupado). **Ficou de fora do commit do E5: feito junto com o E6.**

✅ **Concluído em 06/10/2026** (commit `506674c`; Dependabot pendente). NestJS 12 em ESM, com a API (`dist/main.js`) e o worker (`dist/worker.js`) no mesmo app; `GET /health` fora do prefixo `/v1`, devolvendo `version`; Swagger em `/docs` só fora de produção; cliente da API com `openapi-typescript` + `openapi-fetch`. **Atenção na E11:** o `db:migrate` usa o `drizzle-kit` (dependência de desenvolvimento); a imagem que roda as migrações no pre-deploy precisa incluí-lo, ou usar o migrador do `drizzle-orm`.
**Pronto quando:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test` passam no WSL (com testes de exemplo).

---

## E6. Ambiente de desenvolvimento local — Claude Code

**Pedido:**
> Crie `docker/compose.dev.yml` com Postgres `imresamu/postgis:17-3.5`, Valkey 8 e **Garage** (S3) com script de init que cria o bucket e a chave, volumes em `docker/.data/`, healthchecks e um script de init que cria os papéis `leadtogo_owner` e `leadtogo_app` e o bucket `leadtogo-arquivos`. Atualize o `.env.example` e documente em `docs/esteira_deploy.md` (seção 9.4). Em commit separado, crie o `.github/dependabot.yml` que ficou pendente do E5 (npm, github-actions e docker; semanal; atualizações agrupadas).

- [ ] `docker compose -f docker/compose.dev.yml up -d` sobe os 3 serviços saudáveis.
- [ ] `.env` local criado a partir do `.env.example`.
- [ ] `.github/dependabot.yml` criado (pendência do E5).

**Pronto quando:** `psql` conecta como `leadtogo_app`, `redis-cli ping` responde e o Garage responde em `localhost:3900` (bucket `leadtogo-arquivos` criado pelo script de init).

---

## E7. Banco: base, papéis, RLS e referências — Claude Code

**Pedido:**
> Com base em `docs/modelagem_banco.md` (seções 1, 3, 4 e 12), implemente em `packages/db` com Drizzle:
> 1. extensões `postgis`, `pgcrypto`, `citext`, `pg_trgm`, `unaccent`; schema `auth` reservado ao Better Auth;
> 2. tabelas de **plataforma**: `contas`, `conta_administradores`, `tenants`, `tenant_configuracoes`, `membros`;
> 3. tabelas de **referência globais**: `cnaes`, `municipios`, `estados`, `paises`, `portes`, `qualificacoes_socio`, `receita_consultas`;
> 4. tabelas de **sistema**: `auditoria` (particionada por mês), `eventos_outbox`, `notificacoes`, `arquivos`;
> 5. a infraestrutura de **RLS**: funções `app_tenant_id()` e `app_tenant_ids()` lendo `current_setting`, políticas de leitura/escrita conforme `configuracao_tecnologia.md` (Multiempresa), `FORCE ROW LEVEL SECURITY`, permissões do papel `leadtogo_app`;
> 6. um **helper de teste** que cria dois tenants e verifica que um não lê nem grava os dados do outro; aplique-o a todas as tabelas com `tenant_id`;
> 7. seeds: estados, países, portes, qualificações, **CNAEs** (lista oficial IBGE/CONCLA) e **municípios** (IBGE, com código SIAFI), mais um tenant de demonstração com os cadastros padrão (grupos de tags Status e Visitação, tipos de atividade, funil padrão com fases).
> Siga a regra "expandir e depois contrair" e gere as migrações com drizzle-kit.

Checklist:
- [ ] Migrações geradas e aplicadas do zero sem erro.
- [ ] Testes de isolamento passando (RLS) para todas as tabelas com `tenant_id`.
- [ ] Seeds idempotentes (rodar duas vezes não duplica).
- [ ] Script SQL de criação dos papéis para produção em `packages/db/sql/papeis.sql`.

**Pronto quando:** `pnpm db:migrate && pnpm db:seed && pnpm test` passam do zero, e o Drizzle Studio mostra CNAEs e municípios carregados.

---

## E8. API base — Claude Code

**Pedido:**
> Leia `docs/configuracao_tecnologia.md` (seções 4, 7 e Multiempresa) e monte a base da API NestJS:
> - configuração validada por Zod (falha ao iniciar se faltar variável);
> - logs estruturados com Pino (`request_id`, `tenant_id`, `user_id`);
> - `GET /health` (banco, Valkey e Garage) retornando `version` = `APP_VERSION`;
> - **Better Auth** com e-mail/senha, plugin de organizações (organização = tenant), 2FA TOTP, recuperação de senha, cookies seguros, e login Google preparado mas desligado;
> - fluxo de **primeiro acesso**: cria conta + primeira empresa (tenant) + membro admin + cadastros padrão;
> - **guard de tenant**: valida que o usuário é membro ativo da empresa ativa e abre a transação com `SET LOCAL app.tenant_id`; endpoints `/v1/consolidado/*` com `app.tenant_ids` (só leitura);
> - endpoints iniciais: `GET /v1/me` (usuário, empresas, papel em cada uma), `POST /v1/sessao/empresa-ativa`, `GET/PATCH /v1/me/preferencias`;
> - Helmet, CORS restrito a `APP_URL`, rate limit no Valkey (login e API), validação global e filtro de erros padronizado;
> - OpenAPI em `/docs` (protegido em produção) e geração do `packages/api-client`;
> - entrypoint de **migração** (`dist/migrate.js`) usando `DATABASE_MIGRATION_URL`.
> Escreva testes de integração do login, da troca de empresa e do bloqueio entre empresas.

Checklist:
- [ ] Login, logout, 2FA, recuperação de senha (e-mail via SMTP de desenvolvimento, ex.: Mailpit no compose).
- [ ] Criar conta/empresa, convidar membro, trocar empresa ativa.
- [ ] Usuário da empresa A recebe 403/404 ao tentar acessar dados da B.

**Pronto quando:** testes de integração passam e o Swagger mostra os endpoints.

---

## E9. Web base (casca do app) — Claude Code

**Pedido:**
> Leia `docs/prototipo/README.md` (Shell da aplicação, Tema) e `docs/design_system.md`. Monte `apps/web`:
> - Vite + React + TypeScript, TanStack Router e Query, cliente da API gerado;
> - Tailwind v4 com `docs/design-system/tokens.css` e `tailwind-theme.css` (copiados para `apps/web/src/styles` por script, para manter uma fonte só) e fontes do design system;
> - shadcn/ui inicializado com os tokens; componentes base: Button, IconButton, Input/TextField, Select, Checkbox, Switch, Badge, Tag, Avatar, Tabs, Menu (DropdownMenu), Tooltip, Dialog, Sheet (folha do celular), Toast (Sonner), Skeleton, EmptyState, SegmentedControl;
> - **casca:** menu lateral recolhível (preferência salva via `/v1/me/preferencias`), seletor de empresa, barra superior (busca, "Registrar atividade", sino), navegação do celular (header, barra inferior, botão "+", folha de perfil), tema claro/escuro (padrão do sistema);
> - telas: **Login**, **2FA**, **Esqueci a senha**, **Aceitar convite**, **Primeiro acesso** (conta + empresa), e páginas vazias para Dashboard, Empresas, Contatos, Oportunidades e Tarefas com EmptyState;
> - PWA com `vite-plugin-pwa` (manifest, ícones a partir da marca, atualização automática) e `data-density` por dispositivo;
> - rodapé discreto com a versão (`APP_VERSION`).
> Fidelidade alta ao protótipo; nada de cores ou espaçamentos fora dos tokens.

Checklist:
- [ ] Casca idêntica ao protótipo em 1440px e 390px, claro e escuro.
- [ ] Login → primeiro acesso → casca com a empresa ativa; troca de empresa funcionando.
- [ ] Lighthouse PWA "instalável"; navegação por teclado com foco visível.
- [ ] Teste E2E mínimo (Playwright): login e troca de empresa.

**Pronto quando:** o fluxo completo funciona localmente no desktop e no celular (pelo modo de dispositivo do navegador).

---

## E10. Worker base — Claude Code

**Pedido:**
> Crie o entrypoint `worker` em `apps/api` (mesmo código, processo separado) com BullMQ no Valkey: fila de **eventos** (lê `eventos_outbox` e marca processado), fila de **notificações** (grava em `notificacoes`), fila de **e-mail** (SMTP), agendador de tarefas repetidas (cron) e encerramento gracioso. Healthcheck próprio. Testes das filas com Valkey real.

- [ ] Evento gravado numa transação é processado pelo worker uma única vez.
- [ ] Reprocessamento com espera progressiva em caso de falha.

**Pronto quando:** testes passam e o worker sobe e encerra sem perder jobs.

---

## E11. Imagens Docker — Claude Code

**Pedido:**
> Crie `docker/api.Dockerfile` (multi-stage, node 24-alpine, usuário não-root, `HEALTHCHECK`, comandos `node dist/main.js`, `node dist/worker.js` e `node dist/migrate.js`) e `docker/web.Dockerfile` (build Vite → Caddy, sem cache para `index.html` e service worker, cache longo para arquivos com hash, compressão, cabeçalhos de segurança). Receba `APP_VERSION` como build-arg. Adicione `.dockerignore`.

- [ ] Imagens buildam localmente; `docker run` da API responde `/health`.
- [ ] Tamanhos razoáveis (API < 250 MB, web < 60 MB).

**Pronto quando:** `docker compose` de teste com as imagens prontas sobe a aplicação inteira localmente.

---

## E12. CI/CD e hooks — Claude Code

**Pedido:**
> Implemente `.github/workflows/ci-cd.yml` conforme `docs/esteira_deploy.md` (seção 5): jobs quality, test (Postgres+PostGIS e Valkey como serviços, migrações do zero, testes de RLS), security (pnpm audit alto/crítico e gitleaks), build (matriz api/web → GHCR com tags `sha-<commit>` e `latest`, cache do GitHub Actions), deploy (API do Coolify para api, worker e web) e smoke test conferindo a versão em `/health`. Use `concurrency` para um deploy por vez e o ambiente `production`. Mantenha o deploy **desativado** (condição por variável `DEPLOY_ENABLED`) até a E13.

- [ ] Pipeline verde num push de teste (sem deploy).
- [ ] Imagens aparecem em *Packages* do GitHub.

**Pronto quando:** um push na `main` gera as imagens no GHCR com o commit como tag.

---

## E13. Recursos da aplicação no Coolify e primeiro deploy — Ale + Claude Code

1. [ ] Rodar `packages/db/sql/papeis.sql` no `leadtogo-db` (cria `leadtogo_owner` e `leadtogo_app` com senhas fortes).
2. [ ] Criar os 3 recursos (tipo *Docker Image*, registro `ghcr.io`):

| Recurso | Imagem | Comando | Domínio | Limite de memória |
|---|---|---|---|---|
| leadtogo-api | `ghcr.io/<usuario>/leadtogo-api:latest` | padrão (`node dist/main.js`) · **pré-deploy:** `node dist/migrate.js` | `api.crm.aledias.com.br` | 768 MB |
| leadtogo-worker | `ghcr.io/<usuario>/leadtogo-api:latest` | `node dist/worker.js` | — | 512 MB |
| leadtogo-web | `ghcr.io/<usuario>/leadtogo-web:latest` | padrão | `crm.aledias.com.br` | 128 MB |

3. [ ] Variáveis de ambiente de produção (lista no `.env.example`) cadastradas **só no Coolify**; gerar segredos fortes (`openssl rand -base64 32`).
4. [ ] Healthchecks: API `/health`, web `/`, worker (comando de saúde).
5. [ ] Conectar os recursos às redes do banco/cache/Garage e à `leadtogo-net`.
6. [ ] Gerar o **token da API do Coolify** (só deploy) e cadastrar os secrets no GitHub: `COOLIFY_URL`, `COOLIFY_TOKEN`, `COOLIFY_UUID_API`, `COOLIFY_UUID_WORKER`, `COOLIFY_UUID_WEB`.
7. [ ] Ligar `DEPLOY_ENABLED` e fazer um push.

**Pronto quando:** o push passa por toda a esteira, `https://api.crm.aledias.com.br/health` mostra o commit atual e `https://crm.aledias.com.br` abre o login com certificado válido.

---

## E14. Observabilidade e alertas — Ale + Claude Code

- [ ] **Sentry** (nuvem, plano gratuito; ou GlitchTip) em API, worker e web, com `release = APP_VERSION` e sem dados pessoais nos eventos.
- [ ] **Uptime Kuma** (no Coolify): monitores para `app.`, `api./health`, banco e painel do Coolify, com alerta por e-mail/Telegram.
- [ ] **Notificação de deploy:** fluxo no n8n recebendo um webhook do GitHub Actions (sucesso/falha) e avisando no WhatsApp ou Telegram.
- [ ] Logs da API acessíveis no Coolify, com `request_id` para rastrear.

**Pronto quando:** um erro forçado aparece no Sentry com o commit, e desligar a API dispara o alerta do Uptime Kuma.

---

## E15. Segurança e endurecimento — Ale + Claude Code

- [ ] Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options) conferidos em `securityheaders.com`.
- [ ] `/docs` (Swagger) protegido em produção.
- [ ] Rate limit testado no login (bloqueia após várias tentativas).
- [ ] Banco, Valkey e Garage **sem porta pública** (verificar com `nmap` de fora).
- [ ] 2FA obrigatório para administradores.
- [ ] Script de **espelhamento do Garage** para o S3 externo agendado.
- [ ] Revisão de dependências: `pnpm audit` limpo de alto/crítico.
- [ ] Política de privacidade/LGPD: rascunho em `docs/lgpd.md` (dados tratados, base legal, retenção, exclusão).

**Pronto quando:** checklist completo e nenhum alerta alto ou crítico pendente.

---

## E16. Validação final e runbook — Ale + Claude Code

**Testes de aceitação (em produção):**
- [ ] Criar conta e empresa A; convidar um vendedor; criar a empresa B na mesma conta.
- [ ] Trocar entre A e B; o vendedor da A não vê a B.
- [ ] Tema escuro, menu recolhido e preferência mantida após novo login.
- [ ] Instalar o PWA no celular e entrar.
- [ ] **Rollback:** voltar para a imagem `sha-` anterior no Coolify e retornar, sem tempo fora do ar.
- [ ] **Restauração:** recuperar o backup do dia num banco temporário.

**Runbook** (`docs/runbook.md`, o Claude Code cria):
- como fazer deploy, rollback e redeploy manual;
- como restaurar banco e arquivos;
- como girar senhas e tokens;
- o que fazer se a VPS cair (subir numa VPS nova a partir dos backups);
- contatos e acessos (onde ficam, **sem** as senhas).

**Pronto quando:** todos os testes de aceitação passam e o runbook está no repositório.

---

## 4. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Push direto na `main` levar bug à produção | Hooks locais + CI completo; rollback de 1 minuto pela tag `sha-` |
| Falta de memória na VPS (24 GB compartilhados) | Limites por container; build fora da VPS (GHCR); medido na E4 (~5 GB em uso) |
| VPS ARM64 e imagens só amd64 | Conferir `docker manifest inspect` antes de usar qualquer imagem; build do Leadtogo para `linux/arm64` |
| Erro de isolamento entre empresas | RLS forçado, papel sem bypass e teste de isolamento obrigatório no CI |
| Perda de dados | Backup diário externo + teste de restauração na E4 e na E16 |
| Migração quebrar a produção | Regra "expandir e depois contrair"; pré-deploy aborta se falhar; backup antes de mudança destrutiva |
| API pública da Minha Receita instável | Cache em `receita_consultas` + API alternativa (na fase de empresas) |
| Duas cópias do repositório (Windows e WSL) | A cópia oficial passa a ser a do WSL a partir da E2 |

---

## 5. Definição de pronto da Fase 0

- [ ] Todas as etapas E1–E16 marcadas.
- [ ] Pipeline verde e deploy automático funcionando.
- [ ] Login multiempresa em produção com isolamento testado.
- [ ] Casca do app igual ao protótipo (desktop e celular, claro e escuro).
- [ ] Backups externos testados e runbook escrito.
- [ ] Documentos atualizados com qualquer decisão tomada durante a implantação.

**Próximo passo após a Fase 0:** definir o escopo do MVP e implementar as telas de negócio, começando por **Empresas** (com consulta à Receita), que é a base de todo o resto.

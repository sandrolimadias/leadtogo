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
| E7 | Banco: base, papéis, RLS e referências ✅ | Claude Code | E6 | 2 dias |
| E8 | API base (NestJS + Better Auth + tenant) ✅ | Claude Code | E7 | 2–3 dias |
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
- [x] `.github/dependabot.yml` (npm, github-actions, docker e docker-compose; semanal, agrupado). **Ficou de fora do commit do E5: feito junto com o E6.**

✅ **Concluído em 06/10/2026** (commit `506674c`; Dependabot entregue no E6). NestJS 12 em ESM, com a API (`dist/main.js`) e o worker (`dist/worker.js`) no mesmo app; `GET /health` fora do prefixo `/v1`, devolvendo `version`; Swagger em `/docs` só fora de produção; cliente da API com `openapi-typescript` + `openapi-fetch`. **Atenção na E11:** o `db:migrate` usa o `drizzle-kit` (dependência de desenvolvimento); a imagem que roda as migrações no pre-deploy precisa incluí-lo, ou usar o migrador do `drizzle-orm`.
**Pronto quando:** `pnpm install && pnpm lint && pnpm typecheck && pnpm test` passam no WSL (com testes de exemplo).

---

## E6. Ambiente de desenvolvimento local — Claude Code

**Pedido:**
> Crie `docker/compose.dev.yml` com Postgres `imresamu/postgis:17-3.5`, Valkey 8 e **Garage** (S3) com script de init que cria o bucket e a chave, volumes em `docker/.data/`, healthchecks e um script de init que cria os papéis `leadtogo_owner` e `leadtogo_app` e o bucket `leadtogo-arquivos`. Atualize o `.env.example` e documente em `docs/esteira_deploy.md` (seção 9.4). Em commit separado, crie o `.github/dependabot.yml` que ficou pendente do E5 (npm, github-actions e docker; semanal; atualizações agrupadas).

- [x] `pnpm dev:up` sobe os 3 serviços saudáveis e roda o init do Garage (pode ser repetido sem erro). `pnpm dev:down` para; `pnpm dev:reset` apaga `docker/.data/` com confirmação.
- [x] `.env` local criado a partir do `.env.example` (chave S3 fixa **só de desenvolvimento**; em produção vale a chave `leadtogo-app` do Garage da VPS).
- [x] `.github/dependabot.yml` criado (pendência do E5): inclui `docker-compose` em `/docker` e ignora *major* de `imresamu/postgis` e `dxflrs/garage`.
- [x] Hooks do lefthook encontram o Node pelo `.lefthook.rc` (acrescenta o Node 24 do nvm ao PATH; o nome `.lefthookrc` não funciona no `dash`).

**Pronto quando:** `psql` conecta como `leadtogo_app`, `redis-cli ping` responde e o Garage responde em `localhost:3900` (bucket `leadtogo-arquivos` criado pelo script de init).

✅ **Concluído em 06/10/2026** (commits `fb081a0`..`a55d53e`). Verificado: `leadtogo_app` + PostGIS 3.5, `PONG`, Garage `403`. O init do Garage é um script (`docker/garage/init.sh`, chamado pelo `pnpm dev:up`) porque a imagem do Garage não tem shell. Senhas locais dos papéis: `LEADTOGO_OWNER_PASSWORD`/`LEADTOGO_APP_PASSWORD` (padrão `senha`), só no desenvolvimento. Para o `psql` no Ubuntu: `sudo apt install postgresql-client`.

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
> 7. seeds: estados, países, portes, qualificações, **CNAEs** (lista oficial IBGE/CONCLA) e **municípios** (IBGE, com código SIAFI/TOM), a partir de arquivos versionados em `packages/db/seeds/dados/` (fonte e data no README; nada baixado na hora do seed), mais um tenant de demonstração com conta, tenant, configurações e um membro admin. *Os cadastros padrão (grupos de tags Status e Visitação, tipos de atividade, funil com fases) entram quando essas tabelas forem criadas.*
>
> Testes num banco separado `leadtogo_test` (criado pelo init do compose), conectados como `leadtogo_app`; o helper de isolamento descobre as tabelas com `tenant_id` pelo catálogo do Postgres, para que uma tabela nova sem política faça o teste falhar. Antes do código, apresente o plano de commits (extensões e RLS → plataforma → referências → sistema → seeds) e espere a aprovação.
> Siga a regra "expandir e depois contrair" e gere as migrações com drizzle-kit.

Checklist:
- [x] Migrações geradas e aplicadas do zero sem erro (4: extensões e RLS, referências, plataforma, sistema).
- [x] Testes de isolamento passando (RLS) para todas as tabelas com `tenant_id`, com `leadtogo_app` e `leadtogo_owner` (o `FORCE` vale para o dono).
- [x] Seeds idempotentes (rodar duas vezes não duplica nem deixa dado alterado): estados, países, portes, qualificações, 1.332 CNAEs e 5.571 municípios com código IBGE e SIAFI/TOM, mais o tenant de demonstração.
- [x] Script SQL de criação dos papéis para produção em `packages/db/sql/papeis.sql` (idempotente, sem senhas no arquivo).

**Pronto quando:** `pnpm db:migrate && pnpm db:seed && pnpm test` passam do zero, e o Drizzle Studio mostra CNAEs e municípios carregados.

✅ **Concluído e aprovado em 06/10/2026.** Verificado do zero (`pnpm dev:reset && pnpm dev:up && pnpm db:migrate && pnpm db:seed && pnpm test --force`, sem cache): **5 migrações**; **1.332 CNAEs, 5.571 municípios, 27 estados e 255 países** (Receita Federal, código numérico; Brasil = 105); **88 testes** (86 no `packages/db`, 1 na `api`, 1 na `web`). `leadtogo_app` lê as referências e, sem tenant ativo, não vê nenhuma empresa.

> **Regra daqui em diante:** migração destrutiva exige **aviso ao Ale antes** de ser escrita (commit marcado `BREAKING-DB:`). A `0004` (países da Receita) foi a única até aqui.

Como ficou:
- **Banco de teste** `leadtogo_test`: criado por `pnpm dev:up` (repetível) e pelo passo `garantir-bancos.sh` do CI. As migrações rodam no setup global do Vitest. Os testes recusam rodar em banco que não termine em `_test`.
- **Teste de isolamento** em duas camadas: catálogo (toda tabela com `tenant_id` tem RLS habilitado e forçado e políticas de SELECT, INSERT, UPDATE e DELETE) e comportamento, com uma fábrica por tabela em `packages/db/src/testes/fabricas.ts`. Falha se faltar política, fábrica ou se surgir tabela sem `tenant_id` fora da lista de exceções.
- **Países:** `paises` usa a tabela da Receita Federal (255 códigos numéricos, Brasil = 105), não a lista ISO do IBGE, para cobrir territórios de sócios estrangeiros; migração `0004` (`BREAKING-DB`, reposta pelo seed). O ISO de 2 letras não é guardado por enquanto.
- **Seeds de referência:** arquivos versionados em `packages/db/seeds/dados/` (fonte e data no README); o seed não baixa nada. Dos 5.571 municípios, 1 (Boa Esperança do Norte, MT) precisou de correção manual do código SIAFI/TOM; nenhum ficou sem. `pnpm db:seed:referencias` carrega só as referências (uso em produção); `pnpm db:seed` inclui a demonstração (nunca com `NODE_ENV=production`).
- **Papéis em produção:** `LEADTOGO_OWNER_PASSWORD=... LEADTOGO_APP_PASSWORD=... psql -v ON_ERROR_STOP=1 -d leadtogo -f packages/db/sql/papeis.sql`, como superusuário.

**Pendências registradas pelo E7 (não implementadas):**
- **Cadastros padrão do tenant de demonstração:** grupos de tags **Status** e **Visitação**, **tipos de atividade** e **funil com fases** entram no seed quando essas tabelas forem criadas (e também no fluxo de primeiro acesso, E8).
- `membros.usuario_id` e `conta_administradores.usuario_id` sem FK até o E8; o usuário de demonstração deve ser ligado ao membro admin (`DEMONSTRACAO.membroAdminId`) quando o login existir.
- `app_vinculos_do_usuario` (E8) e a função do outbox sem `BYPASSRLS` (E10): direção descrita nos itens do E8 e do E10.
- Job mensal das partições de `auditoria` (E10) e inclusão automática de CNAE novo por função `SECURITY DEFINER` (prospecção).
- `municipios.localizacao` (centro de cada município) fica vazia até a carga das coordenadas.

---

## E8. API base — Claude Code

**Pedido:**
> Leia `docs/configuracao_tecnologia.md` (seções 4, 7 e Multiempresa) e monte a base da API NestJS:
> - configuração validada por Zod (falha ao iniciar se faltar variável);
> - logs estruturados com Pino (`request_id`, `tenant_id`, `user_id`);
> - `GET /health` (banco, Valkey e Garage) retornando `version` = `APP_VERSION`;
> - **Better Auth** só para identidade (**sem** plugin de organizações): e-mail/senha, 2FA TOTP, recuperação de senha, cookies seguros, e login Google preparado mas desligado;
> - fluxo de **primeiro acesso** (`POST /v1/primeiro-acesso` e o comando `dist/criar-conta.js`): cria conta + primeira empresa (tenant) + configurações + membro admin (os cadastros padrão entram quando as tabelas existirem);
> - **guard de tenant**: valida que o usuário é membro ativo da empresa ativa e abre a transação com `SET LOCAL app.tenant_id`; endpoints `/v1/consolidado/*` com `app.tenant_ids` (só leitura);
> - endpoints iniciais: `GET /v1/me` (usuário, empresas, papel em cada uma), `POST /v1/sessao/empresa-ativa`, `GET/PATCH /v1/me/preferencias`;
> - Helmet, CORS restrito a `APP_URL`, rate limit no Valkey (login e API), validação global e filtro de erros padronizado;
> - OpenAPI em `/docs` (protegido em produção) e geração do `packages/api-client`;
> - entrypoint de **migração** (`dist/migrate.js`) usando `DATABASE_MIGRATION_URL`.
> Escreva testes de integração do login, da troca de empresa e do bloqueio entre empresas.

Checklist:
- [x] Login, logout, 2FA, recuperação de senha (e-mail via SMTP de desenvolvimento: Mailpit no compose).
- [x] Criar conta/empresa, convidar membro, trocar empresa ativa.
- [x] Usuário da empresa A recebe 403/404 ao tentar acessar dados da B (`apps/api/src/acesso/isolamento-http.test.ts`, pelas rotas reais; mais uma varredura que falha se alguma rota ficar pública fora da lista).
- [x] **FK de `membros.usuario_id` e `conta_administradores.usuario_id` para `auth.user`**: adicionada na migração que cria o schema `auth` (ficou fora do E7 porque a tabela ainda não existe).
- [x] **Vínculos do usuário (direção definida no E7):** antes de haver tenant ativo, o app precisa saber em quais empresas o usuário é membro. Sem papel com `BYPASSRLS` e sem afrouxar o RLS: uma função `SECURITY DEFINER` mínima, `app_vinculos_do_usuario(usuario_id)`, devolve **só o `tenant_id` e o papel**; pertence ao `leadtogo_owner`, tem `search_path` fixo, `EXECUTE` revogado de `PUBLIC` e concedido apenas ao `leadtogo_app`. O guard de tenant usa essa função e só então abre a transação com `SET LOCAL app.tenant_id`.

**Decisões do E8 (aprovadas em 06/10/2026):**
- **Sem plugin de organizações** do Better Auth: ele só faz identidade; empresas, membros, convites e empresa ativa (`auth.session.empresa_ativa_id`) são nossos, sob RLS (`configuracao_tecnologia.md`, seção 7).
- **Primeiro acesso:** `PRIMEIRO_ACESSO=aberto|fechado` (padrão **fechado em produção**). O comando `node dist/criar-conta.js` faz o mesmo fluxo pelo terminal, para criar a primeira conta na VPS (documentado em `esteira_deploy.md`).
- **Better Auth** montado por `toNodeHandler` em `/v1/auth/*`, com guard próprio; o parser de corpo do Nest não pode consumir o corpo dessa rota. Senha com scrypt. Verificação de e-mail obrigatória em produção (flag). Cliente Valkey: `ioredis` 5.x.
- **2FA obrigatório para admin:** o guard deixa passar `GET /v1/me`, as rotas de ativação do 2FA e o logout; as demais respondem `403 2fa_obrigatorio`.
- **Consolidado** (`/v1/consolidado/*`): só para quem está em `conta_administradores` (dono ou administrador); `app.tenant_ids` recebe **todas as empresas da conta**; transação somente leitura.
- **Cookies e CORS** para `crm.aledias.com.br` (front) e `api.crm.aledias.com.br` (API): ver `configuracao_tecnologia.md`, seção 7.
- `GET /v1/membros` (leitura) entra para provar o isolamento por HTTP e servir à tela de equipe.
- Mudança de rumo (cache da sessão, UUID v7 do Better Auth): avisar o Ale **antes** de contornar.

**Pronto quando:** testes de integração passam e o Swagger mostra os endpoints.

✅ **Concluído em 06/10/2026** (aprovado pelo Ale). Verificado do zero (`dev:reset`, `dev:up`, `db:migrate`, `db:seed`, `test --force`, sem cache): **8 migrações**; **342 testes** (`shared` 19, `api-client` 4, `web` 1, `db` 117, `api` 201). Sessões ficam só no Postgres e o Valkey atende o rate limit do Better Auth (`customStorage`); o Better Auth só faz identidade. Achado de segurança tratado: ele desliga a validação de `redirectTo` em `NODE_ENV=test`, e agora ela fica ligada em qualquer ambiente. Pendências: SMTP de produção, teste de login real com os dois domínios e criação da primeira conta (E13); Garage no CI (E12).

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

### E9: divisão em sub-etapas e componentes do design system

O E9 é entregue em partes: **E9a** componentes base e catálogo (`/dev/catalogo`); **E9b** camada de autenticação e telas de acesso; **E9c** casca do app (navegação, seletor de empresa, barra superior, celular).

**Catálogo espelhado.** `apps/web/src/dev/catalogo.tsx` tem as mesmas seções, na mesma ordem e com os mesmos exemplos de `docs/design-system/catalogo.html`. Os componentes React seguem `components/bundle.css` (dimensões, bordas, estados) e `index.d.ts` (props); o Radix só entrega comportamento e acessibilidade. A conferência é automática: `pnpm --filter @leadtogo/web comparar:catalogos` captura cada seção dos dois catálogos a 1440 px nos temas claro e escuro (e `DENSIDADE=Compacta|Toque`) com o Playwright, grava em `~/projetos/leadtogo-capturas/catalogo/` e lista os pixels diferentes. Resultado: todas as seções implementadas ficam com 0 pixel de diferença, salvo a dica (Tooltip), que no React é desenhada num portal e por isso não é cortada pela borda do quadro (1 coluna de pixels).

**Componentes que ficam para as telas de negócio** (aparecem no catálogo como "pendente (etapa …)"; recriar a partir de `bundle.css`/`bundle.js` e conferir com `comparar:catalogos`):

| Componente | Etapa | Observação |
|---|---|---|
| `StatTile` (com `Sparkline`) | MVP · Dashboard | indicadores; valores tabulares, delta com "vs. período" |
| `StatusPill` | MVP · Oportunidades | status Ativo/Conquistado/Perdido/Cancelado/Suspenso, sempre com ícone e palavra |
| `ActivityIcon` | MVP · Atividades | bolha por tipo; também usada em `DealCard`/`TaskCard` |
| `PriorityMarks` | MVP · Atividades | Importante (estrela) e Urgente (raio) |
| `ActivityTimeline` | MVP · Atividades | linha do tempo das fichas |
| `TaskCard` | MVP · Tarefas | card do quadro de tarefas, com checklist |
| `DealCard` | MVP · Oportunidades | card do Kanban |
| `KanbanColumn` | MVP · Oportunidades | coluna de 296 px com total e limite; arrastar com dnd |
| `DataTable` | MVP · Empresas | tabela com seleção, ordenação e densidade compacta (reaproveitada em Contatos) |
| `TelaFunil` | MVP · Oportunidades | exemplo de tela: só vale quando os acima existirem |

Já prontos para o E9b/E9c: `AppNav`, `TenantSwitcher`, `MenuList`/`Menu`, `Toast` + `toast.*` (Sonner), `Alert`, campo com `suffix`, `Avatar`/`AvatarGroup`, `Icon`, `PainelDoDialogo`.

### E9c. Casca do app — ⏳ aguardando aprovação

Entregue:

- **Desktop (≥ 1024 px):** menu lateral de 248 px, **recolhível** a 64 px (a preferência é salva por usuário em `membros.preferencias`, via `PATCH /v1/me/preferencias`, com troca otimista), seletor de empresa (menu "Suas empresas" com a ativa marcada; trocar mantém a tela e avisa "Empresa ativa trocada"), barra superior (busca global, "Registrar atividade", sino com painel de notificações), menu do usuário (Meu perfil → Segurança, tema Claro/Escuro/Sistema, Sair, versão) e atalho de Configurações.
- **Tablet (768–1023 px):** trilho de ícones sempre recolhido, controles de toque.
- **Celular (< 768 px):** cabeçalho de 56 px (título, busca, sino, avatar), barra inferior de 68 px (Início, Empresas, Funil, Tarefas, Mais) e **folha de perfil** (usuário, **empresa ativa com a lista para trocar**, Meu perfil → Segurança, tema, Sair, versão). Avisos acima da barra inferior. Densidade de toque.
- **Seletor de empresa quando não há empresa ativa:** tela "Escolha a empresa" no lugar do app (`GET /v1/me` → `precisaEscolherEmpresa`), para quem tem várias empresas e nenhuma usada antes. A API já abre a sessão na última empresa usada ou na única da pessoa.
- **Telas** `Dashboard`, `Empresas`, `Contatos`, `Oportunidades`, `Tarefas`, `Prospecção`, `Rotas` e `Configurações` como páginas "Em construção" (EmptyState) dentro da casca; `Meu perfil → Segurança` completo (E9b + 2FA para todos).
- **Tema** claro/escuro/sistema salvo por usuário (e no aparelho, para não piscar). `AppNav`/`TenantSwitcher` ganharam as variações recolhida, links do roteador e logotipo, sem alterar o catálogo (0 pixel de diferença no `comparar:catalogos`).
- **Testes:** 15 de casca em jsdom (desktop, tablet, celular, seletor, tema, recolher, troca) e 2 E2E (duas empresas: seletor no login, última usada, troca pelo menu, menu recolhido que sobrevive ao recarregar; celular: barra inferior, folha de perfil, troca e Segurança). Capturas: `pnpm --filter @leadtogo/web capturar:casca` → `~/projetos/leadtogo-capturas/casca/` (1440, 820 e 390 px, claro e escuro).

Ficam para as telas de negócio (hoje avisam "chega nas próximas etapas"): busca global, "Registrar atividade", notificações reais (o sino abre o painel vazio), contadores do menu (Oportunidades "paradas", Tarefas), "Painel consolidado" e "Criar empresa" no seletor, e o PWA (`vite-plugin-pwa`, manifest e ícones), que segue pendente do E9.

### Pendências registradas para as próximas etapas (2FA para todos)

- **E9c (casca):** na folha de perfil, **Meu perfil → Segurança** para qualquer usuário: ativar o 2FA (reaproveitando a ativação de `src/telas/acesso/ativar-dois-fatores.tsx`), **desativar** (senha + código; escondido quando `GET /v1/me` traz `doisFatoresObrigatorio`) e **gerar novos códigos de recuperação**. A API (política por empresa, guard, gancho de desativação) já está pronta; a rota `/perfil/seguranca` existe como ponto de partida.
- **MVP · Configurações:** a **tela da política de 2FA** da empresa (Segurança: admin · admin e gestor · todos), usando `GET/PATCH /v1/configuracoes/seguranca` (só admin). Hoje a política só muda pela API.
- **Contração (depois):** remover `app_vinculos_do_usuario` quando nada mais a usar (a API passou a usar `app_vinculos_com_politica`).

### E9c (ajustes) e E9d: PWA, densidade e teclado — ⏳ E9 inteiro aguardando aprovação

**Ajustes do E9c (aprovado)**
- Menu: "Rotas" (Fase 3) fora; entram "Painel consolidado" (administrador da conta) e "Configurações" (administrador), como no protótipo. O seletor de empresa do administrador da conta traz "Painel consolidado" e "Criar empresa" (esta avisa "em breve"). Confirmado por teste.
- Conteúdo das telas de listagem e dashboard: padding 24 px (16 no celular), gap 20 px, largura máxima 1400 px, alinhado ao menu; as telas de formulário (Segurança) mantêm a coluna estreita. Textos "Em breve: …" para o usuário, sem jargão de etapa.
- Segurança diz o motivo real: `GET /v1/me` traz `doisFatoresMotivo` (administrador da conta, ou a política da empresa X para o papel dele).
- `pnpm --filter @leadtogo/web comparar:casca`: compara, no tema claro e no escuro, o menu aberto e recolhido, a barra superior, o seletor de empresa aberto (também com o menu recolhido) e, no celular, o cabeçalho, a barra inferior e a folha de perfil contra o protótipo (`~/projetos/leadtogo-capturas/casca-comparacao/`). Diferenças que ficam, por decisão registrada: contadores do menu ("2 paradas", 7) e o selo do sino (não há dados ainda); "Administrador" no lugar de "Admin" (rótulo do design system); cor do logotipo da empresa derivada do nome (o protótipo fixa a cor por empresa); menu do usuário no rodapé do menu (Meu perfil → Segurança, tema, Sair) no lugar do botão "Sair"; na folha do celular, "Meu perfil → Segurança" e o seletor de tema a mais; a pílula "Início" do cabeçalho do celular segue o protótipo. O que restou de pixels nas regiões é, fora isso, antialiasing.
- Relay do outbox: `OUTBOX_INTERVALO_MS` já era variável de ambiente (padrão 2000 ms); os testes passaram a usar 200 ms.

**E9d**
- **PWA** (`vite-plugin-pwa`, só no build): manifest (nome, standalone, `theme_color`, `background_color`, pt-BR), ícones PNG commitados em `apps/web/public/icons` (192, 512, maskable 512 e apple-touch; gerados por `pnpm --filter @leadtogo/web gerar:icones` a partir da marca), atualização automática (`autoUpdate`, `skipWaiting`, `clientsClaim`). O service worker guarda só a casca estática; `/v1`, `/health` e `/docs` nunca são interceptados (a leitura offline e a fila entram nas etapas de dados).
- **Instalável:** `pnpm --filter @leadtogo/web verificar:pwa` faz o build de produção, sobe o preview e confere manifest, ícones (tamanho real), service worker ativo e controlando a página, **instalável** (a checagem do próprio Chrome, `Page.getInstallabilityErrors`, sem erros), casca sem rede, versão no rodapé e `data-density`. Lighthouse 11.7.1 (a última com a categoria PWA; da 12 em diante ela foi removida): `installable-manifest`, `splash-screen`, `themed-omnibox` e `maskable-icon` com nota 1 (relatório em `~/projetos/leadtogo-capturas/pwa/lighthouse-pwa.json`; comando: `CHROME_PATH=<chromium do Playwright> npx lighthouse@11 <url>/login --only-categories=pwa --chrome-flags="--headless=new --no-sandbox"`).
- **Densidade por dispositivo:** `data-density="touch"` no `<html>` no celular e no tablet (inclui diálogos e menus fora da casca); padrão no desktop. Alvos de 44 px no celular conferidos.
- **Versão no rodapé:** "Leadtogo · versão X" no rodapé do menu lateral, na folha de perfil e no painel das telas de acesso; `APP_VERSION` do ambiente do build (`dev` sem ela). **Para o Dockerfile do web (E11):** passar `APP_VERSION` como argumento de build.
- **Teclado na casca:** link "Pular para o conteúdo" como primeiro item da tabulação, ordem de Tab (menu, empresa, telas, usuário, busca, ações), menus de empresa e de usuário só por teclado (Enter, setas, Esc devolve o foco) e a folha de perfil prendendo o foco; 5 testes.

### E9b. Camada de autenticação e telas de acesso — ⏳ aguardando aprovação

Entregue (commits `5a084b3`, `5c9b51a`, `910593f`, `ec2a38c` e os seguintes):

- **API:** `GET /v1/primeiro-acesso/estado` (público, `{ aberto }`) e `GET /v1/acesso/opcoes` (público, `{ loginGoogle }`; o "Entrar com Google" só aparece se a API o liga). Os dois entram na rede de segurança das rotas públicas; `openapi.json` e `api-client` regenerados. O link de confirmação de e-mail agora volta para `/verificar-email?confirmado=1`.
- **Camada de autenticação (`apps/web/src/auth`):** cliente oficial do Better Auth com o plugin de 2FA em `/v1/auth`; todas as chamadas das telas passam pela interface `ServicosDeAcesso` (a real em `servicos.ts`; os testes usam serviços de mentira); guardas de rotas (sem sessão → `/login?redirect=…`; administrador com `doisFatoresPendente` → `/ativar-2fa` e a casca fica bloqueada até ativar; quem já entrou não vê o login); erros do Better Auth e da API traduzidos para pt-BR (`erros.ts`), sem texto em inglês e sem revelar se um e-mail existe.
- **Telas (`apps/web/src/telas/acesso`, rotas `_acesso.*`):** `/login`, `/verificacao` (2FA no login: código de 6 dígitos ou de recuperação, "confiar neste aparelho"), `/ativar-2fa` (senha → QR code e chave manual → código → códigos de recuperação), `/esqueci-senha`, `/confira-seu-email`, `/redefinir-senha`, `/verificar-email`, `/convite`, `/primeiro-acesso` (mostra uma mensagem clara quando `estado` responde fechado).
- **Comportamento:** foco no primeiro campo, Enter envia, erro ligado ao campo (`aria-describedby`/`aria-invalid`) com foco no primeiro inválido, botão com `loading` e trava contra duplo envio.
- **Testes:** 84 no web (jsdom, fluxos completos pelo roteador real com serviços falsos) e 8 E2E com Playwright contra API, worker, banco e Mailpit reais (`pnpm --filter @leadtogo/web e2e`: sobe a API em :3100, o worker e o Vite em :5183, usa o banco de desenvolvimento com e-mails únicos e o Valkey 2). Cenários: login e ativação obrigatória do 2FA (inclui código de recuperação), recuperação de senha, aceite de convite (conta nova e existente), primeiro acesso, mensagens genéricas. O E12 deve rodar o E2E no CI.
- **Capturas:** `pnpm --filter @leadtogo/web capturar:acesso` (API simulada pelo Playwright) grava as 22 telas × 1440/390 px × claro/escuro em `~/projetos/leadtogo-capturas/acesso/`.

Diferenças em relação ao protótipo `Acesso.dc.html` (o documento e a API valem):

- Sem "Continuar com Google" no cadastro e sem "Aceitar com Google" no convite: o Google não cria conta (`disableSignUp`). No login, só se `LOGIN_GOOGLE` estiver ligado.
- Sem "Consultar" CNPJ pela Receita, sem "Segmento principal" e sem a lista de cadastros padrão: nada disso existe ainda (chegam com Empresas e Configurações). O CNPJ é opcional e validado; a tela "Tudo pronto" lista o que foi criado de verdade (conta, empresa, papel).
- Sem o texto "5 tentativas travam por 15 minutos" (não é a regra da API; o limite é por IP e a mensagem de 429 é genérica) e sem "Abrir o link (simulação)" nem "Para o protótipo, use 123456".
- "Salvar e entrar" virou "Salvar nova senha" e leva ao login: o Better Auth não abre sessão ao redefinir e o link não carrega o e-mail.
- Botões de envio ficam habilitados (a validação explica o que falta e o Enter funciona); no protótipo ficavam desativados.
- Links no acento do design system (o protótipo usava o azul padrão do navegador). A ativação do 2FA pede a senha antes (exigência do Better Auth) e mostra os códigos de recuperação.
- `/` hoje é só um marcador "Leadtogo" com "Sair"; a casca do app é o E9c.

---

## E10. Worker base — Claude Code

**Pedido:**
> Crie o entrypoint `worker` em `apps/api` (mesmo código, processo separado) com BullMQ no Valkey: fila de **eventos** (lê `eventos_outbox` e marca processado), fila de **notificações** (grava em `notificacoes`), fila de **e-mail** (SMTP), agendador de tarefas repetidas (cron) e encerramento gracioso. Healthcheck próprio. Testes das filas com Valkey real.

- [x] Evento gravado numa transação é processado pelo worker uma única vez (relay do outbox; três relays concorrentes sobre 120 eventos: um efeito por evento; consumidores idempotentes).
- [x] Reprocessamento com espera progressiva em caso de falha (5 s, 10 s, 20 s… até 1 h; esgotadas as tentativas, `falhou_em` e payload apagado).
- [x] **Outbox sem `BYPASSRLS`:** `app_reservar_eventos` (`SECURITY DEFINER`, `FOR UPDATE SKIP LOCKED`) devolve só `(id, tenant_id)`; cada evento roda numa transação com o tenant ativo (migração 0008).
- [x] **E-mails pela fila:** identidade cifrada (AES-256-GCM, `v1:`) na fila `email` com reenvio; convite pelo outbox com token gerado pelo worker (só o hash no banco); falha ao enfileirar derruba a requisição (503); SMTP com limite de 10 s.
- [x] **Partições de `auditoria`:** job mensal (e na partida) via `app_manter_particoes_auditoria`, sem usar o owner.
- [x] **Limpezas:** convites cancelados/vencidos há mais de 30 dias e outbox entregue há mais de 14 dias, por funções `SECURITY DEFINER` com prazos fixos e lotes limitados (migração 0009).
- [x] **Jobs agendados** com `upsertJobScheduler`; dois workers (em processo e como processos reais) não duplicam.
- [x] **Healthcheck** (`node dist/saude-worker.js`, só loopback) e **encerramento gracioso** (30 s; Coolify 45 s), provado com o `dist/worker.js` real: nenhum job se perde.
- [ ] *(E14)* Alerta para eventos do outbox com `falhou_em` preenchido.

**Pronto quando:** testes passam e o worker sobe e encerra sem perder jobs.

✅ **Concluído em 06/10/2026** (aprovado pelo Ale). Verificado do zero (`dev:reset`, `dev:up`, `db:migrate`, `db:seed`, `test --force`, sem cache): **10 migrações**; **396 testes** (`shared` 19, `api-client` 4, `web` 1, `db` 134, `api` 238). Sem `BYPASSRLS`: três funções `SECURITY DEFINER` no E10 (reserva do outbox, partições e limpezas). Pendências para o Ale: cadastrar `TOKEN_ENCRYPTION_KEY` e o **stop timeout de 45 s** do worker no Coolify (E13); alerta de eventos com `falhou_em` (E14).

---

## E11. Imagens Docker — Claude Code

**Pedido:**
> Crie `docker/api.Dockerfile` (multi-stage, node 24-alpine, usuário não-root, `HEALTHCHECK`, comandos `node dist/main.js`, `node dist/worker.js` e `node dist/migrate.js`) e `docker/web.Dockerfile` (build Vite → Caddy, sem cache para `index.html` e service worker, cache longo para arquivos com hash, compressão, cabeçalhos de segurança). Receba `APP_VERSION` como build-arg. Adicione `.dockerignore`.

- [ ] Imagens buildam localmente; `docker run` da API responde `/health`.
- [ ] Tamanhos razoáveis (API < 250 MB, web < 60 MB).
- [ ] **Dockerfile do web:** copiar `docs/design-system/` para dentro do contexto do build **antes** do `vite build`. As cópias de `tokens.css`, `tailwind-theme.css` e das fontes em `apps/web` não estão no Git (geradas por `scripts/sincronizar-design-system.mjs` no `prebuild`); sem a pasta no contexto o build da imagem falha. O `.dockerignore` não pode excluir `docs/design-system/`.

**Pronto quando:** `docker compose` de teste com as imagens prontas sobe a aplicação inteira localmente.

---

## E12. CI/CD e hooks — Claude Code

**Pedido:**
> Implemente `.github/workflows/ci-cd.yml` conforme `docs/esteira_deploy.md` (seção 5): jobs quality, test (Postgres+PostGIS e Valkey como serviços, migrações do zero, testes de RLS), security (pnpm audit alto/crítico e gitleaks), build (matriz api/web → GHCR com tags `sha-<commit>` e `latest`, cache do GitHub Actions), deploy (API do Coolify para api, worker e web) e smoke test conferindo a versão em `/health`. Use `concurrency` para um deploy por vez e o ambiente `production`. Mantenha o deploy **desativado** (condição por variável `DEPLOY_ENABLED`) até a E13.

- [ ] Pipeline verde num push de teste (sem deploy).
- [ ] Imagens aparecem em *Packages* do GitHub.
- [ ] **Playwright no CI:** os testes E2E do web (login, troca de empresa, 2FA, teclado) também rodam no pipeline, com API, Postgres, Valkey e Mailpit como serviços e o Chromium instalado no job (`playwright install --with-deps chromium`).

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
3a. [ ] **A decidir:** domínio único. Em produção, o Traefik roteia `crm.aledias.com.br/v1` (que inclui o Better Auth em `/v1/auth/*`) para a API, e o front fala com a API no mesmo domínio: sem CORS e sem cookie entre subdomínios. O `api.crm.aledias.com.br` continua para as integrações (n8n, webhooks). Se adotado, o front usa caminho relativo (como o proxy do desenvolvimento) e `APP_URL`/`API_URL`/cookies são ajustados.
4. [ ] Healthchecks: API `/health`, web `/`, worker (`node dist/saude-worker.js`). **Stop timeout do worker: 45 s** (esteira_deploy.md, 7.1.1).
5. [ ] Conectar os recursos às redes do banco/cache/Garage e à `leadtogo-net`.
6. [ ] Gerar o **token da API do Coolify** (só deploy) e cadastrar os secrets no GitHub: `COOLIFY_URL`, `COOLIFY_TOKEN`, `COOLIFY_UUID_API`, `COOLIFY_UUID_WORKER`, `COOLIFY_UUID_WEB`.
7. [ ] Ligar `DEPLOY_ENABLED` e fazer um push.
8. [ ] **Cadastrar `TOKEN_ENCRYPTION_KEY` no Coolify** (API e worker; `openssl rand -base64 32`; sem ela a API não sobe em produção). **Escolher o provedor de SMTP de produção** (recuperação de senha, verificação de e-mail e convites) e cadastrar as variáveis `SMTP_*` no Coolify. Até lá, `VERIFICACAO_EMAIL` fica desligada em produção (nenhum e-mail sai).
9. [ ] **Teste de login real com os dois domínios** (`https://crm.aledias.com.br` → `https://api.crm.aledias.com.br`): cookie de sessão emitido pela API (`HttpOnly`, `Secure`, `SameSite=Lax`), CORS com credenciais só para o front, login, `GET /v1/me` e logout pelo navegador.
10. [ ] **Criar a primeira conta** pelo terminal do Coolify (`PRIMEIRO_ACESSO` fica `fechado`): `node dist/criar-conta.js` (ver `esteira_deploy.md`).

**Pronto quando:** o push passa por toda a esteira, `https://api.crm.aledias.com.br/health` mostra o commit atual e `https://crm.aledias.com.br` abre o login com certificado válido.

---

## E14. Observabilidade e alertas — Ale + Claude Code

- [ ] **Sentry** (nuvem, plano gratuito; ou GlitchTip) em API, worker e web, com `release = APP_VERSION` e sem dados pessoais nos eventos.
- [ ] **Uptime Kuma** (no Coolify): monitores para `app.`, `api./health`, banco e painel do Coolify, com alerta por e-mail/Telegram.
- [ ] **Notificação de deploy:** fluxo no n8n recebendo um webhook do GitHub Actions (sucesso/falha) e avisando no WhatsApp ou Telegram.
- [ ] Logs da API acessíveis no Coolify, com `request_id` para rastrear.
- [ ] **Alerta de eventos esgotados:** avisar (Uptime Kuma/n8n) quando houver linhas em `eventos_outbox` com `falhou_em` preenchido, ou seja, eventos que esgotaram as tentativas (e-mails e notificações que não saíram). Mesmo critério para jobs falhos acumulados nas filas do BullMQ.

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

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
| E9 | Web base (casca do app + login) ✅ | Claude Code | E8 | 3 dias |
| E10 | Worker base (filas e eventos) ✅ | Claude Code | E8 | 1 dia |
| E11 | Imagens Docker ✅ | Claude Code | E8–E10 | 0,5 dia |
| E12 | CI/CD e hooks locais ✅ | Claude Code | E11 | 1 dia |
| E13 | Recursos da aplicação no Coolify e 1º deploy ✅ | Ale + Claude Code | E4, E12 | 3–4 h |
| E14 | Observabilidade e alertas ✅ | Ale + Claude Code | E13 | 2–3 h |
| E15 | Segurança e endurecimento ✅ | Ale + Claude Code | E13 | 0,5 dia |
| E16a | Telas de gestão multiempresa ✅ | Claude Code | E9, E15 | 3–4 dias |
| E16 | Validação final e runbook ✅ | Ale + Claude Code | todas | 0,5 dia |

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
| `crm.aledias.com.br` | Aplicação web (PWA) **e** a API em `/v1` (o Traefik manda `/v1` para a API e o resto para o web): é o único endereço que os usuários acessam |
| `api.crm.aledias.com.br` | API para integrações servidor a servidor (webhooks, n8n, Evolution) e health check da esteira |
| `files.crm.aledias.com.br` | Garage (só se for preciso acesso externo direto) |
| `t.crm.aledias.com.br` | Rastreamento de e-mail (fase futura) |
| `status.crm.aledias.com.br` | Página do Uptime Kuma (opcional) |

Passos no painel de DNS de `aledias.com.br` (Registro.br, Cloudflare ou onde estiver):
- [ ] Registro **A** `crm` → IP da VPS.
- [ ] Registro **A** `*.crm` (curinga) → IP da VPS. Cobre `api.crm`, `files.crm`, `t.crm` e `status.crm` de uma vez. Se o painel não aceitar curinga, crie um registro A para cada um.
- [ ] TTL de 300 segundos (5 min) durante a implantação.
- [ ] Se o DNS estiver na Cloudflare: proxy **desligado** (nuvem cinza) até os certificados do Coolify serem emitidos; depois pode ligar com SSL "Full (strict)".
- [ ] Se existir um registro **CAA** no domínio, ele precisa permitir `letsencrypt.org`.

> **Cookies de login:** com o domínio único, o cookie de sessão é só do host `crm.aledias.com.br` (sem `Domain`) e o front chama a API na mesma origem: não há CORS nem cookie entre subdomínios.

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
- **Domínio único** (`crm.aledias.com.br`: `/v1` para a API, resto para o web), cookie só do host e sem CORS para o front: ver `configuracao_tecnologia.md`, seção 7.
- `GET /v1/membros` (leitura) entra para provar o isolamento por HTTP e servir à tela de equipe.
- Mudança de rumo (cache da sessão, UUID v7 do Better Auth): avisar o Ale **antes** de contornar.

**Pronto quando:** testes de integração passam e o Swagger mostra os endpoints.

✅ **Concluído em 06/10/2026** (aprovado pelo Ale). Verificado do zero (`dev:reset`, `dev:up`, `db:migrate`, `db:seed`, `test --force`, sem cache): **8 migrações**; **342 testes** (`shared` 19, `api-client` 4, `web` 1, `db` 117, `api` 201). Sessões ficam só no Postgres e o Valkey atende o rate limit do Better Auth (`customStorage`); o Better Auth só faz identidade. Achado de segurança tratado: ele desliga a validação de `redirectTo` em `NODE_ENV=test`, e agora ela fica ligada em qualquer ambiente. Pendências: SMTP de produção, teste de login real com os dois domínios e criação da primeira conta (E13); Garage no CI (E12).

---

## E9. Web base (casca do app) — Claude Code ✅ aprovado em 07/10/2026

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
- [x] Casca idêntica ao protótipo em 1440px e 390px, claro e escuro (`comparar:casca`; diferenças registradas).
- [x] Login → primeiro acesso → casca com a empresa ativa; troca de empresa funcionando.
- [x] Lighthouse PWA "instalável"; navegação por teclado com foco visível.
- [x] Teste E2E mínimo (Playwright): login e troca de empresa.

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

### E9c. Casca do app — ✅ aprovado em 07/10/2026

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

### E9c (ajustes) e E9d: PWA, densidade e teclado — ✅ E9 aprovado em 07/10/2026

**Ajustes do E9c (aprovado)**
- Menu: "Rotas" (Fase 3) fora; entram "Painel consolidado" (administrador da conta) e "Configurações" (administrador), como no protótipo. O seletor de empresa do administrador da conta traz "Painel consolidado" e "Criar empresa" (esta avisa "em breve"). Confirmado por teste.
- Conteúdo das telas de listagem e dashboard: padding 24 px (16 no celular), gap 20 px, largura máxima 1400 px, alinhado ao menu; as telas de formulário (Segurança) mantêm a coluna estreita. Textos "Em breve: …" para o usuário, sem jargão de etapa.
- Segurança diz o motivo real: `GET /v1/me` traz `doisFatoresMotivo` (administrador da conta, ou a política da empresa X para o papel dele).
- `pnpm --filter @leadtogo/web comparar:casca`: compara, no tema claro e no escuro, o menu aberto e recolhido, a barra superior, o seletor de empresa aberto (também com o menu recolhido) e, no celular, o cabeçalho, a barra inferior e a folha de perfil contra o protótipo (`~/projetos/leadtogo-capturas/casca-comparacao/`). Diferenças que ficam, por decisão registrada: contadores do menu ("2 paradas", 7) e o selo do sino (não há dados ainda); "Administrador" no lugar de "Admin" (rótulo do design system); cor do logotipo da empresa derivada do nome (o protótipo fixa a cor por empresa); menu do usuário no rodapé do menu (Meu perfil → Segurança, tema, Sair) no lugar do botão "Sair"; na folha do celular, "Meu perfil → Segurança" e o seletor de tema a mais; a pílula "Início" do cabeçalho do celular segue o protótipo. O que restou de pixels nas regiões é, fora isso, antialiasing.
- Testes: `turbo --concurrency=2` (variável `TURBO_CONCURRENCY`) e Vitest do web com 2 workers, sem aumentar prazos. `pnpm verificar:zero --sem-e2e` (migrações, seed, lint, tipos e testes em bancos temporários) levou **199 s, 198 s e 185 s** em 3 execuções seguidas sem falha com concorrência 2; com 3 levou 189, 201 e 192 s (sem ganho); com 1, cerca de 300 s. Com o E2E (11 cenários, ~1 min 40 s) a verificação completa fica em torno de 5 min.
- Relay do outbox: `OUTBOX_INTERVALO_MS` já era variável de ambiente (padrão 2000 ms); os testes passaram a usar 200 ms.

**E9d**
- **PWA** (`vite-plugin-pwa`, só no build): manifest (nome, standalone, `theme_color`, `background_color`, pt-BR), ícones PNG commitados em `apps/web/public/icons` (192, 512, maskable 512 e apple-touch; gerados por `pnpm --filter @leadtogo/web gerar:icones` a partir da marca), atualização automática (`autoUpdate`, `skipWaiting`, `clientsClaim`). O service worker guarda só a casca estática; `/v1`, `/health` e `/docs` nunca são interceptados (a leitura offline e a fila entram nas etapas de dados).
- **Instalável:** `pnpm --filter @leadtogo/web verificar:pwa` faz o build de produção, sobe o preview e confere manifest, ícones (tamanho real), service worker ativo e controlando a página, **instalável** (a checagem do próprio Chrome, `Page.getInstallabilityErrors`, sem erros), casca sem rede, versão no rodapé e `data-density`. Lighthouse 11.7.1 (a última com a categoria PWA; da 12 em diante ela foi removida): `installable-manifest`, `splash-screen`, `themed-omnibox` e `maskable-icon` com nota 1 (relatório em `~/projetos/leadtogo-capturas/pwa/lighthouse-pwa.json`; comando: `CHROME_PATH=<chromium do Playwright> npx lighthouse@11 <url>/login --only-categories=pwa --chrome-flags="--headless=new --no-sandbox"`).
- **Densidade por dispositivo:** `data-density="touch"` no `<html>` no celular e no tablet (inclui diálogos e menus fora da casca); padrão no desktop. Alvos de 44 px no celular conferidos.
- **Versão no rodapé:** "Leadtogo · versão X" no rodapé do menu lateral, na folha de perfil e no painel das telas de acesso; `APP_VERSION` do ambiente do build (`dev` sem ela). **Para o Dockerfile do web (E11):** passar `APP_VERSION` como argumento de build.
- **Teclado na casca:** link "Pular para o conteúdo" como primeiro item da tabulação, ordem de Tab (menu, empresa, telas, usuário, busca, ações), menus de empresa e de usuário só por teclado (Enter, setas, Esc devolve o foco) e a folha de perfil prendendo o foco; 5 testes.

### E9b. Camada de autenticação e telas de acesso — ✅ aprovado em 07/10/2026

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
- [x] **Healthcheck** (`node dist/saude-worker.js`, só loopback) e **encerramento gracioso** (30 s por padrão; em produção 8 s, porque o Coolify ignora o stop timeout e o Docker mata em 10 s), provado com o `dist/worker.js` real: nenhum job se perde.
- [ ] *(E14)* Alerta para eventos do outbox com `falhou_em` preenchido.

**Pronto quando:** testes passam e o worker sobe e encerra sem perder jobs.

✅ **Concluído em 06/10/2026** (aprovado pelo Ale). Verificado do zero (`dev:reset`, `dev:up`, `db:migrate`, `db:seed`, `test --force`, sem cache): **10 migrações**; **396 testes** (`shared` 19, `api-client` 4, `web` 1, `db` 134, `api` 238). Sem `BYPASSRLS`: três funções `SECURITY DEFINER` no E10 (reserva do outbox, partições e limpezas). Pendências para o Ale: cadastrar `TOKEN_ENCRYPTION_KEY` e o **stop timeout de 45 s** do worker no Coolify (E13); alerta de eventos com `falhou_em` (E14).

---

## E11. Imagens Docker — Claude Code ✅ aprovado em 07/10/2026

**Pedido:**
> Crie `docker/api.Dockerfile` (multi-stage, node 24-alpine, usuário não-root, `HEALTHCHECK`, comandos `node dist/main.js`, `node dist/worker.js` e `node dist/migrate.js`) e `docker/web.Dockerfile` (build Vite → Caddy, sem cache para `index.html` e service worker, cache longo para arquivos com hash, compressão, cabeçalhos de segurança). Receba `APP_VERSION` como build-arg. Adicione `.dockerignore`.

Entregue (detalhes em `esteira_deploy.md`, seção 6):

- `docker/api.Dockerfile`: estágio de build em `$BUILDPLATFORM`, dependências de **produção** instaladas na arquitetura de destino e podadas, base final `node:24-alpine`, usuário `node`, `tini` como PID 1, sem `drizzle-kit` nem npm/yarn/corepack, `HEALTHCHECK node dist/saude.js` (detecta API ou worker; `PAPEL` força), labels OCI e `APP_VERSION`/`GIT_SHA` como build-args.
- `docker/web.Dockerfile` + `docker/web.Caddyfile`: build do Vite (com `docs/design-system/` no contexto), `caddy:2-alpine` na porta 8080 sem root, SPA, cache (sem cache para `index.html`, `sw.js`, `registerSW.js` e manifest; `immutable` por 1 ano nos arquivos com hash), compressão, HSTS, CSP `connect-src 'self'` sem domínios externos e os demais cabeçalhos.
- `.dockerignore` (sem `node_modules`, `dist`, `.git`, `.env`, `docker/.data`, testes e a documentação, exceto `docs/design-system/`).
- `docker/compose.imagens.yml` (+ `compose.imagens.arm64.yml`) e `pnpm imagens:testar`: sobe as imagens contra o Postgres, Valkey, Garage e Mailpit de desenvolvimento, **com um banco temporário**, e uma borda Caddy que reproduz o Traefik (`/v1` → API, resto → web).
- **Domínio único** (decidido em 07/10/2026): o front usa caminhos relativos; sem `VITE_API_URL`; a mesma imagem do web serve a qualquer ambiente.
- Para isso: `autoInstallPeers: false` e `dedupePeerDependents: false` (produção da API de 290 MB para 78 MB podada), lockfile regenerado e peers usados virados dependências explícitas.

Checklist:
- [x] Imagens buildam localmente; `docker run` da API responde `/health` (pela borda e direto).
- [x] Tamanhos (metas revistas: API < 350 MB e web < 100 MB, descompactados): **API 335 MB** (amd64) / 331 MB (arm64), ~70 MB compactada; **web 94 MB** (amd64) / 90 MB (arm64), ~24 MB compactada.
- [x] **Dockerfile do web:** `docs/design-system/` copiado para o contexto antes do `vite build`.
- [x] Teste no navegador: `/health`, primeiro acesso, login, senha errada, cookie só do host (`HttpOnly`, `Secure`, `Lax`), sem requisição para outra origem e sem violação de CSP.
- [x] `docker stop` do worker: sai com 0 em menos de 1 s (SIGTERM chega ao Node pelo `tini`).
- [x] ARM64 (emulação do Docker Desktop): as duas imagens constroem e passam no mesmo teste.

**Pronto quando:** `docker compose` de teste com as imagens prontas sobe a aplicação inteira localmente. ✅

**Para o E12/E13:** passar `APP_VERSION`, `GIT_SHA`, `SOURCE` e `BUILD_DATE` como build-args; publicar `linux/arm64`; no Coolify, os domínios do domínio único (`esteira_deploy.md`, 7.1) e `APP_URL`/`API_URL` iguais a `https://crm.aledias.com.br`.

---

## E12. CI/CD e hooks — Claude Code ✅ aprovado em 08/10/2026

**Pedido:**
> Implemente `.github/workflows/ci-cd.yml` conforme `docs/esteira_deploy.md` (seção 5): jobs quality, test (Postgres+PostGIS e Valkey como serviços, migrações do zero, testes de RLS), security (pnpm audit alto/crítico e gitleaks), build (matriz api/web → GHCR com tags `sha-<commit>` e `latest`, cache do GitHub Actions), deploy (API do Coolify para api, worker e web) e smoke test conferindo a versão em `/health`. Use `concurrency` para um deploy por vez e o ambiente `production`. Mantenha o deploy **desativado** (condição por variável `DEPLOY_ENABLED`) até a E13.

- [x] Pipeline verde num push de teste (sem deploy): run de 08/10/2026 (escopo, quality, test, security, build api/web; deploy, verify e limpeza dispensados por `DEPLOY_ENABLED` desligado).
- [x] Imagens aparecem em *Packages* do GitHub: `leadtogo-api` e `leadtogo-web` com `latest` e `sha-a064604…` (conferido pelo Ale em 08/10/2026). Uso do mês: **80 min em 20 execuções** (incluindo a montagem do CI), conforme `esteira_deploy.md`.
- [x] **Playwright no CI:** os testes E2E do web (login, troca de empresa, 2FA, teclado) também rodam no pipeline, com API, Postgres, Valkey e Mailpit como serviços e o Chromium instalado no job (`playwright install --with-deps chromium`).

**Entregue na E12 (08/10/2026):** `.github/workflows/ci-cd.yml` (jobs `escopo`, `quality`, `test` com E2E, `security`, `build` em runner ARM64 nativo, `deploy` atrás de `DEPLOY_ENABLED`, `verify` com 3 verificações e `limpeza` do GHCR); actions fixadas por SHA; `scripts/escopo.sh` (regra de "só documentação", compartilhada com o `pre-push`); `scripts/limpar-ghcr.sh` (nunca apaga `latest`, a versão em produção nem a atual).

**Achados da investigação de estabilidade dos testes:**
- Os pools não são o problema: no Postgres de desenvolvimento `max_connections=100` e o pico medido com `TURBO_CONCURRENCY=8` foi de **5 conexões** de teste; todos os testes fecham o que abrem (`end()`/`close()`/`quit()` nos `afterAll`/`afterEach`). Não achei conexão vazada.
- **`CONNECTION_ENDED`, timeout do `vinculos.test.ts` e SIGTERM do worker não reproduziram**, nem com `TURBO_CONCURRENCY=8` nem com a CPU saturada (24 processos `yes` em 12 núcleos): db e API passaram 100% (12 min, de 3 min). Não vou declarar corrigido o que não reproduzi.
- O que a carga extrema quebrou foi o **web** (jsdom, 5 s por teste): é falta de CPU, não de conexão (sem carga o mais lento leva ~1,1 s).
- **Causa real no CI (corrigida):** (1) `setup-env.ts` aplicava `OUTBOX_INTERVALO_MS` e `EMAIL_ESPERA_MS` com `||=`, então o `.env` ganhava: no CI o `.env.example` define `EMAIL_ESPERA_MS=5000` e 2 testes de `fila-email` falhavam (local passava só porque o `.env` antigo não tinha a chave); agora os tempos de teste são forçados. (2) O `turbo` rodava api, db e web juntos num runner de 2 vCPUs, e os testes (hash de senha, bootstrap do Nest) ficavam 3 a 5 vezes mais lentos que no desenvolvimento, estourando 5 s (`convites.test.ts`); no CI `TURBO_CONCURRENCY=1`. (3) O E2E precisa de `TOKEN_ENCRYPTION_KEY`; o CI gera uma chave descartável.
- **Segurança:** o `pnpm audit` do CI pegou `shell-quote` crítico (via `concurrently`, só desenvolvimento); fixado `>=1.11.0` em `overrides`.

**Pronto quando:** um push na `main` gera as imagens no GHCR com o commit como tag. ✅ (aprovado pelo Ale em 08/10/2026)

---

## E13. Recursos da aplicação no Coolify e primeiro deploy — Ale + Claude Code ✅ concluída em 08/10/2026

> **Roteiro passo a passo, com tudo para copiar: [`runbook_e13.md`](runbook_e13.md).** Mudanças em relação à lista abaixo: o papel do container vem da variável `PAPEL` (`api` ou `worker`), porque o Coolify ignora o comando de partida de recursos Docker Image: o `CMD` da imagem é `node dist/iniciar.js`, e a API migra o banco e semeia as referências ao iniciar (o pré-deploy do Coolify roda no container antigo e é pulado no primeiro deploy); o SMTP de produção é o Resend; o healthcheck de api, worker e web é o `HEALTHCHECK` da própria imagem.

1. [x] Rodar `packages/db/sql/papeis.sql` no `leadtogo-db` (cria `leadtogo_owner` e `leadtogo_app` com senhas fortes).
2. [x] Criar os 3 recursos (tipo *Docker Image*, registro `ghcr.io`):

| Recurso | Imagem | Comando | Domínio | Limite de memória |
|---|---|---|---|---|
| leadtogo-api | `ghcr.io/<usuario>/leadtogo-api:latest` | `PAPEL=api` (padrão; `CMD` da imagem `node dist/iniciar.js`: migra e semeia as referências ao iniciar; **sem** pré-deploy do Coolify) | `crm.aledias.com.br` com **prefixo `/v1`** (e `api.crm.aledias.com.br` para integrações) | 768 MB |
| leadtogo-worker | `ghcr.io/<usuario>/leadtogo-api:latest` | `PAPEL=worker` (`CMD` da imagem) | — | 512 MB |
| leadtogo-web | `ghcr.io/<usuario>/leadtogo-web:latest` | padrão | `crm.aledias.com.br` | 128 MB |

3. [x] Variáveis de ambiente de produção (lista no `.env.example`) cadastradas **só no Coolify**; gerar segredos fortes (`openssl rand -base64 32`).
3a. [x] **Domínio único (decidido em 07/10/2026):** o Traefik roteia `crm.aledias.com.br/v1` (que inclui o Better Auth em `/v1/auth/*`) para a API e o resto para o web, **sem remover o prefixo**. No Coolify, o `leadtogo-api` recebe os domínios `https://crm.aledias.com.br/v1` e `https://api.crm.aledias.com.br`, e o `leadtogo-web` recebe `https://crm.aledias.com.br` (o Traefik escolhe o prefixo mais longo). A imagem do web é a mesma em todo ambiente (caminhos relativos, CSP `connect-src 'self'`); a API usa `APP_URL=API_URL=https://crm.aledias.com.br`. O `api.crm.aledias.com.br` fica para integrações servidor a servidor (n8n, webhooks, Evolution) e para o health check da esteira. O `compose.imagens.yml` reproduz esse roteamento com um Caddy de borda.
4. [x] Healthchecks: os `HEALTHCHECK` das imagens (API `/health`, web `/health`, worker detectado pela própria imagem). **Prazo de parada do worker: `WORKER_ENCERRAMENTO_S=8`** (o Coolify ignora o `--stop-timeout`; esteira_deploy.md, 7.1.1).
5. [x] Conectar os recursos às redes do banco/cache/Garage e à `leadtogo-net`.
6. [x] Gerar o **token da API do Coolify** (só deploy) e cadastrar os secrets no GitHub: `COOLIFY_URL`, `COOLIFY_TOKEN`, `COOLIFY_UUID_API`, `COOLIFY_UUID_WORKER`, `COOLIFY_UUID_WEB`.
7. [x] Ligar `DEPLOY_ENABLED` e fazer um push.
8. [x] **Cadastrar `TOKEN_ENCRYPTION_KEY` no Coolify** (API e worker; `openssl rand -base64 32`; sem ela a API não sobe em produção). **SMTP de produção: Resend** (decidido em 08/10/2026; `smtp.resend.com`, 465, remetente `Leadtogo <nao-responda@aledias.com.br>`), com `VERIFICACAO_EMAIL=true` e as variáveis `SMTP_*` no Coolify.
9. [x] **Teste de login real no domínio único** (`https://crm.aledias.com.br`, com `/v1` roteado para a API): cookie de sessão do host `crm.aledias.com.br` (`HttpOnly`, `Secure`, `SameSite=Lax`, sem `Domain`), login, `GET /v1/me`, troca de empresa e logout pelo navegador; conferir também que `https://api.crm.aledias.com.br/health` responde para as integrações.
10. [x] **Criar a primeira conta** pelo terminal do Coolify (`PRIMEIRO_ACESSO` fica `fechado`): `node dist/criar-conta.js` (ver `esteira_deploy.md`).

**Pronto quando:** o push passa por toda a esteira, `https://api.crm.aledias.com.br/health` mostra o commit atual e `https://crm.aledias.com.br` abre o login com certificado válido. ✅

**Concluída em 08/10/2026 (marcada pelo Ale).** O **primeiro deploy automático verde** foi a execução `37835286786` do `ci-cd.yml` (commit `1ef0d0b`): `escopo`, `quality`, `security`, `test` (com E2E), `build` (api e web, ARM64), `deploy`, `verify` e `limpeza`, todos em sucesso; o `verify` conferiu o commit no `/health` de `api.crm.aledias.com.br`, o web em `crm.aledias.com.br` e a rota `/v1` pelo domínio do usuário. Antes dela, três execuções falharam por motivos que viraram correção (abaixo).

**Lições da E13**
- **O recurso "Docker Image" do Coolify não tem campo de comando de partida** (o container sobe sempre com o `CMD` da imagem). Daí o `PAPEL`: a imagem tem um entrypoint único (`node dist/iniciar.js`) e o papel vem da variável `PAPEL=api|worker`. O "pré-deploy" do Coolify também não serve para migrar (roda no container antigo e é pulado no primeiro deploy), então a API migra e semeia as referências ao iniciar.
- **O Coolify ignora o `--stop-timeout`** (`docker inspect` mostra `StopTimeout` vazio, ou seja, os 10 s do Docker). Em produção o worker usa `WORKER_ENCERRAMENTO_S=8`.
- **O Coolify cria sozinho os domínios `www.`** de cada domínio cadastrado; devem ser removidos dos recursos `leadtogo-api` e `leadtogo-web`.
- **A API de deploy do Coolify exige `POST /api/v1/deploy`** (o `GET` responde 405). O workflow foi corrigido.
- **O gitleaks só varre o histórico inteiro na execução manual** (`workflow_dispatch`): os segredos falsos de teste só apareceram na primeira, e agora têm `.gitleaks.toml`.
- **O Coolify troca api, worker e web ao mesmo tempo:** o web pode responder 503 por alguns segundos; o `verify` agora tenta de novo por até 5 minutos no web e no `/v1`.
- **Push só de documentação não passa pela esteira** (job `escopo`): para testar o deploy sem mudar código, use `gh workflow run ci-cd.yml`.
- Roteiro completo e atualizado: `runbook_e13.md`.

---

## E14. Observabilidade e alertas — Ale + Claude Code ✅ concluída (conferida até 12/10/2026)

> **Decisões (09/10/2026):** erros no **GlitchTip self-hosted** (SDK do Sentry) em `https://erros.crm.aledias.com.br`, projetos `leadtogo-api` (API e worker, tag `papel`) e `leadtogo-web`; alertas **só por e-mail** por enquanto (Uptime Kuma e notificações do Coolify, via Resend). Telegram, WhatsApp (Evolution/n8n) e a notificação de deploy pelo n8n ficam como evolução futura. Passo a passo e testes: `docs/runbook_observabilidade.md`.

**Código (Claude Code):**
- [x] SDK do Sentry na API e no worker (`@sentry/node`) e no web (`@sentry/react`): `release = APP_VERSION` (commit), `environment = production`, sem tracing, sem PII (`beforeSend` remove cookies, `Authorization`, corpo, e-mails, CPF/CNPJ e telefones; só `tenant_id`, `user_id` e `request_id` como tags). Sem `SENTRY_DSN`, o SDK fica desligado.
- [x] DSN do web por build arg (`VITE_SENTRY_DSN`, Variable `SENTRY_DSN_WEB` do GitHub): o DSN do navegador é público e o web é estático.
- [x] Source maps do web: `@sentry/vite-plugin` (debug IDs, upload ao GlitchTip, mapas apagados) só quando `SENTRY_AUTH_TOKEN` existe; os `.map` não ficam na imagem; precache do PWA conferido (`validar-dist.mjs`). API: mapas na imagem e `NODE_OPTIONS=--enable-source-maps` na imagem, sem upload.
- [x] `GET /health/alertas` (token em `X-Alertas-Token`, `ALERTAS_TOKEN`): 200 ou 503 por eventos esgotados do outbox (função `SECURITY DEFINER`, sem `BYPASSRLS`) e falhas finais de jobs nas últimas 24 h (limite `ALERTAS_LIMITE_JOBS_FALHOS`, padrão 1). Só contagens.
- [x] `node dist/outbox-tratar.js` (`--listar`, `--reprocessar`, `--descartar`, com `--por`): registra quem e quando; o alerta ignora o tratado. O payload do evento esgotado passa a ser mantido (necessário para reprocessar).
- [x] `node dist/testar-erro.js` dispara o erro de teste (sem rota HTTP).
- [x] Logs da API com `request_id`, `tenant_id` e `user_id` (já existiam, E8).
- [ ] `HEALTHCHECK` do web: **já existe** na imagem; investigar o 503 curto no próximo deploy (runbook, seção 8).

**Infraestrutura (Ale):**
- [ ] Instalar o GlitchTip no Coolify, criar organização e projetos, copiar DSNs e token (runbook, seção 1).
- [ ] Cadastrar as variáveis no Coolify e no GitHub (runbook, seção 2).
- [ ] Instalar o Uptime Kuma e criar os monitores: web, `api./health` (cobre banco, Valkey e Garage), rota `/v1`, `/health/alertas`, painel do Coolify e GlitchTip (seção 3).
- [ ] Notificações do Coolify por e-mail: deploy, backup, disco (seção 4).

**Pronto quando:** um erro forçado (`node dist/testar-erro.js`) aparece no GlitchTip com o commit, e desligar a API dispara o alerta do Uptime Kuma por e-mail (runbook, seção 5).

---

## E15. Segurança e endurecimento — Ale + Claude Code ✅ concluída em 12/10/2026

- [x] Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options) conferidos com `curl -sI` em produção em 12/10/2026: web com CSP restrita (`frame-ancestors 'none'`), HSTS 1 ano com `includeSubDomains`, `X-Frame-Options: DENY`, nosniff, Referrer-Policy e Permissions-Policy; API com CSP do Helmet, HSTS, `X-Frame-Options: SAMEORIGIN` e nosniff. `securityheaders.com`: **A+** em 12/10/2026; melhoria opcional: `Cross-Origin-Opener-Policy: same-origin`.
- [x] `/docs` (Swagger) protegido em produção: **desligado** (`/docs` e `/docs-json` respondem 404 em 12/10/2026; `main.ts` só monta o Swagger fora da produção).
- [x] Rate limit testado no login: teste automatizado em `auth.test.ts` (3 tentativas erradas respondem 401 e a seguinte 429; contador no Valkey; `X-Forwarded-For` forjado não burla). Limites: login 3 por 10 s (padrão do Better Auth), 2FA 5 por 60 s, e-mails de recuperação/verificação 3 por 5 min, demais rotas do auth 100 por 10 s; API geral 300 por 60 s (`RATE_LIMIT_MAX`, `RATE_LIMIT_JANELA_S`).
- [x] Firewall da Oracle conferido: de fora, só **22, 80 e 443** abertas.
- [x] Portas de e-mail removidas.
- [x] Backups diários no R2 e restauração testados em 09/10/2026 (`docs/runbook_backup.md`).
- [x] Banco, Valkey e Garage **sem porta pública** (verificado: só 22, 80 e 443 abertas).
- [x] 2FA obrigatório para administradores (política `dois_fatores_exigido`).
- [x] **Espelhamento do Garage** para o R2 (timer do systemd às 3h30) com aviso ao Uptime Kuma (`docs/runbook_backup.md`, seção 4); falta o teste real de restauração dos arquivos, pendente até existirem anexos.
- [x] Revisão de dependências: `pnpm audit` em 12/10/2026 sem alto/crítico; 1 **moderada** (esbuild ≤ 0.24.2, GHSA-67mh-4wv8-2f99, via `drizzle-kit` → `@esbuild-kit`, só ferramenta de desenvolvimento, fora da imagem de produção).
- [x] Política de privacidade/LGPD: rascunho técnico em `docs/lgpd.md` (papéis, inventário, base legal, suboperadores, retenção, direitos, segurança, incidentes e pendências do MVP); revisar com advogado antes de publicar.
- [x] SSH só por chave (`PasswordAuthentication no`, `PermitRootLogin without-password`), conferido em 12/10/2026.
- [ ] (opcional) `fail2ban`.
- [ ] (evolução futura) SSH só pelo Tailscale e porta 22 fechada na Oracle.

> **Nota:** o status "Degraded" do Garage no Coolify é só visual (os volumes aparecem listados como serviços); o Garage está saudável e responde normalmente.

**Pronto quando:** checklist completo e nenhum alerta alto ou crítico pendente.

---

## E16a. Telas de gestão multiempresa — Claude Code ✅ concluída em 12/10/2026

**Por quê:** a E16 pede criar a empresa B, convidar um vendedor e trocar de empresa, mas hoje só existem o link "Criar empresa" no seletor (mostra um aviso "em breve") e a API de convites, sem tela. Esta etapa entrega as telas que faltam para a E16 poder ser feita **pelo app**, sem SQL nem `curl`.

**Status:** **concluída em 12/10/2026** (API, web e E2E em produção, esteira #33 verde). Falta só a conferência manual do Ale pelo roteiro da E16.

**Resumo do que foi entregue:**
- **Criar empresa** (`/criar-empresa`, `POST /v1/empresas`): só o administrador da conta; a pessoa já entra na empresa nova; CNPJ validado, sem unicidade global e com aviso só dentro da mesma conta.
- **Configurações → Usuários e equipe** (`PATCH /v1/membros/:id`): convidar, reenviar e cancelar convites, mudar papel, desativar e reativar, com último acesso (data aproximada). Proteções: ninguém altera a si mesmo, o dono da conta é protegido e a empresa nunca fica sem administrador.
- **Configurações → Segurança:** a política de 2FA da empresa pela tela.
- **Acesso encerrado:** o membro desativado com a sessão aberta recebe um aviso claro e vai para outra empresa dele ou para o login.
- **Auditoria com IP:** criar empresa, convidar, cancelar convite, mudar papel, desativar e reativar geram registro com o IP do cliente (mesma origem do rate limit); a retenção da auditoria é pendência do MVP (`lgpd.md`).
- **Migração 0014** (CNPJ sem unicidade global): conferida em produção em 12/10/2026 (`runbook_e13.md`, 4.6).
- **Testes:** 344 na API, 154 no web e **16 E2E** (11 antigos e 5 de `gestao.spec.ts`), todos verdes na esteira.
- **Também no caminho:** correção do envio do convite (commit do hash antes do e-mail), regras de rate limit explícitas e runner da esteira fixo em `ubuntu-24.04`.

### O que a API já cobre e o que falta

| Necessidade | Situação |
|---|---|
| Convidar por e-mail com papel (`POST /v1/convites`, só admin, 30 por hora) | ✅ pronto. Reenviar é convidar de novo (o pendente anterior é cancelado) |
| Listar pendentes e cancelar (`GET /v1/convites`, `DELETE /v1/convites/:id`) | ✅ pronto (vencidos aparecem como `expirado`) |
| Consultar e aceitar o convite (`POST /v1/convites/consultar` e `/aceitar`, públicos) | ✅ pronto: conta nova (nome e senha) e conta existente (com sessão); token inválido, vencido, cancelado e já usado dão o **mesmo 404** |
| Correção do envio do convite fora da transação | ✅ **já feita e em produção** (`e878725`: o hash é gravado com commit antes de o e-mail sair; teste da corrida com atraso de 400 ms) |
| Listar a equipe (`GET /v1/membros`) | 🟡 existe, mas **falta o último acesso** (nome, e-mail, papel, ativo e `temLogin` já vêm) |
| Mudar papel e desativar/reativar membro | ❌ **falta**: `PATCH /v1/membros/:id` (só admin; `papel` e `ativo`) |
| Criar empresa do grupo | ❌ **falta**: `POST /v1/empresas` (só administrador da conta): cria tenant, configurações e o criador como admin da nova empresa, numa transação; CNPJ duplicado dá 409 |
| Política de 2FA (`GET` e `PATCH /v1/configuracoes/seguranca`, só admin) | ✅ pronto |
| Trocar a empresa ativa (`POST /v1/sessao/empresa-ativa`) | ✅ pronto |

**Regras novas da API (a cobrir com testes, inclusive de isolamento entre tenants):**
- Só **admin** altera papel e ativo; gestor e vendedor recebem 403.
- **Nunca ficar sem administrador:** ninguém altera o **próprio** papel ou situação, e quem altera é sempre outro admin ativo (conferido sob trava no banco: dois admins tirando o acesso um do outro ao mesmo tempo, só o primeiro vale e o segundo leva 403). Assim o **último admin ativo** nunca é rebaixado nem desativado.
- Desativar vale **na próxima requisição**: a pessoa perde a empresa (não conta mais em `/me`) e, se era a empresa ativa, cai no seletor ou em outra empresa dela. O histórico é mantido (`ativo=false`, sem apagar).
- Quem foi desativado volta por **Reativar** (hoje o convite recusa quem ainda é membro inativo com `ja_e_membro`).
- `POST /v1/empresas`: a nova empresa nasce na **conta** do administrador (se ele administra mais de uma, `contaId` é obrigatório); mudanças de papel e criação vão para a **auditoria**.
- **Último acesso:** vem da sessão mais recente do usuário (`auth.session.updated_at`, atualizada no máximo uma vez por dia). É aproximado, e o `acessos_log` (`lgpd.md`, 5.1) o tornará exato. **A tela mostra só a data, sem hora.**
- **Dono da conta protegido:** o dono (`conta_administradores.papel = 'dono'`) não pode ser rebaixado nem desativado por outro admin da empresa, além da regra do último admin.
- **Membro desativado com sessão aberta:** a requisição seguinte responde 403 (`empresa_ativa_invalida`, que já existe); o web mostra uma mensagem clara e leva para **outra empresa do usuário**, se houver, ou para o login. Coberto por E2E.
- **Auditoria:** criar empresa, convidar, cancelar convite, mudar papel, desativar e reativar geram registro em `auditoria`.
- **Isolamento:** todo endpoint novo tem teste de isolamento (o admin da empresa A não altera membro, convite nem dado da B).
- **CNPJ ao criar empresa:** razão social obrigatória; nome fantasia e CNPJ opcionais; CNPJ validado (alfanumérico, com dígitos verificadores) pelo Zod compartilhado. **Sem unicidade global de CNPJ**, para não revelar que outra conta existe; no máximo um aviso quando o CNPJ já está em outra empresa **da mesma conta**. Consulta à Receita e cópia de configurações ficam para depois.

### Telas e estados

Cada tela segue o design system (tokens, `Skeleton`, `Alert`, `Dialog`, `Toast`) e o responsivo (tabela no desktop, cartões no celular).

| Tela | Rota | Quem | Estados |
|---|---|---|---|
| **Criar empresa** | `/criar-empresa` (pelo item do seletor; o aviso "em breve" sai) | administrador da conta; os outros não veem o item e a rota redireciona | formulário (razão social, nome fantasia, CNPJ opcional validado) · enviando · erro de campo · CNPJ já cadastrado (409) · sem permissão · limite (429). Ao criar: toast, **troca para a empresa nova** e vai ao início |
| **Configurações** (casca) | `/configuracoes` com menu lateral interno: **Usuários** e **Segurança** | admin (o item do menu já é só dele); gestor e vendedor são redirecionados | substitui o "Em breve"; as demais seções (tags, funis…) entram nas etapas dos seus módulos |
| **Usuários** | `/configuracoes/usuarios` | admin | **carregando** (esqueleto) · **vazio** (só a própria pessoa: convite à ação) · **erro** (alerta com "Tentar de novo") · lista: nome e e-mail, **papel** (seletor), situação (*Ativo*, *Inativo*, *Convidado*, *Convite expirado*), *Com acesso*/*Sem acesso*, **último acesso**, ação (*Desativar*/*Reativar*; *Reenviar*/*Cancelar* nos convites). Contagem "N ativos · N convites pendentes" |
| **Convidar pessoa** (diálogo) | dentro de Usuários | admin | e-mail e papel; "O convite vale por 7 dias" · enviando · e-mail já é da equipe (409) · limite (429) · aviso quando o SMTP não está configurado (`emailEnviado=false`) |
| **Confirmações** (diálogos) | dentro de Usuários | admin | desativar; rebaixar um admin; cancelar convite. Erros "último administrador" e "não é possível alterar você mesmo" aparecem no diálogo |
| **Segurança da empresa** | `/configuracoes/seguranca` | admin | **carregando** · **erro** · seleção da política (*administradores*, *administradores e gestores*, *todos*) com a explicação de quem será obrigado · salvar · sucesso (a regra vale na próxima requisição de cada pessoa) |
| **Aceitar convite** | `/convite?token=…` (já existe) | convidado | carregando · **convite inválido** (inexistente, vencido, cancelado ou já usado, com o mesmo texto) · conta nova (nome, senha, termos) · conta existente (entrar e aceitar) · sessão de **outro e-mail** · erro ao aceitar. Falta cobrir: **2FA obrigatório logo após aceitar** (quando a política da empresa exigir) |

### Divergências entre o protótipo e `funcionalidades.md` (vale o documento)

| Protótipo (`Configuracoes.dc.html`) | `funcionalidades.md` | Decisão |
|---|---|---|
| "Convidar pessoa" tem o campo **Gestor** (hierarquia) | o convite só leva e-mail e papel; a hierarquia não é regra de negócio definida | **fora do E16a, para o MVP**: sem campo Gestor; entra com o módulo de carteira |
| Botão **Transferir carteira** em Usuários | a transferência é do gestor ou admin e depende da carteira (seção 10) | **fora do E16a, para o MVP**: entra com o módulo de Empresas |
| Vendedor **"Sem acesso"** (sem login) criado na própria tela | "vendedor = membro, pode existir sem login" (decisão 25) | só **exibe** quem já existe assim; criar vendedor sem login fica para o módulo de carteira |
| Seção Usuários visível para "Admin" | Usuários e papéis: Admin; **gestor não acessa configurações** | igual; **gestor e vendedor não veem o menu nem a rota** |
| Sem tela de **Segurança** nem de criar empresa do grupo | política de 2FA por empresa (seção 10) e "criar empresas" pelo administrador da conta (multiempresa) | telas **novas**, desenhadas pelo design system |
| Sem "último acesso" | não definido | mostra o último acesso aproximado (acima); decisão registrada neste plano |
| Convite expirado, cancelado e já usado em telas diferentes (pedido) | a API responde o **mesmo 404** de propósito (não revela o motivo) | **uma só tela** "Convite inválido", com a orientação de pedir novo convite ao administrador |

### Testes

- **Unitários e de integração (API):** papéis (só admin), último administrador, alterar a si mesmo, desativar vale na requisição seguinte, reativar, criar empresa (conta, CNPJ duplicado, não administrador da conta), **isolamento** (o admin da A não altera membro nem convite da B), auditoria.
- **Unitários (web, Testing Library):** cada estado das telas acima (vazio, carregando, erro, sucesso), validação dos formulários, regras de exibição por papel, item "Criar empresa" só para administrador da conta.
- **E2E (Playwright), com a E16 como roteiro:** (1) administrador cria a **empresa B** e passa a estar nela; (2) convida um **vendedor para a A**; (3) o convidado **aceita com outro e-mail** (conta nova) e, com a política "todos", **ativa o 2FA**; (4) o vendedor da A **não vê a B**, **não vê o menu Configurações** e a rota `/configuracoes/usuarios` o redireciona; (5) admin muda o papel, desativa e reativa; (6) reenvia e cancela um convite; (7) altera a política de 2FA.

### Commits previstos (pequenos, com os testes de cada um)

1. `feat(api): PATCH /v1/membros/:id (papel e ativo) com a regra do último administrador`
2. `feat(api): último acesso na lista de membros`
3. `feat(api): POST /v1/empresas (administrador da conta cria empresa do grupo)`
4. `chore(api-client): contratos novos (OpenAPI)`
5. `feat(web): criar empresa e entrada na empresa nova`
6. `feat(web): Configurações com menu interno e proteção por papel`
7. `feat(web): Configurações → Usuários (lista, papéis, desativar e reativar)`
8. `feat(web): convidar, reenviar e cancelar convites`
9. `feat(web): Configurações → Segurança da empresa (política de 2FA)`
10. `test(e2e): gestão multiempresa (empresa B, convite, vendedor isolado, 2FA)`
11. `docs: funcionalidades, prototipo/README e este plano atualizados`

### Decisões do Ale (12/10/2026)

1. **Gestor** sem Usuários e Segurança, como no documento. A visão de equipe do gestor vem com carteira e painel, no MVP.
2. **Último acesso aproximado** serve até existir o `acessos_log`; mostra só a data.
3. **Criar empresa:** regras de CNPJ acima; consulta à Receita e cópia de configurações ficam para depois.

**Pronto quando:** o roteiro do E2E acima passa na esteira e em produção, e o Ale consegue fazer à mão os testes de aceitação da E16 (empresa A e B, convite do vendedor, isolamento) só pelo app.

---

## E16. Validação final e runbook — Ale + Claude Code ✅ concluída em 12/10/2026

**Testes de aceitação (em produção): 1 a 5 concluídos em 12/10/2026 (multiempresa, preferências, PWA, rollback, restauração). O runbook geral (`docs/runbook.md`) está escrito e publicado.**
- [x] Criar conta e empresa A; convidar um vendedor; criar a empresa B na mesma conta.
- [x] Trocar entre A e B; o vendedor da A não vê a B.
- [x] Tema escuro, menu recolhido e preferência mantida após novo login.
- [x] Instalar o PWA no celular e entrar.
- [x] **Rollback** (12/10/2026, sha-5605db5 e volta para latest, tudo healthy): voltar para a imagem `sha-` anterior no Coolify e retornar, sem tempo fora do ar.
- [x] **Restauração** (12/10/2026, a partir do R2: 15 migrações, 2 tenants, 3 membros, idêntico à produção): recuperar o backup do dia num banco temporário.

- [x] *(fica como pendência herdada, seção 6)* ensaiar a restauração em produção **completa** (banco novo, troca de nomes, API apontando para ele, login e isolamento) num container descartável; o procedimento (`runbook_backup.md`, seção 3) ainda não foi testado de ponta a ponta.

**Runbook** (`docs/runbook.md`, o Claude Code cria; **primeira versão escrita em 12/10/2026, para o Ale revisar**):
- como fazer deploy, rollback e redeploy manual;
- como restaurar banco e arquivos;
- como girar senhas e tokens;
- o que fazer se a VPS cair (subir numa VPS nova a partir dos backups);
- contatos e acessos (onde ficam, **sem** as senhas).

**Pronto quando:** todos os testes de aceitação passam e o runbook está no repositório. ✅ **Concluída em 12/10/2026:** testes 1 a 5 feitos em produção e `docs/runbook.md` completo (deploy, rollback, restauração, segredos, VPS perdida, acessos e checklist mensal). O ensaio completo da restauração em produção ficou como pendência herdada (seção 6).

---

## 4. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Push direto na `main` levar bug à produção | Hooks locais + CI completo; rollback de 1 minuto pela tag `sha-` |
| Falta de memória na VPS (24 GB compartilhados) | Limites por container; build fora da VPS (GHCR); medido na E4 (~5 GB em uso) |
| VPS ARM64 e imagens só amd64 | Conferir `docker manifest inspect` antes de usar qualquer imagem; build do Leadtogo para `linux/arm64` |
| Erro de isolamento entre empresas | RLS forçado, papel sem bypass e teste de isolamento obrigatório no CI |
| Perda de dados | Backup diário externo + teste de restauração na E4 e na E16 |
| Migração quebrar a produção | Regra "expandir e depois contrair"; a migração roda no início da API e, se falhar, o container não fica saudável e a versão antiga continua; backup antes de mudança destrutiva |
| API pública da Minha Receita instável | Cache em `receita_consultas` + API alternativa (na fase de empresas) |
| Duas cópias do repositório (Windows e WSL) | A cópia oficial passa a ser a do WSL a partir da E2 |

---

## 5. Definição de pronto da Fase 0

- [x] Todas as etapas E1–E16 marcadas (12/10/2026). Caixas antigas de E3, E4 e E14 (infraestrutura) ficaram sem `[x]` no texto, embora a infraestrutura esteja no ar e conferida; não foram reabertas.
- [x] Pipeline verde e deploy automático funcionando (esteira de 12/10/2026 verde, `verify` ok).
- [x] Login multiempresa em produção com isolamento testado (E16, testes 1 e 2, e testes de isolamento da API no CI).
- [x] Casca do app igual ao protótipo (desktop e celular, claro e escuro) (E9, aprovada em 07/10/2026; E16, teste 3).
- [x] Backups externos testados e runbook escrito (restauração do banco testada em 12/10/2026; `docs/runbook.md`).
- [x] Documentos atualizados com qualquer decisão tomada durante a implantação.

✅ **Fase 0 concluída em 12/10/2026.**

**Próximo passo após a Fase 0:** definir o escopo do MVP e implementar as telas de negócio, começando por **Empresas** (com consulta à Receita), que é a base de todo o resto.

---

## 6. Pendências herdadas para o MVP

Reúne num só lugar o que ficou registrado em outros documentos. Nada aqui bloqueia a Fase 0; o que está marcado como **antes do primeiro cliente** precisa estar pronto antes de qualquer cliente real usar o sistema.

### 6.1 LGPD e privacidade (`lgpd.md`, seção 9)

- [ ] **`acessos_log`** (registros de acesso, **6 meses**, partição mensal descartada pelo job de manutenção). **Prioridade alta, antes do primeiro cliente.**
- [ ] **Expurgo** dos registros excluídos (soft delete) após o prazo definido.
- [ ] **Retenção da auditoria:** hoje ilimitada e com IP; definir prazo e descarte das partições antigas.
- [ ] **Limpeza de sessões expiradas.**
- [ ] **Exportação de dados por tenant** (direitos do titular e saída do cliente).
- [ ] **DPA** (contrato de operador) para os clientes.
- [ ] **Política de privacidade** pública.
- [ ] **Encarregado (DPO)** indicado.
- [ ] **Revisão com advogado** de todo o `lgpd.md` (rascunho técnico), em especial a aplicação do **art. 15 do Marco Civil** e a **transferência internacional** (Cloudflare R2, ENAM).

### 6.2 Operação e produto

- [ ] **Ensaio completo da restauração em produção, antes do primeiro cliente:** banco novo, troca de nomes, API apontando para ele, login e isolamento, num container descartável (`runbook_backup.md`, seção 3).
- [ ] Teste real de restauração dos **arquivos do Garage**, quando existirem anexos.
- [ ] **Aviso "Nova versão disponível"** no PWA (`funcionalidades.md`).
- [ ] **Revisar os PRs abertos do Dependabot** (em 12/10/2026: #6, atualização do grupo npm com 16 pacotes; #4, `node` 24 → 26-alpine nas imagens; #1, grupo docker-compose). O Node 26 pede cuidado: a imagem de produção usa `node:24-alpine` (LTS).

### 6.3 Opcionais e evolução futura

- [ ] `fail2ban` na VPS.
- [ ] SSH só pelo Tailscale, com a porta 22 fechada na Oracle.
- [ ] Cabeçalho `Cross-Origin-Opener-Policy`.
- [ ] **Zabbix + Grafana** fora da VPS (métricas de infraestrutura).
- [ ] Alertas por **Telegram/WhatsApp** (hoje só e-mail).
- [ ] Backups do **n8n, Evolution e WordPress**.
- [ ] E-mail com **MX próprio** (hoje só envio, pelo Resend).

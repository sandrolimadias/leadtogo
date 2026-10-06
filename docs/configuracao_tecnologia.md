# CRM Alessandro — Configuração de Tecnologia

> Documento de definições técnicas do projeto.
> Status: **Aprovado (v1.1)** · Data: 05/10/2026
> v1.1: n8n e Evolution API (já em produção na VPS) incorporados à arquitetura
> v1.2: e-mail (Gmail/Microsoft Graph, BCC, rastreamento), agendas, tarefas Kanban, notificações e container de *worker*
> v1.3: multiempresa (conta dona de vários tenants, empresa ativa na sessão, leitura consolidada via RLS)
> v1.6: arquivos no **Garage** (S3) no lugar do MinIO, descontinuado
> v1.5: servidor real levantado: Oracle Cloud **ARM64 (aarch64)**, 4 vCPU, 24 GB; imagens multi-arquitetura; PostGIS em imagem com suporte ARM
> v1.4: domínios definidos: `crm.aledias.com.br` (app) e `api.crm.aledias.com.br` (API)

---

## 1. Requisitos que guiaram as escolhas

- Funcionar no **computador (PWA)**, **tablet** e **celular**.
- **Multitenant** (várias empresas no mesmo sistema, dados isolados).
- Prioridades: **performance, segurança e usabilidade**.
- Futuro: **geolocalização e roteirização** de visitas.
- Infraestrutura própria: **VPS Oracle Cloud com Coolify** — ARM64 (Ampere), 4 vCPU, 24 GB de RAM, ~190 GB de disco.

### Por que não Supabase self-hosted
O Supabase self-hosted é composto por cerca de 10 a 12 serviços (Kong, GoTrue, PostgREST, Realtime, Storage, Studio, Logflare etc.), o que é frágil para manter no Coolify e mais do que o projeto precisa. Ficamos com o melhor dele, o **PostgreSQL**, e implementamos auth, API e storage com ferramentas mais simples e controláveis.

---

## 2. Resumo da stack

| Camada | Tecnologia |
|---|---|
| Linguagem | **TypeScript** (front e back) |
| Runtime | Node.js LTS (versão LTS ativa) |
| Monorepo | pnpm workspaces + Turborepo |
| Back-end (API) | **NestJS** |
| Comunicação | **REST + OpenAPI** (Swagger gerado automaticamente) |
| ORM / migrações | Drizzle ORM + drizzle-kit |
| Validação | Zod (schemas compartilhados front/back) |
| Autenticação | **Better Auth** (dentro da API) |
| Banco de dados | **PostgreSQL + PostGIS** |
| Multitenant | **Banco único + `tenant_id` + Row Level Security (RLS)** |
| Cache / filas | Valkey (compatível com Redis) + BullMQ |
| Front-end | React + Vite + TanStack Router/Query |
| UI | Tailwind CSS + shadcn/ui |
| PWA / offline | vite-plugin-pwa (Workbox) + Dexie (IndexedDB) |
| App nativo | **Capacitor** (código preparado desde já) |
| Arquivos | **Garage** na VPS (compatível com S3; substitui o MinIO, descontinuado) |
| Mapas (futuro) | MapLibre GL + OpenStreetMap |
| Geocodificação (futuro) | **Híbrido:** Google Maps API + cache + Nominatim |
| Rotas (futuro) | OSRM + VROOM (otimização de roteiro) |
| Repositório / CI | **GitHub + GitHub Actions** |
| Deploy | **Coolify** (deploy automático por branch) |
| Ambientes | **Dev local + Produção** |
| Observabilidade | **Essencial:** GlitchTip/Sentry + Uptime Kuma + logs estruturados (Pino) |
| Automações | **n8n** (já instalado na VPS) — webhooks de saída do CRM + API REST com chaves por tenant |
| WhatsApp | **Evolution API** (já instalada na VPS) — webhook de mensagens para o CRM |
| E-mail e agenda | **Gmail API + Google Calendar API** e **Microsoft Graph** (OAuth 2.0); BCC via caixa IMAP (`imapflow`); SMTP de reserva (`nodemailer`) |
| Editor de e-mail | TipTap (rich text) + modelos com variáveis |
| Kanban (arrastar e soltar) | dnd-kit, usado no funil e nas tarefas, com suporte a toque |
| Tempo real | Server-Sent Events (SSE) ou Socket.io para notificações e atualização dos quadros |
| Notificações push | Web Push (VAPID) no PWA; FCM/APNs via Capacitor no app |
| Worker | Container separado (mesma imagem da API) para filas BullMQ e sincronizações |

---

## 3. Estrutura do repositório

```
crm/
├── apps/
│   ├── api/          → NestJS (REST + OpenAPI) + entrypoint do worker (src/worker.ts → dist/worker.js):
│   │                   processos em segundo plano (filas, sync de e-mail/agenda, webhooks)
│   └── web/          → React + Vite (PWA) — também empacotado pelo Capacitor
├── packages/
│   ├── shared/       → schemas Zod, tipos, enums, regras comuns
│   ├── db/           → schema Drizzle, migrações, políticas RLS, seeds
│   └── api-client/   → cliente TypeScript gerado do OpenAPI
├── docker/           → Dockerfiles e docker-compose (dev local)
└── .github/workflows → CI (lint, typecheck, testes, build)
```

- O **worker** não é um app separado: vive em `apps/api` (mesmo código e imagem), com entrypoint próprio (ver seção 11.3).
- O **cliente da API** é gerado automaticamente a partir do OpenAPI (`openapi-typescript` + `openapi-fetch`), garantindo tipagem ponta a ponta mesmo usando REST.
- Tudo em **ESM** e TypeScript estrito (`tsconfig.base.json` na raiz). Os pacotes internos exportam o `dist/` e, pela condição `@leadtogo/source`, o `src/` (typecheck, testes e Vite usam o código-fonte direto).

---

## 4. Back-end — NestJS

- Organização por **módulos de domínio** (contas, contatos, negócios/funil, atividades, agenda, usuários etc.).
- **Guards** para autenticação, tenant e permissões (RBAC: papéis por tenant, como admin, gestor e vendedor).
- **Interceptor de tenant:** em cada requisição, abre uma transação e executa `SET LOCAL app.tenant_id = '<id>'` (e `app.user_id`) antes das queries.
- **Swagger/OpenAPI** em `/docs` (protegido em produção).
- **Filas (BullMQ):** importação de planilhas, envio de e-mails, notificações, geocodificação em lote e relatórios pesados.
- **Webhooks** de saída e entrada previstos na arquitetura (ver seção 11.1):
  - **Saída (CRM → n8n):** tabela *outbox* de eventos + worker BullMQ que entrega com assinatura HMAC, retry com backoff e log de entregas.
  - **Entrada (Evolution → CRM):** endpoint `/v1/integrations/whatsapp/webhook/:instancia`, validado por token. A mensagem é gravada numa fila e processada em segundo plano, deixando a resposta ao webhook rápida.
- **Chaves de API por tenant** (hash no banco, escopos por módulo, validade e revogação) para uso pelo n8n e outras integrações.
- Versionamento da API: prefixo `/v1`.

---

## 5. Banco de dados — PostgreSQL + PostGIS

- Imagem: **`imresamu/postgis:17-3.5`** (multi-arquitetura, com ARM64). A imagem oficial `postgis/postgis` só é publicada para amd64 e **não roda na VPS ARM**. Alternativa, se necessário: imagem própria `FROM postgres:17` + pacote `postgresql-17-postgis-3`, construída no CI para arm64. Usar **a mesma imagem** no desenvolvimento local.
- **Não exposto à internet:** acesso apenas pela rede interna do Coolify.
- Extensões: `postgis`, `pgcrypto`, `citext`, `pg_trgm` (busca por similaridade de nomes) e `unaccent` (busca sem acento).
- Chaves primárias **UUID v7** (ordenáveis, boas para índices e sincronização offline).
- Colunas padrão: `id`, `tenant_id`, `created_at`, `updated_at`, `created_by`, `deleted_at` (soft delete).
- Colunas geográficas com tipo `geography(Point, 4326)` e índice **GiST**.
- **PgBouncer** apenas se o número de conexões crescer (não no início).

### Backup
- Backup automático diário do Postgres pelo Coolify, enviado para um **destino S3 externo à VPS** (ex.: Cloudflare R2 ou Backblaze B2).
- Retenção sugerida: 7 diários + 4 semanais + 3 mensais.
- Teste de restauração periódico (mensal).

---

## 6. Multitenant — Banco único + RLS

- Toda tabela de negócio tem `tenant_id NOT NULL`.
- **Row Level Security habilitado e forçado** (`ENABLE` + `FORCE ROW LEVEL SECURITY`):
  ```sql
  CREATE POLICY tenant_isolation ON contatos
    USING (tenant_id = current_setting('app.tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
  ```
- A aplicação conecta com um **usuário de banco sem privilégio de bypass** (`NOBYPASSRLS`, sem ser owner das tabelas). As migrações rodam com outro usuário.
- Índices compostos começando por `tenant_id` (ex.: `(tenant_id, created_at)`).
- **Testes automatizados de isolamento:** o tenant A nunca pode ler nem gravar dados do tenant B.
- Evolução futura possível: banco dedicado para cliente grande (modelo híbrido), sem mudar o código de domínio.

### Multiempresa (conta com vários tenants)
- Hierarquia: **Conta → Tenants (empresas) → Membros**. O usuário (login do Better Auth) é único e tem um vínculo de membro em cada empresa.
- **Empresa ativa** guardada na sessão (campo `empresaAtivaId`, nosso). O guard da API descobre os vínculos do usuário pela função `app_vinculos_do_usuario` (`SECURITY DEFINER`, devolve só tenant e papel) e valida que ele é membro ativo da empresa ativa antes de definir `app.tenant_id`.
- **Leitura consolidada:** endpoints específicos (`/v1/consolidado/...`) definem `SET LOCAL app.tenant_ids = '{...}'` com **todas as empresas da conta**, e só para quem está em `conta_administradores` com papel dono ou administrador (o financeiro não entra). Quem é admin apenas de uma empresa não tem consolidado; a transação é `READ ONLY`. As políticas RLS **de SELECT** aceitam `tenant_id = current_setting('app.tenant_id')::uuid OR tenant_id = ANY(current_setting('app.tenant_ids', true)::uuid[])`. As políticas de INSERT/UPDATE/DELETE aceitam **só** `app.tenant_id`.
- Cache (Valkey) sempre com o `tenant_id` na chave, para evitar vazamento entre empresas.
- Teste automatizado obrigatório: um usuário com acesso às empresas A e B, com a A ativa, não consegue gravar na B.

---

## 7. Autenticação e segurança

### Better Auth
- Login com e-mail e senha (hash Argon2/scrypt), com opção de login Google.
- **2FA (TOTP)** disponível, obrigatório para administradores.
- **Sem o plugin de organizações.** O Better Auth cuida só da **identidade** (usuário, sessão, 2FA, recuperação de senha). Empresas, membros, convites e a empresa ativa ficam nas nossas tabelas (`tenants`, `membros`, `convites`), sob RLS, para não haver duas fontes da verdade. A empresa ativa é um campo da sessão (`empresaAtivaId`).
- **2FA obrigatório para administradores** (admin de qualquer empresa ou da conta): o Better Auth não impõe isso sozinho; o guard da API responde `403 2fa_obrigatorio` até o 2FA ser ativado, deixando passar só `GET /v1/me`, as rotas de ativação do 2FA e o logout.
- Senhas com **scrypt** (padrão do Better Auth, sem dependência nativa na imagem ARM64). Verificação de e-mail obrigatória para entrar **em produção** (flag).
- O handler do Better Auth é montado direto (`toNodeHandler`) em `/v1/auth/*`, antes do parser de corpo do Nest; a API tem guard próprio (sessão, tenant e 2FA).
- **Domínios e cookies:** o front fica em `crm.aledias.com.br` e a API em `api.crm.aledias.com.br` (mesmo *site*). O cookie de sessão é emitido pela API (`HttpOnly`, `Secure`, `SameSite=Lax`, sem `Domain`, só no host da API); o front chama a API com `credentials: 'include'`, e o CORS libera só `https://crm.aledias.com.br` com credenciais. Em desenvolvimento (`localhost:5173` e `localhost:3000`) o cookie vale sem `Secure`.
- Sessões em cookie `HttpOnly`, `Secure`, `SameSite=Lax`; no app Capacitor, token seguro no armazenamento nativo.
- Recuperação de senha e verificação de e-mail.

### Segurança geral
- HTTPS pelo Traefik do Coolify (Let's Encrypt).
- Helmet (headers de segurança), CORS restrito, proteção CSRF.
- **Rate limiting** (login, recuperação de senha, API geral) com armazenamento no Valkey.
- Validação de toda entrada com Zod/DTOs; nada de SQL concatenado.
- **Log de auditoria:** quem, o quê, quando e valor anterior/novo nas entidades principais.
- Segredos somente em variáveis de ambiente do Coolify (nunca no repositório).
- Dependências: Dependabot/Renovate + `pnpm audit` no CI.
- **LGPD:** registro de consentimento, exportação e exclusão de dados do titular, e minimização de dados pessoais.

---

## 8. Front-end — React + Vite (PWA)

- React + TypeScript + Vite.
- TanStack Router (rotas tipadas) + TanStack Query (cache e sincronização com a API).
- Tailwind CSS + shadcn/ui, com layout **responsivo mobile-first** (celular, tablet e desktop).
- React Hook Form + Zod (os mesmos schemas do back).
- Internacionalização preparada (pt-BR padrão).
- Tema claro/escuro.

### PWA e offline — "Leitura + fila"
- Service worker (Workbox via `vite-plugin-pwa`) para cache do app (abre sem internet).
- **Leitura offline:** clientes, contatos e agenda do usuário ficam salvos no **IndexedDB (Dexie)**.
- **Fila de ações:** registros feitos offline (visita, nota, atividade, check-in) entram numa fila local e são enviados ao reconectar.
- Cada ação tem um ID gerado no cliente (UUID v7) para evitar duplicidade (idempotência no back).
- Indicador visual de status: online, offline ou sincronizando, com itens pendentes.
- Conflitos: regra "última gravação vence" com registro no log de auditoria (offline-first completo fica fora do escopo inicial).

### App nativo — Capacitor (preparado desde já)
- O mesmo código do `apps/web` é empacotado para iOS e Android.
- Acesso a recursos nativos por uma camada de abstração (`/platform`): geolocalização, câmera, armazenamento seguro e push.
- Publicação nas lojas quando a geolocalização em segundo plano for necessária (o PWA no iOS não rastreia localização com o app fechado).

---

## 9. Arquivos — Garage (S3 na VPS)

> **v1.6 (06/10/2026):** o MinIO deixou de ser distribuído como projeto aberto (imagens descontinuadas e repositório arquivado) e saiu do catálogo do Coolify. Foi substituído pelo **Garage** (código aberto, leve, compatível com S3, roda em ARM64). O código não muda: o acesso é pelo **padrão S3** (`@aws-sdk/client-s3`), configurado só por variáveis de ambiente.

- Garage em container próprio no Coolify (imagem `dxflrs/garage:v2.1.0`), **um nó**, `replication_factor = 1`, metadados em LMDB.
- API S3 na porta interna 3900, publicada em `https://files.crm.aledias.com.br` (necessário para os links pré-assinados). A porta RPC (3901) e a API de administração (3903) **não** são publicadas.
- Requisições em **estilo de caminho** (`forcePathStyle: true`) e região `garage`.
- **Buckets privados**; acesso por **URLs pré-assinadas** com expiração curta.
- Organização por prefixo de tenant: `tenant_id/entidade/arquivo`.
- Upload direto do navegador para o Garage via URL pré-assinada (não passa pela API). Requer **CORS** no bucket liberando só `https://crm.aledias.com.br` (configurado por script na E15).
- Limite de tamanho e validação de tipo de arquivo.
- Fotos tiradas no celular são comprimidas no cliente antes do envio.
- **Backup:** sincronização diária do bucket para o Cloudflare R2 com `rclone` (pendência da E4/E15).
- Desenvolvimento local: o mesmo Garage no `docker/compose.dev.yml`.

---

## 10. Geolocalização e roteirização (fase futura)

| Função | Ferramenta |
|---|---|
| Exibir mapas | MapLibre GL + tiles OpenStreetMap |
| Endereço → coordenada | **Google Geocoding API** (principal), com **cache no banco** |
| Alternativa econômica | Nominatim (público com limites ou self-hosted) |
| Consultas espaciais | PostGIS (raio, proximidade, territórios/polígonos) |
| Rota entre pontos | OSRM (container) |
| Otimização de visitas | VROOM (sobre OSRM) |
| Rastreamento em campo | Capacitor + plugin de background geolocation |

- Endereço normalizado + coordenada ficam gravados no cliente, então a mesma geocodificação nunca é paga duas vezes.
- **Atenção à RAM (VPS 24 GB, compartilhada):** o pré-processamento do mapa do Brasil no OSRM pode exigir muita memória. A recomendação é processar fora da VPS (máquina local ou servidor temporário) e subir só os arquivos prontos; em execução, o OSRM (perfil carro, algoritmo MLD) cabe na VPS. Reavaliar quando a fase começar.
- Nominatim self-hosted para o Brasil consome bastante RAM e disco, por isso fica fora da VPS no início.

---

## 11. Infraestrutura — Coolify (VPS Oracle Cloud ARM64, 4 vCPU, 24 GB)

> **Arquitetura ARM64:** toda imagem usada na VPS precisa ter versão `linux/arm64`. Node (alpine), Caddy, Valkey, Garage e Uptime Kuma têm. O PostGIS oficial não tem; usar `imresamu/postgis:17-3.5`. As imagens do Leadtogo são construídas para `linux/arm64` no CI (ver `esteira_deploy.md`).

### Containers em produção

| Serviço | Imagem / base | RAM estimada |
|---|---|---|
| API | Node LTS (NestJS) | ~300–600 MB |
| Web (PWA) | Arquivos estáticos via Caddy/Nginx | ~50 MB |
| PostgreSQL + PostGIS | `imresamu/postgis:17-3.5` | 2–4 GB (configurável) |
| Valkey | `valkey/valkey` | ~100–300 MB |
| Garage | `dxflrs/garage:v2.1.0` | ~100–300 MB |
| Uptime Kuma | `louislam/uptime-kuma` | ~150 MB |
| GlitchTip (opcional) | self-hosted, ou Sentry em nuvem (plano gratuito) | ~500 MB–1 GB |
| Coolify + Traefik | — | ~1 GB |
| **n8n** *(já existente)* | com seu próprio banco | ~300 MB–1 GB |
| **Evolution API** *(já existente)* | com seu próprio banco/cache | ~300 MB–1 GB (cresce com o nº de instâncias) |
| **Worker do CRM** | mesma imagem da API | ~300–600 MB |

Total estimado do Leadtogo: **~3–5 GB**. Medição de 06/10/2026: a VPS usa ~5 GB de 23 GB (n8n, Evolution, 2 WordPress com MySQL, Coolify), então há folga confortável.

- **Conferir o consumo real** dos serviços existentes antes de subir o CRM (`docker stats` na VPS ou métricas do Coolify).
- Para poupar RAM, preferir o **Sentry em nuvem (plano gratuito)** ao GlitchTip self-hosted.
- Definir **limites de memória** por container no Coolify, para que um serviço não derrube os outros.
- O **OSRM** (fase de roteirização) provavelmente exigirá **upgrade da VPS ou um servidor separado**.

- **Domínios:** `crm.aledias.com.br` (front), `api.crm.aledias.com.br` (API), `files.crm.aledias.com.br` (Garage, se necessário), `t.crm.aledias.com.br` (rastreamento de e-mail).
- Containers de banco, Valkey e Garage **sem porta pública**.
- Healthchecks configurados em todos os serviços.
- Ajuste do Postgres conforme a RAM (`shared_buffers` ≈ 25% da RAM alocada etc.).

### 11.1 Integração com serviços já existentes (n8n e Evolution API)

O n8n e a Evolution API **já estão instalados e rodando** na mesma VPS/Coolify. Diretrizes:

**Isolamento**
- O CRM tem **seu próprio Postgres (PostGIS) e seu próprio Valkey**. **Não reutiliza** os bancos do n8n e da Evolution, pelos seguintes motivos:
  - backups e restaurações independentes;
  - atualizar o n8n ou a Evolution não afeta o CRM;
  - o RLS e os usuários de banco do CRM ficam sob controle total.
- Nenhum serviço acessa diretamente o banco de outro; a comunicação é **só por API/webhook**.

**Comunicação pela rede interna**
- Colocar CRM, n8n e Evolution numa **rede Docker compartilhada** no Coolify ("Connect to predefined network" ou uma rede criada para isso). Assim o tráfego entre eles não sai pela internet:
  - Evolution → CRM: `http://crm-api:3000/v1/integrations/whatsapp/webhook/...`
  - CRM → n8n: `http://n8n:5678/webhook/...`
  - n8n → CRM: `http://crm-api:3000/v1/...`
- Mesmo na rede interna, **toda chamada é autenticada** (token do webhook, assinatura HMAC, chave de API).
- Se preferir não compartilhar a rede, usar os domínios HTTPS públicos; funciona igual, com um pouco mais de latência.

**Evolution API → CRM**
- Configurar o webhook da instância com os eventos de mensagens (`MESSAGES_UPSERT` e afins) e de conexão (`CONNECTION_UPDATE`).
- Cada conexão de vendedor no CRM corresponde a **uma instância** da Evolution. O CRM cria a instância e obtém o QR Code pela API da Evolution, e o vendedor não precisa acessar a Evolution.
- A **API key global da Evolution** fica só no back-end do CRM (variável de ambiente), nunca no front.
- Mídias: o CRM baixa o arquivo (base64 ou URL) e grava no **Garage** do CRM.
- Conferir a versão da Evolution em uso (v2.x) e travar a versão da imagem no Coolify para evitar quebras em atualizações automáticas.

**CRM ↔ n8n**
- CRM → n8n: webhooks de saída por evento (outbox + BullMQ, HMAC, retry).
- n8n → CRM: nó *HTTP Request* com **chave de API do tenant** (credencial *Header Auth* no n8n).
- Os fluxos do n8n que pertencem ao CRM ficam numa **pasta ou projeto próprio** no n8n e são versionados (exportados para o repositório em `/integrations/n8n`).

**Multitenant**
- Hoje os serviços atendem a sua operação. Se outros tenants usarem WhatsApp, cada instância da Evolution fica **associada a um tenant e um usuário** no CRM, e o webhook identifica o tenant pela instância.
- Automações n8n por tenant: cada tenant tem suas chaves e webhooks. Avaliar no futuro se clientes externos poderão criar fluxos próprios ou se as automações serão um serviço prestado por você.

**Backup**
- Incluir no plano de backup externo os bancos do n8n e da Evolution (se ainda não estiverem), além dos do CRM.


### 11.2 E-mail e agendas — Google e Microsoft

**Registro de aplicativos (pré-requisito)**
- **Google Cloud:** projeto com OAuth consent screen, Gmail API e Calendar API habilitadas.
- **Microsoft Entra ID (Azure):** *App registration* multi-tenant com permissões delegadas `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `offline_access`, e *publisher verification*.
- ⚠️ **Verificação do Google:**
  - escopos de **leitura de Gmail** (`gmail.readonly`/`gmail.modify`) são **restritos**. Para uso por usuários externos (outros tenants), exigem verificação do app e **avaliação de segurança anual (CASA)**, que tem custo e prazo;
  - escopos de **agenda** e `gmail.send` são *sensíveis*: exigem verificação, mas sem a avaliação de segurança.
  - **Estratégia:** começar com o app em modo de teste / uso interno (até 100 usuários de teste) ou com **Google Workspace interno**, e usar o **BCC** como alternativa sem escopo restrito. A verificação completa fica para quando houver clientes externos usando Gmail.

**Tokens e segurança**
- Tokens OAuth (access/refresh) **criptografados no banco** (AES-256-GCM, chave em variável de ambiente), nunca expostos ao front.
- Escopos mínimos, e o usuário pode **revogar** a qualquer momento (em *Minhas conexões*).
- Refresh automático; se o token for revogado, o usuário recebe um aviso para reconectar.

**Sincronização (no worker)**
- **Gmail:** incremental por `historyId` (polling a cada 2–5 min no início); depois, *push* via Google Pub/Sub (`users.watch`).
- **Microsoft Graph:** *delta query* (polling) no início; depois, *change notifications* (webhooks, renovar a assinatura periodicamente).
- **Agenda:** Google `syncToken` + *push channels*; Microsoft *delta* + *subscriptions*.
- Idempotência por **ID externo** (thread/mensagem/evento), sem duplicar ao reprocessar.
- Filtro no worker: só grava e-mails/eventos com contatos ou domínios cadastrados.

**BCC**
- Caixa dedicada (ex.: `registro@aledias.com.br`) em qualquer provedor, lida por **IMAP** pelo worker (IDLE ou polling).
- Identificação: o **remetente** é o usuário do CRM e os **destinatários** são os contatos, gerando a atividade.

**Envio**
- Pela API do provedor (`users.messages.send` / Graph `sendMail`): o e-mail sai da conta real do vendedor.
- SMTP de reserva (por tenant) quando não houver conta conectada. Configurar **SPF, DKIM e DMARC** no domínio.
- Envio agendado e lote via fila BullMQ, com limite de taxa por conta (respeitando os limites de Google e Microsoft).

**Rastreamento de abertura e cliques**
- Endpoints públicos na API, num subdomínio próprio (ex.: `t.crm.aledias.com.br`):
  - `GET /t/o/:token.gif` → pixel 1×1 (abertura)
  - `GET /t/c/:token` → registra o clique e redireciona (com validação do destino, sem *open redirect*)
- Token opaco e assinado (não expõe IDs) e rate limit.
- Filtro de aberturas automáticas conhecidas (proxies de pré-carregamento) para reduzir falsos positivos.

---

### 11.3 Container de *worker*

- Mesma imagem Docker da API, iniciada com outro comando (`node dist/worker.js`).
- Responsável por: filas BullMQ, entrega de webhooks (n8n), processamento de mensagens WhatsApp, sync de e-mail/agenda, envio de e-mails, notificações, recorrência de tarefas e lembretes.
- Separar do container da API evita que tarefas pesadas deixem a interface lenta, e cada um escala de forma independente.
- RAM estimada: **~300–600 MB**.
- **Outbox (E10):** a API grava o evento em `eventos_outbox` na mesma transação do dado; o relay do worker (agendador do BullMQ, a cada 2 s, só um worker por ciclo) reserva lotes com `app_reservar_eventos` (sem `BYPASSRLS`), entrega cada evento com o tenant dele ativo e usa `jobId = evento-<id>`. Falha: espera progressiva (5 s, 10 s... até 1 h) e, após 8 tentativas, `falhou_em`. Entrega **pelo menos uma vez**: os consumidores são idempotentes. Latência de até ~2 s.
- **E-mails (E10c):** a API nunca fala SMTP; só enfileira. *Identidade* (verificação e recuperação de senha, sem tenant): direto na fila `email` do BullMQ, com o conteúdo cifrado em AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, texto com prefixo de versão `v1:` para permitir trocar a chave), 6 tentativas com espera exponencial (5 s, 10 s, 20 s...); concluído ou esgotado, o conteúdo é apagado do job. Se não der para enfileirar (Valkey fora), a requisição falha (503). *Convite*: evento `convite.enviar` no outbox, na mesma transação do convite; o **worker gera o token na hora do envio**, grava só o hash e envia o e-mail na mesma transação (falhou, desfaz e o relay repete com espera progressiva). O token do convite nunca passa pelo outbox nem pelo Valkey. Entrega **pelo menos uma vez**.
- Healthcheck, parada gradual (30 s; stop timeout do Coolify 45 s) e retenção dos jobs: `docs/esteira_deploy.md`, 7.1.1.

---

## 12. Fluxo de desenvolvimento e deploy

### Ambientes
- **Dev local:** `docker compose` com Postgres/PostGIS, Valkey e Garage; API e Web rodando com hot reload.
- **Produção:** Coolify na VPS.
- *(Sem staging por ora. Mitigação: CI rigoroso, migrações revisadas e backup antes de cada deploy com migração.)*

### Git e CI/CD
- Repositório no **GitHub**.
- Branches: `main` (produção) + branches de feature com Pull Request.
- **GitHub Actions** em cada PR: lint (ESLint), formatação (Prettier), typecheck, testes (Vitest + testes de RLS) e build.
- Merge na `main` → **Coolify faz build e deploy automático** (webhook).
- Migrações Drizzle executadas no deploy da API, antes de iniciar a nova versão.
- Commits no padrão Conventional Commits.

### Testes
- Unitários: Vitest.
- Integração da API: Vitest/Supertest com Postgres real (Testcontainers ou o compose).
- **Isolamento multitenant** testado de forma obrigatória.
- E2E (fluxos críticos): Playwright, em fase posterior.

---

## 13. Observabilidade (Essencial)

- **Erros:** GlitchTip self-hosted (compatível com o SDK do Sentry) ou Sentry em nuvem, no front e no back.
- **Disponibilidade:** Uptime Kuma monitorando app, API e banco, com alerta por e-mail/Telegram.
- **Logs:** estruturados em JSON (Pino) com `request_id`, `tenant_id` e `user_id`, consultados pelo Coolify.
- Evolução futura: Grafana + Loki + Prometheus, se necessário.

---

## 14. Performance (diretrizes)

- Paginação por **cursor** nas listas grandes.
- Índices compostos com `tenant_id` e índices `pg_trgm` para busca de nomes.
- Cache no Valkey para dados de leitura frequente (configurações do tenant, permissões).
- Front com code splitting por rota, lazy loading e cache inteligente (TanStack Query).
- Compressão (gzip/brotli) e cache HTTP para os assets estáticos.
- Processamentos pesados sempre em **fila**, nunca na requisição.

---

## 15. Decisões registradas

| # | Decisão | Escolha |
|---|---|---|
| 1 | Back-end | NestJS |
| 2 | Comunicação | REST + OpenAPI |
| 3 | Offline | Leitura offline + fila de ações |
| 4 | Arquivos | Garage na VPS (+ backup externo no R2); MinIO descartado por descontinuidade |
| 5 | Autenticação | Better Auth na API |
| 6 | Multitenant | Banco único + RLS |
| 7 | App nativo | Capacitor, preparado desde já |
| 8 | Geocodificação | Híbrido (Google + cache + Nominatim) |
| 9 | VPS | Oracle Cloud ARM64, 4 vCPU, 24 GB RAM (antes estimado em 12 GB) |
| 10 | Repositório / deploy | GitHub + Coolify |
| 11 | Ambientes | Dev local + Produção |
| 12 | Observabilidade | Essencial (GlitchTip/Sentry + Uptime Kuma + logs) |
| 13 | n8n | Instância já existente; integração por webhooks (HMAC) + API com chaves por tenant |
| 14 | Evolution API | Instância já existente; 1 instância por vendedor, webhook para o CRM, mídias no Garage do CRM |
| 15 | Isolamento | Postgres e Valkey próprios do CRM; comunicação entre serviços só por API, via rede Docker interna |
| 16 | E-mail/agenda | Gmail/Calendar API + Microsoft Graph via OAuth; BCC por IMAP; SMTP de reserva |
| 17 | Verificação Google | Começar em modo de teste/interno + BCC; verificação completa (CASA) quando houver clientes externos com Gmail |
| 18 | Worker | Container separado para filas e sincronizações |
| 19 | Tempo real e push | SSE/Socket.io + Web Push (PWA) + FCM/APNs (Capacitor) |
| 20 | Multiempresa | Conta → tenants → membros; empresa ativa na sessão; consolidado só leitura via `app.tenant_ids`, só para administradores da conta |
| 21 | Organizações do Better Auth | **Não usadas**: o Better Auth só faz identidade; empresas, membros e convites são nossos, sob RLS |
| 21 | Domínios | App em `crm.aledias.com.br`, API em `api.crm.aledias.com.br` (subdomínios via registro curinga `*.crm`) |

## 16. Próximos passos

1. Definir as **funcionalidades** (básicas e avançadas) do CRM.
2. **Modelagem do banco** (entidades, relacionamentos, RLS).
3. Montar o **esqueleto do monorepo** e o ambiente dev local.
4. Configurar o Coolify (serviços, domínios, backups) e o CI no GitHub.

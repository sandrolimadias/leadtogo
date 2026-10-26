# CRM Alessandro — Configuração de Tecnologia

> Documento de definições técnicas do projeto.
> Status: **Aprovado (v1.1)** · Data: 05/10/2026
> v1.7: **modelo comercial** (SaaS multiempresa, com a porta aberta para on-premise) e as proteções a adotar desde já (seção 17)
> v1.1: n8n e Evolution API (já em produção na VPS) incorporados à arquitetura
> v1.2: e-mail (Gmail/Microsoft Graph, BCC, rastreamento), agendas, tarefas Kanban, notificações e container de *worker*
> v1.3: multiempresa (conta dona de vários tenants, empresa ativa na sessão, leitura consolidada via RLS)
> v1.6: arquivos no **Garage** (S3) no lugar do MinIO, descontinuado
> v1.5: servidor real levantado: Oracle Cloud **ARM64 (aarch64)**, 4 vCPU, 24 GB; imagens multi-arquitetura; PostGIS em imagem com suporte ARM
> v1.4: domínios definidos: `crm.aledias.com.br` (app e `/v1`, **domínio único**) e `api.crm.aledias.com.br` (integrações servidor a servidor)

---

## 1. Requisitos que guiaram as escolhas

- Funcionar no **computador (PWA)**, **tablet** e **celular**.
- **Multitenant** (várias empresas no mesmo sistema, dados isolados).
- Prioridades: **performance, segurança e usabilidade**.
- **Geolocalização e roteirização** de visitas: entregues pós-MVP (G1 a G4, aprovados em 22 e 23/10/2026; seção 10).
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
| Rotas (G4) | OSRM + VROOM (otimização de roteiro), pilha `leadtogo-rotas` |
| Repositório / CI | **GitHub + GitHub Actions** |
| Deploy | **Coolify** (deploy automático por branch) |
| Ambientes | **Dev local + Produção** |
| Observabilidade | **Essencial:** GlitchTip self-hosted (SDK do Sentry) + Uptime Kuma + logs estruturados (Pino); alertas por e-mail |
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
│   ├── web/          → React + Vite (PWA) — também empacotado pelo Capacitor
│   └── portal/       → React + Vite (PWA), o Portal do Cliente (portal.aledias.com.br); fala só com /v1/portal/*
├── packages/
│   ├── shared/       → schemas Zod, tipos, enums, regras comuns
│   ├── ui/           → componentes e tokens compartilhados entre o CRM e o portal (@leadtogo/ui)
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
- **Guards** para autenticação, tenant e permissões. **Perfis de acesso por tenant** (Fase 1): `PermissaoService`, guard e decorator `@Permissao('modulo.acao')` no lugar das checagens de papel; o contexto da requisição traz o perfil e as permissões (catálogo em `packages/shared/src/permissoes.ts`), o alcance (`propria`, `equipe`, `todas`) vira o `EscopoDaCarteira` e um teste falha se uma rota de negócio não declara permissão. **Sem cache de permissões:** o perfil e as permissões são lidos a cada requisição, na transação dela e sob RLS (duas consultas pequenas por índice), então editar um perfil ou trocar o perfil de alguém vale na requisição seguinte, sem invalidação. A checagem do `@Permissao` fica no `TenantInterceptor` (os guards do Nest rodam antes da transação). Se um dia entrar cache no Valkey, a chave leva o `tenant_id` e é invalidada ao editar o perfil ou trocar o perfil do membro.
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
- **2FA (TOTP)** disponível para todos os usuários e **exigido por política de cada empresa** (`admin` padrão, `admin_gestor` ou `todos`); sempre exigido de administradores de conta.
- **Sem o plugin de organizações.** O Better Auth cuida só da **identidade** (usuário, sessão, 2FA, recuperação de senha). Empresas, membros, convites e a empresa ativa ficam nas nossas tabelas (`tenants`, `membros`, `convites`), sob RLS, para não haver duas fontes da verdade. A empresa ativa é um campo da sessão (`empresaAtivaId`).
- **2FA por política da empresa:** o Better Auth não impõe isso sozinho; o guard da API aplica a regra da **empresa ativa** ao perfil do usuário nela: o flag `exige_2fa` do perfil de acesso (função `app_vinculos_com_perfil`, migração 0027); sem perfil (transição), a política antiga `tenant_configuracoes.dois_fatores_exigido` por papel, e sempre aos administradores de conta (dono/administrador). Sem 2FA onde é exigido, responde `403 2fa_obrigatorio`, deixando passar só `GET /v1/me`, a troca de empresa (`POST /v1/sessao/empresa-ativa`: a regra vale na empresa que ficar ativa), as rotas de ativação do 2FA e o logout. Um gancho do Better Auth barra `POST /v1/auth/two-factor/disable` (403 `DOIS_FATORES_OBRIGATORIO`) enquanto alguma regra exigir o 2FA daquele usuário e exige a senha **e** um código atual (`code`) para desativar. `PATCH /v1/configuracoes/seguranca` (`seguranca.gerir`) liga e desliga o 2FA de cada perfil; o Administrador sempre exige.
- Senhas com **scrypt** (padrão do Better Auth, sem dependência nativa na imagem ARM64). Verificação de e-mail obrigatória para entrar **em produção** (flag).
- O handler do Better Auth é montado direto (`toNodeHandler`) em `/v1/auth/*`, antes do parser de corpo do Nest; a API tem guard próprio (sessão, tenant e 2FA).
- **Domínio único e cookies:** o usuário só fala com `crm.aledias.com.br`. O **Traefik** (Coolify) roteia `crm.aledias.com.br/v1/*` (inclui o Better Auth em `/v1/auth/*`) para a API e o resto para o web. O front usa **caminhos relativos** (`/v1/...`), como o proxy do Vite em desenvolvimento; por isso a mesma imagem do web serve para qualquer ambiente, a CSP do web é `connect-src 'self'` mais só três domínios externos (GlitchTip, bucket público do mapa e Garage dos arquivos, para o envio direto dos anexos), o cookie de sessão (`HttpOnly`, `Secure`, `SameSite=Lax`, sem `Domain`) vale **só para o host `crm.aledias.com.br`** e o CORS é desnecessário para o front (mesma origem; o CORS do código fica restrito ao `APP_URL` e não é usado). `APP_URL` e `API_URL` são ambos `https://crm.aledias.com.br` (os links dos e-mails de senha e de verificação passam por ele). O `api.crm.aledias.com.br` fica **só para integrações servidor a servidor** (webhooks, n8n, Evolution).
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
- **Bucket público do mapa base (21/10/2026):** além dos buckets privados, existe o `leadtogo-mapa`, com o modo *website* do Garage (porta **3902**, leitura anônima de objetos, sem listagem), alias `mapa.crm.aledias.com.br`, só com o PMTiles versionado (`es-AAAAMMDD.pmtiles`, dado do OpenStreetMap, nenhum dado de cliente), `Cache-Control` imutável e CORS só para `https://crm.aledias.com.br`; o navegador o lê direto (`MAPA_BASE_URL`, obrigatória em produção). O que é específico desta instalação no Coolify (`roteiro_mapa_publico.md`): (1) o Garage é um **serviço Docker Compose** (`Garage-leadtogo-files`) com as regras do Traefik **escritas à mão** no Compose (routers `garage-http`/`garage-https` para a 3900; para o mapa, `garage-mapa-http`/`garage-mapa` com `Host(mapa.crm.aledias.com.br)`, service `garage-mapa` na 3902, `certresolver=letsencrypt`, e `traefik.http.routers.garage-http.service=garage` explícito); o domínio da tela *Domains* do Coolify **não é aplicado**; (2) o `garage.toml` é **gerenciado pelo Coolify** (*Storages → Files*, regravado a cada deploy): o bloco `[s3_web]` com `bind_addr = "[::]:3902"` fica ali, e editar só o arquivo no disco não basta; (3) **não há terminal do container**: os comandos `/garage` rodam pelo terminal do servidor com `docker exec garage-0tdmqt0xu2rbfs4wpygkmxwr /garage ...`; (4) o `rpc_secret` e o `admin_token` do `garage.toml` foram **trocados em 22/10/2026** (nada do sistema usa o `admin_token`).

- **Anexos dos chamados (Fase 2):** a API gera a URL pré-assinada de envio (`PUT`) e de download (`GET`) com um **cliente de assinatura apontado para `S3_PUBLIC_ENDPOINT`** (o endereço que o navegador alcança; o `S3_ENDPOINT` interno continua para a API e o worker). Dependência nova: `@aws-sdk/s3-request-presigner`. O bucket precisa de **CORS** para `https://crm.aledias.com.br` (`PUT` e `GET`) e a CSP do web (`connect-src` em `docker/web.Caddyfile`) inclui o host dos arquivos; o passo a passo está em `roteiro_garage_anexos.md`. Chave do objeto: `tenant_id/chamados/<chamado>/<anexo>`.
- **Antivírus (ClamAV):** serviço `clamav/clamav:1.4` na rede interna (porta 3310, nunca publicada), `StreamMaxLength` e `MaxFileSize` de 30 MB, **~1,5 GB de RAM** e carga das assinaturas na primeira subida (alguns minutos). O worker consome a fila `antivirus` (concorrência 2), envia o arquivo ao clamd por **INSTREAM** e grava `limpo` ou `infectado` (com o nome do vírus); sem resposta, tenta de novo com espera crescente e o anexo fica "em verificação". Variáveis: `CLAMAV_HOST` (sem ela os anexos ficam **desligados**, nada passa sem varredura), `CLAMAV_PORT` (3310) e `CLAMAV_TIMEOUT_MS` (120000). No desenvolvimento, o serviço está no perfil `antivirus` do `compose.dev.yml` (`docker compose --profile antivirus up -d`).
- **Tempo real do sino (SSE):** `GET /v1/notificacoes/fluxo` (`text/event-stream`) entrega as notificações do próprio membro; o worker publica no Valkey (canal por empresa e membro) depois do commit do outbox e a API repassa. O proxy (Traefik) não pode armazenar nem cortar a conexão; se cair, o sino volta a funcionar pelo recarregamento.

---

## 10. Geolocalização e roteirização (G1 a G4, entregues)

> **Como ficou (23/10/2026):** a tabela abaixo é a previsão original. O que foi implementado está em `plano_geolocalizacao.md` e `geo_g0_relatorio.md`: **CNEFE do IBGE no Postgres + Nominatim local só do ES** (o Google foi descartado no G0 pelos termos de uso), **PMTiles do ES** num bucket público do Garage, **MapLibre**, e **OSRM + VROOM** na pilha `leadtogo-rotas` do Coolify (`scripts/geo/rotas-compose.yml`; preparo no WSL, `geo_atualizacao.md`, seção 3A; ligação na API por `VROOM_URL`/`OSRM_URL`, `roteiro_rotas_producao.md`; **ligada em produção em 23/10/2026**). **Rastreamento em campo não existe** (LGPD: a posição do vendedor só se grava no check-in).


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
| GlitchTip | self-hosted (decidido em 09/10/2026), com banco e Valkey próprios | ~500 MB–1 GB |
| Coolify + Traefik | — | ~1 GB |
| **n8n** *(já existente)* | com seu próprio banco | ~300 MB–1 GB |
| **Evolution API** *(já existente)* | com seu próprio banco/cache | ~300 MB–1 GB (cresce com o nº de instâncias) |
| **Worker do CRM** | mesma imagem da API | ~300–600 MB |

Total estimado do Leadtogo: **~3–5 GB**. Medição de 06/10/2026: a VPS usa ~5 GB de 23 GB (n8n, Evolution, 2 WordPress com MySQL, Coolify), então há folga confortável.

- **Conferir o consumo real** dos serviços existentes antes de subir o CRM (`docker stats` na VPS ou métricas do Coolify).
- O **GlitchTip self-hosted** foi o escolhido (dados dos erros ficam na VPS); acompanhe a RAM dele nas métricas do Coolify.
- Definir **limites de memória** por container no Coolify, para que um serviço não derrube os outros.
- O **OSRM** só do ES coube na VPS sem upgrade (medido em 23/10/2026: OSRM 286 MiB, VROOM 50 MiB; 30 paradas em 0,11 s). Um estado a mais exige reavaliar (`backlog_pos_mvp.md`, geolocalização multi-UF).

- **Domínios:** `crm.aledias.com.br` (front e `/v1`), `api.crm.aledias.com.br` (integrações servidor a servidor e health check da esteira), `files.crm.aledias.com.br` (Garage, se necessário), `t.crm.aledias.com.br` (rastreamento de e-mail).
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

- Mesma imagem Docker da API, com outro papel: `PAPEL=worker` no `node dist/iniciar.js` (o `CMD` da imagem; o Coolify ignora o comando de partida de recursos Docker Image). `node dist/worker.js` também funciona sozinho.
- Responsável por: filas BullMQ, entrega de webhooks (n8n), processamento de mensagens WhatsApp, sync de e-mail/agenda, envio de e-mails, notificações, recorrência de tarefas e lembretes.
- Separar do container da API evita que tarefas pesadas deixem a interface lenta, e cada um escala de forma independente.
- RAM estimada: **~300–600 MB**.
- **Outbox (E10):** a API grava o evento em `eventos_outbox` na mesma transação do dado; o relay do worker (agendador do BullMQ, a cada 2 s, só um worker por ciclo) reserva lotes com `app_reservar_eventos` (sem `BYPASSRLS`), entrega cada evento com o tenant dele ativo e usa `jobId = evento-<id>`. Falha: espera progressiva (5 s, 10 s... até 1 h) e, após 8 tentativas, `falhou_em`. Entrega **pelo menos uma vez**: os consumidores são idempotentes. Latência de até ~2 s.
- **Importação de planilha (Módulo 4):** o "Iniciar" muda o lote para `em_andamento` e grava o evento `importacao.executar` no outbox, na mesma transação; o relay entrega e o manipulador enfileira o job na fila `importacao` (`jobId = evento-<id>`, 3 tentativas, espera fixa de 30 s para erro inesperado). Essa fila tem **concorrência 1** por processo: a Minha Receita não tem SLA e o intervalo entre consultas (padrão 3 s, de 500 ms a 60 s) vale por consulta de verdade, não por consulta que veio do cache de 30 dias. O executor (`apps/api/src/importacao/executor.ts`) processa uma linha por transação (a empresa e o resultado da linha gravam juntos), só mexe em linhas pendentes (**retomável**) e confere a situação do lote antes de cada linha (**cancelar** é mudar a situação). Receita fora do ar: 3 novas tentativas com espera de 10 s, 30 s e 60 s; a linha vira erro e 3 linhas seguidas nessa situação param o lote (`falhou`), que se retoma depois. Ao terminar (ou parar) grava a notificação `importacao.fim` para quem iniciou.
- **E-mails (E10c):** a API nunca fala SMTP; só enfileira. *Identidade* (verificação e recuperação de senha, sem tenant): direto na fila `email` do BullMQ, com o conteúdo cifrado em AES-256-GCM (`TOKEN_ENCRYPTION_KEY`, texto com prefixo de versão `v1:` para permitir trocar a chave), 6 tentativas com espera exponencial (5 s, 10 s, 20 s...); concluído ou esgotado, o conteúdo é apagado do job. Se não der para enfileirar (Valkey fora), a requisição falha (503). *Convite*: evento `convite.enviar` no outbox, na mesma transação do convite; o **worker gera o token na hora do envio** e grava só o hash, com **commit antes do envio**; o e-mail sai depois, fora da transação (o link nunca chega antes de o hash estar visível), e só então o evento é marcado como entregue. Se o envio falhar, o relay repete com espera progressiva e a nova tentativa gera um **token novo** (o hash anterior nunca foi entregue). O token do convite nunca passa pelo outbox nem pelo Valkey. Entrega **pelo menos uma vez**.
- **Jobs agendados (E10d):** agendadores do BullMQ (`upsertJobScheduler`, fila `manutencao`, horário UTC): partições da auditoria no dia 1º às 03:00 (e uma vez na partida), limpeza diária de convites (04:00) e do outbox (04:15), sempre via funções `SECURITY DEFINER` (`docs/modelagem_banco.md`, 11). Cada horário gera um só job, então vários workers não duplicam; até 20 lotes por execução. O envio por SMTP tem limite de `SMTP_TIMEOUT_MS` (10 s), pois o convite é enviado dentro de uma transação.
- **Jobs do portal (Fase 3E):** a cada minuto, `enviar-avisos` (entrega os avisos agendados que venceram, via evento do outbox `portal.aviso_enviar`) e `enviar-pushes` (envia os pushes que já podem sair, no máximo uma vez por pessoa e aviso); a cada 5 minutos, `lembrar-eventos` (3D) e `publicar-agendadas` a cada minuto (3B). O push usa a biblioteca `web-push` (Web Push com VAPID; variáveis `VAPID_*` na API e no worker; sem elas o push fica desligado).
- Healthcheck, parada gradual (`WORKER_ENCERRAMENTO_S=8` em produção, abaixo dos 10 s do Docker, já que o Coolify ignora o `--stop-timeout`) e retenção dos jobs: `docs/esteira_deploy.md`, 7.1.1.

---

### 11.4 Consulta de CNPJ (Minha Receita)

- **Fluxo** (`apps/api/src/receita/`): valida o CNPJ (alfanumérico) → lê o cache `receita_consultas` (validade de 30 dias) → consulta a **Minha Receita** (`GET {MINHA_RECEITA_URL}/{cnpj}`, prazo de 8 s) → em falha de rede, tempo esgotado, 429 ou 5xx, tenta a **BrasilAPI** (`BRASILAPI_URL`) → grava o JSON no cache com a fonte. **400** (CNPJ recusado) e **404** (CNPJ inexistente) são definitivos e não vão para a alternativa. Com as duas fontes fora do ar, usa o cache vencido (a resposta avisa `expirada`) ou responde 503 `receita_indisponivel`. Consultas iguais ao mesmo tempo viram uma só chamada; a rota limita 20 consultas por minuto por IP.
- **Limitação da alternativa:** a **BrasilAPI não é independente**: o serviço de CNPJ dela só repassa `https://minhareceita.org/{cnpj}` (conferido no código dela, `services/cnpj.js`, em 13/10/2026). Ela cobre falha de rede ou de hospedagem da Minha Receita, **não** uma queda da base dela. Mesmo assim fica como segunda tentativa, por passar por outra infraestrutura e outro cache.
- **A alternativa de verdade** será a **instância própria da Minha Receita** (código aberto, com a base completa da Receita; ver `escopo_mvp.md`, Prospecção). Quando existir, basta apontar `MINHA_RECEITA_URL` para ela, sem mudar código; a Minha Receita pública e a BrasilAPI podem ficar como reserva.
- **Sem garantia de serviço:** a Minha Receita pública não publica limite de uso nem SLA. Por isso o cache, o limite por IP e, na importação (Módulo 4), a fila com intervalo configurável entre consultas.
- **Variáveis** (todas opcionais, com padrão de produção; ver `.env.example`): `MINHA_RECEITA_URL`, `BRASILAPI_URL` e `RECEITA_TIMEOUT_MS`.

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

- **Erros:** **GlitchTip self-hosted** (`https://erros.crm.aledias.com.br`), com o SDK do Sentry: `@sentry/node` na API e no worker (projeto `leadtogo-api`, tag `papel` = `api` ou `worker`) e `@sentry/react` no web (projeto `leadtogo-web`).
  - `release` = `APP_VERSION` (o commit), `environment` = `production`, `tracesSampleRate` 0, sem replay. No SDK 11 o antigo `sendDefaultPii` virou `dataCollection`, configurado para não coletar usuário, cookies, cabeçalhos, corpos, query string, variáveis locais nem trechos de código.
  - Todo evento passa por `limparEvento` (`packages/shared/src/limpeza-erros.ts`): remove cookies, `Authorization`, corpo da requisição, e-mails, CPF/CNPJ (inclusive alfanumérico) e telefones. Só `tenant_id`, `user_id` e `request_id` (uuids) saem, como tags.
  - **Sem `SENTRY_DSN` o SDK fica desligado** (desenvolvimento e testes não enviam nada).
  - **DSN do web:** build arg `VITE_SENTRY_DSN` (Variable `SENTRY_DSN_WEB` do GitHub). O web é estático e o DSN do navegador é público por desenho; uma configuração em runtime exigiria um arquivo gerado pelo Caddy fora do precache do service worker, sem ganho enquanto houver só um ambiente. A CSP do web libera `connect-src https://erros.crm.aledias.com.br`.
  - **Source maps:** o web usa `@sentry/vite-plugin` no build (debug IDs, upload ao GlitchTip, mapas apagados), só com `SENTRY_AUTH_TOKEN`, e os `.map` nunca entram na imagem. A API mantém os `.map` na imagem e a imagem define `NODE_OPTIONS=--enable-source-maps`, sem upload.
- **Disponibilidade:** Uptime Kuma monitorando o web, a API (`/health` cobre banco, Valkey e Garage), a rota `/v1`, o painel e o GlitchTip, e **`GET /health/alertas`** (protegido por `ALERTAS_TOKEN`) para os problemas silenciosos: eventos do outbox esgotados (função `SECURITY DEFINER`, sem `BYPASSRLS`) e falhas finais de jobs do BullMQ nas últimas 24 h. A resposta só tem contagens. Eventos esgotados são tratados com `node dist/outbox-tratar.js`.
- **Alertas:** **só e-mail por enquanto** (Uptime Kuma e notificações do Coolify, via Resend). Evolução futura: Telegram e WhatsApp (Evolution/n8n), incluindo a notificação de deploy.
- **Logs:** estruturados em JSON (Pino) com `request_id`, `tenant_id` e `user_id`, consultados pelo Coolify; a tag `request_id` do GlitchTip leva ao log da requisição.
- **Teste:** `node dist/testar-erro.js` (terminal do container) envia um erro de teste, sem rota HTTP.
- **Evolução futura:** **Zabbix + Grafana** para métricas de infraestrutura (VPS, containers, PostgreSQL e Valkey), instalados **fora da VPS** (servidor próprio, acessado via Tailscale). O GlitchTip continua para erros de código. `/health`, `/health/alertas` e o batimento do backup migram para itens HTTP/trapper do Zabbix. Substitui a ideia anterior de Grafana + Loki + Prometheus.
- Passo a passo e testes: `docs/runbook_observabilidade.md`.

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
| 12 | Observabilidade | Essencial (GlitchTip self-hosted + Uptime Kuma + logs); alertas só por e-mail, Telegram/WhatsApp depois |
| 13 | n8n | Instância já existente; integração por webhooks (HMAC) + API com chaves por tenant |
| 14 | Evolution API | Instância já existente; 1 instância por vendedor, webhook para o CRM, mídias no Garage do CRM |
| 15 | Isolamento | Postgres e Valkey próprios do CRM; comunicação entre serviços só por API, via rede Docker interna |
| 16 | E-mail/agenda | Gmail/Calendar API + Microsoft Graph via OAuth; BCC por IMAP; SMTP de reserva |
| 17 | Verificação Google | Começar em modo de teste/interno + BCC; verificação completa (CASA) quando houver clientes externos com Gmail |
| 18 | Worker | Container separado para filas e sincronizações |
| 19 | Tempo real e push | SSE/Socket.io + Web Push (PWA) + FCM/APNs (Capacitor) |
| 20 | Multiempresa | Conta → tenants → membros; empresa ativa na sessão; consolidado só leitura via `app.tenant_ids`, só para administradores da conta |
| 21 | Organizações do Better Auth | **Não usadas**: o Better Auth só faz identidade; empresas, membros e convites são nossos, sob RLS |
| 22 | Modelo comercial | **SaaS multiempresa** (decidido); on-premise (Docker no cliente, eventualmente com licença perpétua + manutenção anual) como possibilidade futura para clientes maiores; proteções adotadas desde já na seção 17 |
| 21 | Domínios | Domínio único `crm.aledias.com.br` (Traefik: `/v1` → API, resto → web); `api.crm.aledias.com.br` só para integrações (subdomínios via registro curinga `*.crm`) |

## 16. Próximos passos

1. Definir as **funcionalidades** (básicas e avançadas) do CRM.
2. **Modelagem do banco** (entidades, relacionamentos, RLS).
3. Montar o **esqueleto do monorepo** e o ambiente dev local.
4. Configurar o Coolify (serviços, domínios, backups) e o CI no GitHub.

---

## 17. Modelo comercial e distribuição

**Decisão (12/10/2026, confirmada pelo Ale):** o Leadtogo é vendido como **SaaS multiempresa**. O **on-premise** (Docker no servidor do cliente, eventualmente com **licença perpétua + manutenção anual**) fica como **possibilidade futura, para clientes maiores**. A ideia anterior de vender só com licença perpétua está **substituída**.

Não há um segundo produto: é o mesmo código e as mesmas imagens. O que se faz **desde já** é evitar escolhas que fechem a porta do on-premise; **nenhuma mudança de arquitetura** decorre disto: o sistema segue multiempresa, hospedado, com RLS. O modelo de distribuição do on-premise (como as atualizações chegam, a chave de licença e como é verificada, o suporte) **só se detalha quando houver o primeiro cliente que peça**.

### Proteções a adotar desde já

1. **Imagens para `amd64` e `arm64`, só nas versões numeradas.** Hoje cada push na `main` publica só `linux/arm64` (a VPS é ARM). A imagem **`linux/amd64`** (o que quase todo servidor de cliente usa) é gerada **apenas quando houver uma versão numerada** (*release* com tag, ex.: `v1.0.0`), **nessa hora** e **não a cada push**. O build usa **runner nativo** para cada arquitetura (`ubuntu-24.04` para amd64 e `ubuntu-24.04-arm` para arm64), **sem QEMU**, e as duas viram um manifesto multi-arquitetura no GHCR com a tag da versão. O fluxo de deploy atual (push na `main` → arm64 → Coolify) **não muda**. Entra como commit de CI próprio **quando o primeiro release com tag for preparado** (ver `esteira_deploy.md`); antes disso não há nada a fazer.
2. **Nenhuma dependência obrigatória dos serviços do Ale.** O sistema sobe e funciona sem o n8n, a Evolution API, o GlitchTip, o Uptime Kuma e o Resend do Ale:
   - **E-mail:** hoje o SMTP é **global, por variável de ambiente** (`SMTP_HOST`...), sem ele nenhum e-mail sai e o app funciona; o **SMTP por tenant** (Configurações → E-mail, já previsto em `funcionalidades.md`) é o que o on-premise e os clientes com domínio próprio vão usar. O Resend é só o padrão do SaaS.
   - **GlitchTip/Sentry:** **opcional** (sem `SENTRY_DSN`, o app roda normalmente).
   - **Backup:** destino e agenda **configuráveis** (hoje o script cobre o Garage local e o R2); sem credenciais externas obrigatórias.
   - Integrações (n8n, WhatsApp) continuam opcionais e por tenant.
3. **Migrações só para frente.** Sempre **expandir e depois contrair**, nunca editar migração aplicada. Isso permite atualizar um cliente on-premise que está várias versões atrás, aplicando as migrações em sequência, sem *rollback* de esquema.
4. **Limites de plano num módulo isolado** (`apps/api/src/plano/`, a criar): toda regra do tipo "até N usuários", "até N empresas", recurso ligado ou desligado passa por **uma única interface** (`PlanoService`: limites e recursos do tenant). No SaaS, ela lê a **assinatura** (`contas.plano` e a cobrança); no on-premise, leria uma **chave de licença** assinada. O restante do código **não** conhece a origem dos limites.

### Pendências pós-MVP do SaaS

- **Cadastro e cobrança self-service** (criar a conta, escolher o plano, pagar e cancelar sem o Ale).
- **Painel administrativo** do Ale (contas, empresas, uso, suspensão, suporte).
- **Plano de capacidade** (quantos clientes por VPS, quando separar banco, fila e arquivos, custo por cliente).
- **Contratos** (termos de uso, DPA, SLA e política de privacidade; ver `lgpd.md`).
- **Empacotamento on-premise** (compose do cliente, instalação, atualização e licença), só quando houver o primeiro cliente que peça.
- **Instância própria da Minha Receita** (código aberto) com a base completa de CNPJs, para a Prospecção e para escalar a importação (ver `escopo_mvp.md`): dimensionar disco, carga e atualização da base.

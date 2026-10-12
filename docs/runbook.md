# Runbook de operação do Leadtogo

Índice de operação: o que fazer quando algo precisa ser feito ou quebra, **na ordem em que acontece**. Os passos longos ficam nos documentos de detalhe (linkados abaixo); aqui está o caminho e o que conferir. **Nenhuma senha, token ou chave mora neste arquivo**: ele diz *onde* cada uma fica (seção 7).

Referências: `runbook_e13.md` (Coolify, banco e primeiro deploy), `esteira_deploy.md` (CI/CD, imagens, migrações), `runbook_backup.md` (backups e restauração), `runbook_observabilidade.md` (GlitchTip, Uptime Kuma, alertas), `lgpd.md` (dados pessoais e incidentes).

## 0. Mapa rápido

| O quê | Onde |
|---|---|
| App (web) | `https://crm.aledias.com.br` · API: `https://crm.aledias.com.br/v1` e `https://api.crm.aledias.com.br` |
| Painel do Coolify | `https://painel.aledias.com.br` |
| Recursos no Coolify | `leadtogo-api`, `leadtogo-worker`, `leadtogo-web` (imagens do GHCR), `leadtogo-db` (PostgreSQL + PostGIS), `leadtogo-cache` (Valkey), `leadtogo-files` (Garage, `files.crm.aledias.com.br`) |
| Servidor | VPS Oracle Cloud ARM64, região São Paulo (`sa-saopaulo-1`), compartilhada com n8n e Evolution |
| Código e esteira | GitHub (repositório `leadtogo`, Actions `ci-cd`), imagens no GHCR (`sha-<commit>` e `latest`) |
| Backups | Cloudflare R2, bucket `vps-backup` (banco: Coolify, diário às 3h; arquivos: `rclone` pelo timer `backup-garage`, às 3h30) |
| Erros e disponibilidade | GlitchTip `erros.crm.aledias.com.br`; Uptime Kuma `status.crm.aledias.com.br` |
| E-mail | Resend (domínio `aledias.com.br`, remetente `nao-responda@aledias.com.br`) |

**Triagem em 30 segundos:**

| Sintoma | Vá para |
|---|---|
| Quero publicar uma mudança, ou o deploy não terminou | seção 1 |
| Publiquei e o app quebrou | seção 2 (rollback) |
| Dado apagado ou corrompido | seção 3 (restauração) |
| Suspeita de vazamento de senha, token ou chave | seção 4 (girar segredos) e, se houver dado pessoal exposto, `lgpd.md`, seção 8 |
| A VPS não responde ou foi perdida | seção 5 |
| Alguém entrou ou saiu da equipe | seção 6 |
| Rotina do mês | seção 8 |

## 1. Deploy

**Normal (automático):** todo push de **código** na `main` roda a esteira `ci-cd`: `escopo` → `quality` + `test` (inclui E2E) + `security` → `build` (ARM64 nativo) → `deploy` (Coolify) → `verify` → `limpeza`. Push só de documentação não passa pela esteira de deploy. Acompanhe com `gh run watch` (ou na aba *Actions*).

- O `deploy` só roda com a variável `DEPLOY_ENABLED=true`. Para **parar as publicações**: `gh variable set DEPLOY_ENABLED --body false`; para religar, `--body true`.
- O `verify` confere `https://api.crm.aledias.com.br/health` com o **commit novo** e o web em `https://crm.aledias.com.br/`. Esteira verde = no ar.
- **Migrações** rodam **ao iniciar a API** (`node dist/iniciar.js`), antes de ela responder. Se a migração falhar, o container novo nunca fica saudável e o Coolify **mantém a versão antiga no ar**: nada a desfazer; leia o log do deploy no Coolify, corrija e envie um novo push. Nunca edite uma migração já aplicada; corrija com uma migração nova. Migração destrutiva só com aviso e commit `BREAKING-DB:` (e backup manual antes).
- **Redeploy manual** (mesma imagem, sem mudança de código): no Coolify, nos recursos `leadtogo-api`, `leadtogo-worker` e `leadtogo-web`, botão *Redeploy*. Para publicar de novo o último commit pela esteira: `gh workflow run ci-cd.yml --ref main`.
- Depois de um deploy com migração, conferir no banco (`runbook_e13.md`, seção 4.6): `SELECT id, to_timestamp(created_at/1000) AS gerada_em FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 5;`. A data é a de **geração** da migração, não a de aplicação.
- **Conferência pós-deploy (2 min):** `curl -s https://api.crm.aledias.com.br/health` (versão = commit, banco/Valkey/Garage `ok`); entrar no app; Uptime Kuma sem monitor vermelho; GlitchTip sem erro novo.

## 2. Rollback

Detalhe: `runbook_e13.md`, seção 9 (e `esteira_deploy.md`, seção 8). Resumo:

1. **Pare as publicações:** `gh variable set DEPLOY_ENABLED --body false` (senão o próximo push sobrescreve o rollback).
2. **Ache o commit anterior bom:** `git log --oneline -10` e `git rev-parse <abreviado>` (a tag é o SHA completo, 40 caracteres; a limpeza do GHCR guarda as 15 `sha-*` mais recentes).
3. **No Coolify**, nos três recursos (`leadtogo-api`, `leadtogo-worker`, `leadtogo-web`): trocar a **Tag** de `latest` para `sha-<40 caracteres>` (a mesma nos três) e *Deploy* (~1 min).
4. **Conferir:** `/health` mostra o SHA antigo.
5. **Banco:** o rollback de imagem **não desfaz migração**. A regra "expandir e depois contrair" faz o código antigo funcionar com o esquema novo. Se a própria migração é o problema: nova migração corretiva; em último caso, restauração (seção 3).
6. **Definitivo:** `git revert <commit>` + push; depois volte a **Tag** dos três recursos para `latest` e religue o `DEPLOY_ENABLED`.

Se o deploy novo **não ficou saudável**, o Coolify já manteve a versão anterior: não é rollback, é só corrigir e publicar de novo.

## 3. Restauração (banco e arquivos)

**Quando:** dado apagado ou corrompido, migração que estragou dados, ou VPS perdida (seção 5). Só com decisão do Ale; avise os usuários antes (o sistema fica fora do ar).

**Banco** (`runbook_backup.md`):
- 2: **teste de restauração** num Postgres descartável, sem tocar na produção (baixar do R2 com `rclone`, `pg_restore`, conferir contagens). Faça pelo menos uma vez por trimestre.
- 3: **restauração em produção**: parar `api` e `worker` → preservar o estado atual (backup manual) → baixar e **validar** o backup num container descartável → restaurar (banco novo + trocar nomes, ou recriar o `leadtogo-db`) → conferir os papéis `leadtogo_owner` e `leadtogo_app` (sem `BYPASSRLS`) → subir `api` e `worker` (as migrações pendentes rodam ao iniciar a API) → `/health`, login e abrir uma empresa → registrar o incidente e fazer um backup manual.
- **RPO:** até 24 h (backup diário às 3h, 30 cópias no R2). Um dado excluído só some dos backups quando o backup expira (`lgpd.md`, seção 5).
- Para **olhar** o banco de produção (sem restaurar): `runbook_e13.md`, seção 4.6 (`psql` no container; o banco se chama `leadtogo`, e o `POSTGRES_DB` do container aponta para `postgres`).

**Arquivos (Garage):** espelho diário no R2 (`vps-backup/garage/leadtogo-arquivos`); versões antigas de arquivos alterados ou apagados ficam em `garage-alterados/<data>/` por 90 dias. Restaurar: `rclone copy r2:vps-backup/garage/leadtogo-arquivos` para o Garage, com uma chave **temporária** com escrita (a `backup-leitura` só lê). Detalhe e erros comuns: `runbook_backup.md`, seção 4. O teste real de restauração dos arquivos está pendente até existirem anexos.

## 4. Girar segredos

**Regra:** guarde os valores novos no **gerenciador de senhas** antes de aplicar. Variáveis de produção ficam **só no Coolify** (sem aspas, nunca como *Build Variable*); nada disso vai para o repositório nem para o chat. Depois de girar qualquer item, faça a conferência pós-deploy (seção 1) e confirme que o login e o envio de e-mail funcionam.

| Segredo | Onde fica | Efeito de girar | Como |
|---|---|---|---|
| `LEADTOGO_APP_PASSWORD` e `LEADTOGO_OWNER_PASSWORD` | Coolify (`DATABASE_URL`, `DATABASE_MIGRATION_URL`) e o banco | API e worker perdem a conexão até atualizar | Gerar `openssl rand -hex 24`; reexecutar o `papeis.sql` com as senhas novas (idempotente, `runbook_e13.md`, seção 4.2) e atualizar as URLs no Coolify (4.5); redeploy de api e worker |
| `BETTER_AUTH_SECRET` | Coolify | **Invalida todas as sessões e os 2FA cadastrados** (cada pessoa precisaria reativar o 2FA): só gire com motivo forte, como vazamento | `openssl rand -hex 32`; atualizar e redeploy |
| `TOKEN_ENCRYPTION_KEY` | Coolify (**guarde uma cópia fora**) | E-mails na fila e segredos cifrados ficam ilegíveis se a chave se perder | `openssl rand -base64 32`; só troque sem itens pendentes na fila |
| Chave do Garage `leadtogo-app` (`S3_ACCESS_KEY` e `S3_SECRET_KEY`) | Coolify | Upload e leitura de arquivos param até atualizar | Criar chave nova no Garage, dar acesso ao bucket, trocar no Coolify, redeploy, apagar a antiga |
| Chave do Garage `backup-leitura` e credenciais do R2 | `/root/backup-garage.env` na VPS (`chmod 600`) e *Storage* do Coolify | O espelho e os backups falham até atualizar | `runbook_backup.md`, seção 4.4 (um `key create` por nome: dois criam duas chaves) |
| API key do Resend (`SMTP_PASSWORD`) | Coolify (api e worker) e Uptime Kuma (chave `uptime-kuma`) | E-mails de convite, recuperação de senha e alertas param | Criar a chave nova no Resend, atualizar no Coolify e no Kuma, redeploy, revogar a antiga |
| `SENTRY_DSN` (api e worker), `SENTRY_DSN_WEB` e `SENTRY_AUTH_TOKEN` | Coolify; `SENTRY_DSN_WEB` (variável) e `SENTRY_AUTH_TOKEN` (secret) no GitHub | Erros deixam de chegar; `SENTRY_AUTH_TOKEN` só afeta o upload de source maps na esteira | `runbook_observabilidade.md`, seção 1 |
| `ALERTAS_TOKEN` | Coolify e cabeçalho `X-Alertas-Token` do monitor "Alertas" no Kuma | O monitor passa a dar 401 até atualizar | Gerar novo, atualizar nos dois lugares |
| `COOLIFY_TOKEN` (e os `COOLIFY_UUID_*`) | Secrets do GitHub (`gh secret set`) | O job `deploy` falha | Novo token na API do Coolify, `gh secret set COOLIFY_TOKEN` |
| Token do GHCR (`read:packages`) | Registro `ghcr.io` no Coolify | A VPS não consegue baixar imagens novas | Token *classic* só com `read:packages`; atualizar o registro |
| Push URL do Uptime Kuma | `/root/backup-garage.push` (`chmod 600`) | O backup deixa de avisar | `runbook_backup.md`, seção 4.1 |
| Chave SSH | `~/.ssh` do Ale e `authorized_keys` da VPS | — | Adicionar a nova chave **antes** de remover a antiga; SSH só por chave |

Se o segredo vazou de verdade: gire, revise os acessos recentes (GitHub, Coolify, Oracle, Cloudflare, Resend), confira o GlitchTip e os logs e, havendo dado pessoal exposto, siga `lgpd.md`, seção 8.

## 5. VPS perdida (ou caída sem volta)

**Antes de tudo:** ela só caiu, ou foi perdida? Confira o console da Oracle Cloud (a instância está de pé?), tente reiniciar pelo console e o SSH. Se voltar, faça só a conferência pós-deploy (seção 1) e confira o `leadtogo-db` (o `Persistent=true` do timer de backup refaz o que não rodou).

**Perdida de vez** (a ordem importa):
1. **Nova VPS ARM64** na Oracle (`sa-saopaulo-1`), mesmo perfil (4 vCPU, 23 GB, ou o que couber), com SSH só por chave, firewall só **22, 80 e 443**, e o Coolify instalado (`plano_implantacao.md`, E4).
2. **DNS (Cloudflare):** apontar `crm`, `*.crm` (cobre `api.crm`, `files.crm`, `status.crm` e `erros.crm`) e `painel` para o IP novo (`runbook_e13.md`, seção 1.1). Painel e certificados (Let's Encrypt) voltam sozinhos quando o DNS propaga.
3. **Recursos no Coolify**, nesta ordem: `leadtogo-db` (`imresamu/postgis:17-3.5`, sem porta pública, banco `leadtogo`), `leadtogo-cache`, `leadtogo-files` (Garage, bucket privado `leadtogo-arquivos`, chave `leadtogo-app`), registro `ghcr.io` (token `read:packages`), depois `leadtogo-api`, `leadtogo-worker` e `leadtogo-web` com as variáveis do gerenciador de senhas (`runbook_e13.md`, seções 4 e 5).
4. **Papéis do banco:** `papeis.sql` com as senhas (`runbook_e13.md`, seção 4.2).
5. **Restaurar o banco** do R2 (seção 3 e `runbook_backup.md`, seção 3) e **os arquivos** (`rclone copy` do espelho para o Garage novo).
6. **Subir api e worker**, `/health`, login, abrir uma empresa e conferir o checklist de `runbook_e13.md`, seção 8.
7. **Esteira:** novos `COOLIFY_URL`, `COOLIFY_TOKEN` e `COOLIFY_UUID_*` nos secrets do GitHub; `DEPLOY_ENABLED=true` só depois de tudo saudável.
8. **Observabilidade e backups:** recriar GlitchTip e Uptime Kuma (importar o export do Kuma, se houver), as notificações de e-mail, o backup diário do Coolify (destino R2), o script e o timer `backup-garage` (`runbook_backup.md`, seção 4) e o Push do Kuma.
9. **Registrar o incidente** e refazer um backup manual. **Perda esperada:** até 24 h de dados (RPO) e o tempo das etapas acima; nos arquivos, até 24 h também. Avisar os usuários da indisponibilidade e, se houver risco para dados pessoais, seguir `lgpd.md`, seção 8.

## 6. Acessos (onde ficam; sem senhas)

| Serviço | Para quê | Acesso | Credenciais |
|---|---|---|---|
| Oracle Cloud | VPS, firewall (Security List) | conta do Ale | gerenciador de senhas |
| SSH da VPS | administração | **só chave** (`PasswordAuthentication no`) | chave privada do Ale; evolução: só pelo Tailscale, porta 22 fechada |
| Coolify (`painel.aledias.com.br`) | recursos, variáveis, deploy, backups do banco | usuário administrador | gerenciador de senhas |
| GitHub | código, esteira, secrets, GHCR | conta do Ale | gerenciador de senhas + 2FA |
| Cloudflare | DNS e R2 (`vps-backup`) | conta do Ale | gerenciador de senhas + 2FA |
| Resend | e-mails transacionais | conta do Ale | gerenciador de senhas |
| GlitchTip / Uptime Kuma | erros e disponibilidade | usuários administradores dos dois | gerenciador de senhas |
| Leadtogo (administrador da conta) | uso do sistema | login com **2FA obrigatório** | senha do Ale + app autenticador + códigos de recuperação guardados à parte |

**Quem entra ou sai da equipe (empresa):** *Configurações → Usuários e equipe* (só administrador): convidar, mudar papel, **desativar** (vale na próxima requisição; o histórico fica) e reativar. Ex-membros: desative no mesmo dia. O dono da conta não é rebaixado nem desativado por outro administrador, e a empresa nunca fica sem administrador.

**Quem sai com acesso à infraestrutura** (se um dia houver mais gente): remover do GitHub, Coolify, Cloudflare, Oracle e Resend, remover a chave SSH de `authorized_keys` e girar os segredos que a pessoa conhecia (seção 4).

**Onde estão os contatos de suporte:** painéis de cada serviço (Oracle, Cloudflare, GitHub, Resend, Coolify). Mantenha no gerenciador de senhas o e-mail e o telefone de recuperação de cada conta.

## 7. Onde ficam os segredos

- **Produção:** variáveis de ambiente **só no Coolify** (por recurso); backups do espelho em `/root/backup-garage.env` e `/root/backup-garage.push` (`chmod 600`).
- **Esteira:** secrets do repositório no GitHub (`COOLIFY_*`, `SENTRY_AUTH_TOKEN`) e a variável `DEPLOY_ENABLED`.
- **Cópia de segurança:** gerenciador de senhas, **inclusive** `TOKEN_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, as senhas dos papéis do banco, as chaves do R2 e do Garage e os códigos de recuperação do 2FA do Ale.
- **Nunca** no repositório, em logs, em issues ou no chat. O `.env.example` só tem nomes, sem valores.

## 8. Checklist mensal (uns 30 minutos)

- [ ] **Backups do banco:** no Coolify, o último backup de **cada** banco (inclusive o do GlitchTip) com sucesso; no R2, arquivo novo no bucket `vps-backup`.
- [ ] **Espelho do Garage:** `systemctl list-timers | grep backup-garage` (próxima execução), `tail /var/log/backup-garage.log` (código de saída 0) e o monitor "Espelho Garage → R2" verde no Kuma.
- [ ] **Teste de restauração:** a cada trimestre, restaurar o backup do dia num banco temporário (seção 3) e conferir as contagens.
- [ ] **Uptime Kuma:** todos os monitores verdes; exportar o backup do Kuma (*Settings → Backup*) e guardar.
- [ ] **GlitchTip:** sem erros novos sem tratar; eventos do outbox esgotados tratados (`node dist/outbox-tratar.js`, `runbook_observabilidade.md`, seção 6).
- [ ] **Disco e memória da VPS:** Coolify sem alerta de disco; o disco tem folga (a VPS é compartilhada com n8n e Evolution).
- [ ] **Dependências e segurança:** PRs do Dependabot revisados, `pnpm audit` sem alto/crítico, esteira verde na `main`.
- [ ] **Sistema:** atualizações do Ubuntu e do Coolify aplicadas (de forma planejada, fora do horário de uso, com backup manual antes).
- [ ] **Certificados:** os de `crm`, `api.crm`, `files.crm`, `status.crm` e `erros.crm` válidos (renovam sozinhos).
- [ ] **Pessoas e acessos:** revisar *Usuários e equipe* (desativar quem saiu) e os acessos da seção 6.
- [ ] **E-mail:** domínio do Resend verificado e envios recentes sem bloqueio.
- [ ] **LGPD:** pendências do MVP em `lgpd.md` (seção 9) e pedidos de titulares atendidos no prazo.
- [ ] **Segredos:** nada vencendo; girar o que tiver motivo (seção 4).
- [ ] **GHCR:** a limpeza manteve as 15 `sha-*` mais recentes (o `verify` e o rollback dependem delas).

## 9. Manutenção deste documento

Mudou um procedimento (novo recurso, novo segredo, nova etapa na esteira)? Atualize este runbook **no mesmo commit** e, se for o caso, o documento de detalhe. Itens que ainda dependem de fases futuras ficam registrados em `plano_implantacao.md`.

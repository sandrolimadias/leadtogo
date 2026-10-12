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
- **Que versão está no ar:** `curl -s https://api.crm.aledias.com.br/health` devolve `version` (o SHA do commit publicado; compare com `git rev-parse --short HEAD` ou com a esteira). Na VPS, `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep leadtogo` mostra a tag de cada recurso.
- **Conferência pós-deploy (2 min):** `curl -s https://api.crm.aledias.com.br/health` (versão = commit, banco/Valkey/Garage `ok`); entrar no app; Uptime Kuma sem monitor vermelho; GlitchTip sem erro novo.

## 2. Rollback

Detalhe: `runbook_e13.md`, seção 9 (e `esteira_deploy.md`, seção 8). Resumo:

1. **Pare as publicações:** `gh variable set DEPLOY_ENABLED --body false` (senão o próximo push sobrescreve o rollback).
2. **Ache o commit anterior bom:** `git log --oneline -10` e `git rev-parse <abreviado>` (a tag é o SHA completo, 40 caracteres; a limpeza do GHCR guarda as 15 `sha-*` mais recentes). Escolha o de **antes do problema** e confira as migrações aplicadas depois dele: só é seguro voltar se todas foram do tipo **expandir**.
3. **No Coolify**, nos **três** recursos (`leadtogo-api`, `leadtogo-worker`, `leadtogo-web`): em **Container image → Tag** (não "Docker Image Tag"), trocar `latest` por `sha-<40 caracteres>` (a mesma nos três) e *Deploy* (~1 min). **O worker usa a mesma imagem da API e é fácil esquecer.**
4. **Conferir:** `/health` mostra o SHA antigo.
5. **Banco:** o rollback de imagem **não desfaz migração**. A regra "expandir e depois contrair" faz o código antigo funcionar com o esquema novo. Se a própria migração é o problema: nova migração corretiva; em último caso, restauração (seção 3).
6. **Definitivo:** `git revert <commit>` + push; depois volte a **Tag** dos três recursos para `latest` e religue o `DEPLOY_ENABLED`.
7. **Ao terminar (rollback ou teste), os três voltam para `latest`.** Confira na VPS: `docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep leadtogo` (todas as linhas com `:latest` e `healthy`). A esteira faz deploy da tag configurada: se um recurso ficar numa `sha-` antiga, os pushes seguintes **não o atualizam**.

**Testado em 12/10/2026:** api, worker e web foram para `sha-5605db5` e voltaram para `latest`, todos healthy.

Se o deploy novo **não ficou saudável**, o Coolify já manteve a versão anterior: não é rollback, é só corrigir e publicar de novo.

## 3. Restauração (banco e arquivos)

**Quando:** dado apagado ou corrompido, migração que estragou dados, ou VPS perdida (seção 5). Só com decisão do Ale; avise os usuários antes (o sistema fica fora do ar).

**Banco** (`runbook_backup.md`):
- 2: **teste de restauração** num Postgres limpo, sem tocar na produção. O arquivo do Coolify é um `pg_dumpall` SQL compactado (`.gz`, todos os bancos e os papéis): baixa com `rclone copyto`, restaura com `gunzip | psql` (**não** é `pg_restore`), compara contagens e **apaga tudo** no fim. Faça todo mês (checklist da seção 8).
- 3: **restauração em produção (emergência)**: **backup manual do estado atual** (mesmo corrompido) → baixar e **validar** o backup num container limpo → restaurar em **banco novo** (`leadtogo_restaurado`), **sem `--no-owner` nem `--no-acl`** (o RLS depende do dono e dos `GRANT`) → conferir contagens e papéis (`leadtogo_owner` e `leadtogo_app`, sem `BYPASSRLS`) → com `api` e `worker` parados, trocar os nomes (`leadtogo` → `leadtogo_antigo`, `leadtogo_restaurado` → `leadtogo`) → subir `api` e `worker` (as migrações pendentes rodam ao iniciar a API) → `/health`, login e isolamento entre empresas → registrar o incidente. Se o banco foi perdido, recriar o `leadtogo-db`. **Ainda não ensaiado de ponta a ponta** (pendência antes do primeiro cliente).
- **RPO:** até 24 h (backup diário às 3h, 30 cópias no R2). Um dado excluído só some dos backups quando o backup expira (`lgpd.md`, seção 5).
- Para **olhar** o banco de produção (sem restaurar): `runbook_e13.md`, seção 4.6 (`psql` no container; o banco se chama `leadtogo`, e o `POSTGRES_DB` do container aponta para `postgres`).

**Arquivos (Garage):** espelho diário no R2 (`vps-backup/garage/leadtogo-arquivos`); versões antigas de arquivos alterados ou apagados ficam em `garage-alterados/<data>/` por 90 dias. Restaurar: `rclone copy r2:vps-backup/garage/leadtogo-arquivos` para o Garage, com uma chave **temporária** com escrita (a `backup-leitura` só lê). Detalhe e erros comuns: `runbook_backup.md`, seção 4. O teste real de restauração dos arquivos está pendente até existirem anexos.

## 4. Girar segredos

**Regra:** guarde os valores novos no **gerenciador de senhas** antes de aplicar. Variáveis de produção ficam **só no Coolify** (sem aspas, nunca como *Build Variable*); nada disso vai para o repositório nem para o chat. **Ordem segura (vale para todos):** (1) gere o valor novo e guarde no gerenciador de senhas; (2) crie o novo **sem** revogar o antigo, quando o serviço permitir; (3) troque nos consumidores e faça redeploy; (4) confira; (5) só então revogue o antigo. Depois de girar qualquer item, faça a conferência pós-deploy (seção 1) e confirme que o login e o envio de e-mail funcionam.

| Segredo | Onde fica | Efeito de girar | Como |
|---|---|---|---|
| `LEADTOGO_APP_PASSWORD` e `LEADTOGO_OWNER_PASSWORD` | Coolify (`DATABASE_URL`, `DATABASE_MIGRATION_URL`) e o banco | API e worker perdem a conexão até atualizar | Passo a passo na seção 4.1 abaixo |
| `BETTER_AUTH_SECRET` | Coolify (api e worker) | **Invalida todas as sessões e os 2FA cadastrados** (cada pessoa precisaria reativar o 2FA): só gire com motivo forte, como vazamento | `openssl rand -hex 32`; atualizar nos dois e redeploy; avisar a equipe |
| `TOKEN_ENCRYPTION_KEY` | Coolify (**guarde uma cópia fora**) | **Tudo o que foi cifrado com a chave antiga fica ilegível sem ela** (e-mails na fila, segredos cifrados). Girar **não** recifra os dados | `openssl rand -base64 32`; só troque com a fila vazia e **guarde a antiga** até confirmar que nada depende dela; depois atualizar e redeploy |
| Chave do Garage `leadtogo-app` (`S3_ACCESS_KEY` e `S3_SECRET_KEY`) | Coolify | Upload e leitura de arquivos param até atualizar | Criar chave nova no Garage, dar acesso ao bucket, trocar no Coolify, redeploy, apagar a antiga |
| Chave do Garage `backup-leitura` e credenciais do R2 (token do R2: `vps-backup`, escopo mínimo) | `/root/backup-garage.env` na VPS (`chmod 600`) e *Storage* do Coolify | O espelho e os backups falham até atualizar | `runbook_backup.md`, seção 4.4 (um `key create` por nome: dois criam duas chaves) |
| Chaves do Resend, **uma por uso**: `app` (`SMTP_PASSWORD`), `coolify`, `uptime-kuma` e `glitchtip` | `app`: Coolify (api e worker); `coolify`: notificações do Coolify; `uptime-kuma`: SMTP do Kuma; `glitchtip`: SMTP do GlitchTip | Param os e-mails do uso correspondente (convite e recuperação de senha, alertas do Coolify, do Kuma ou do GlitchTip) | Criar a chave nova **do mesmo nome** no Resend, atualizar só o consumidor dela (a `app` exige redeploy de api e worker), testar o envio, revogar a antiga |
| `SENTRY_DSN` (api e worker), `SENTRY_DSN_WEB` e `SENTRY_AUTH_TOKEN` | Coolify; `SENTRY_DSN_WEB` (variável) e `SENTRY_AUTH_TOKEN` (secret) no GitHub | Erros deixam de chegar; `SENTRY_AUTH_TOKEN` só afeta o upload de source maps na esteira | `runbook_observabilidade.md`, seção 1 |
| `ALERTAS_TOKEN` | Coolify e cabeçalho `X-Alertas-Token` do monitor "Alertas" no Kuma | O monitor passa a dar 401 até atualizar | Gerar novo, atualizar nos dois lugares |
| Token da API do Coolify (`COOLIFY_TOKEN`; os `COOLIFY_UUID_*` só mudam se o recurso for recriado) | Secrets do GitHub (`gh secret set`) | O job `deploy` falha | Criar o token novo no Coolify, `gh secret set COOLIFY_TOKEN`, rodar `gh workflow run ci-cd.yml --ref main`, e só então apagar o antigo |
| Token do GHCR (`read:packages`) | Registro `ghcr.io` no Coolify | A VPS não consegue baixar imagens novas | Token *classic* só com `read:packages`; atualizar o registro |
| Push URL do Uptime Kuma | `/root/backup-garage.push` (`chmod 600`) | O backup deixa de avisar | `runbook_backup.md`, seção 4.1 |
| Chave SSH | `~/.ssh` do Ale e `authorized_keys` da VPS | — | Adicionar a nova chave **antes** de remover a antiga; SSH só por chave |

### 4.1 Senhas dos papéis do banco (`leadtogo_app` e `leadtogo_owner`)

Entre o passo 2 e o 4 a aplicação **perde a conexão**: faça em horário sem uso.

1. **Gerar a senha nova** (sem caracteres que quebram URL): `openssl rand -base64 32 | tr -d '/+=' | cut -c1-32`. Guarde no gerenciador de senhas antes de aplicar.
2. **No container do Postgres** (`psql`: `runbook_e13.md`, seção 4.6): `ALTER ROLE leadtogo_app PASSWORD '<nova>';` (e/ou `leadtogo_owner`). A senha vai no comando: não deixe no histórico compartilhado nem em chat.
3. **No Coolify**, atualizar a senha dentro das URLs: `DATABASE_URL` (`leadtogo_app`) na **api e no worker**, e `DATABASE_MIGRATION_URL` (`leadtogo_owner`) **só na api** (o worker não deve recebê-la).
4. **Redeploy de api e worker**; conferir `/health` (`database` ok) e o worker `healthy`.
5. **Fechar:** apagar a senha antiga do gerenciador de senhas.

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
| SSH da VPS | administração | **só chave** (`PasswordAuthentication no`, `PermitRootLogin without-password`; conferido em 12/10/2026) | chave privada no computador do Ale, com cópia em HD externo; evolução: só pelo Tailscale, porta 22 fechada |
| Coolify (`painel.aledias.com.br`) | recursos, variáveis, deploy, backups do banco | usuário administrador | gerenciador de senhas |
| GitHub | código, esteira, secrets, GHCR | conta do Ale | gerenciador de senhas + 2FA |
| GHCR (`ghcr.io`) | imagens; a VPS puxa com token `read:packages` | mesma conta do GitHub | token no Coolify (registro) e no gerenciador de senhas |
| Cloudflare | DNS e R2 (`vps-backup`) | conta do Ale | gerenciador de senhas + 2FA |
| Domínio `aledias.com.br` | registro do domínio e DNS (o DNS fica na Cloudflare) | conta no **registrador** (*confirmar qual*) | gerenciador de senhas + 2FA |
| Resend | e-mails transacionais | conta do Ale | gerenciador de senhas |
| GlitchTip / Uptime Kuma | erros e disponibilidade | usuários administradores dos dois | gerenciador de senhas |
| Leadtogo (administrador da conta) | uso do sistema | login com **2FA obrigatório** | senha do Ale + app autenticador + códigos de recuperação guardados à parte |

**Chave SSH da VPS: emergência e perda.**
- **Acesso de emergência:** o **console da Oracle Cloud** (terminal pelo navegador) entra na VPS **sem a chave**. A conta da Oracle tem **2FA**: mantenha os códigos de recuperação no gerenciador de senhas.
- **Se a chave for perdida ou vazar:** (1) entre pelo console da Oracle; (2) no computador, gere um par novo (`ssh-keygen -t ed25519`); (3) coloque a **chave pública nova** no `authorized_keys` do `root` na VPS; (4) remova a antiga do mesmo arquivo; (5) **teste o login com a nova antes de fechar o console**; (6) guarde a cópia da privada nova no HD externo. Se vazou, gire também os segredos que a VPS guarda (seção 4).
- O servidor aceita **só chave** (senha desativada), então perder a chave **e** o acesso à conta da Oracle trava a administração: por isso a cópia no HD externo e o 2FA com códigos guardados.

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
- [ ] **Teste de restauração:** restaurar o backup mais recente num container limpo (`runbook_backup.md`, seção 2), conferir as contagens contra a produção e **apagar tudo** no fim.
- [ ] **E-mails de alerta:** revisar a caixa dos alertas do mês (Coolify, Kuma, GlitchTip) e confirmar que cada um foi tratado ou entendido.
- [ ] **Uptime Kuma:** todos os monitores verdes; exportar o backup do Kuma (*Settings → Backup*) e guardar.
- [ ] **GlitchTip:** sem erros novos sem tratar; eventos do outbox esgotados tratados (`node dist/outbox-tratar.js`, `runbook_observabilidade.md`, seção 6).
- [ ] **Disco e memória da VPS:** `df -h /` e `free -h` na VPS; Coolify sem alerta de disco; o disco tem folga (e `docker system df` mostra o que limpar) (a VPS é compartilhada com n8n e Evolution).
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

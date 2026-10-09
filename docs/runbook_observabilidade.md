# Runbook de observabilidade (E14)

Erros no GlitchTip, disponibilidade no Uptime Kuma, e-mails de alerta pelo Resend. Referências: `plano_implantacao.md` (E14), `configuracao_tecnologia.md` (seção 13), `esteira_deploy.md` (seções 5.4 e 12) e `runbook_e13.md`.

> **Estado:** o código já está pronto (SDK nos três processos, `/health/alertas`, comandos `testar-erro` e `outbox-tratar`, source maps no CI). Sem `SENTRY_DSN` o SDK fica desligado, então nada é enviado até você seguir os passos 1 a 4. Os passos de painel abaixo foram escritos sem acesso ao seu Coolify: os nomes de campos podem variar um pouco com a versão; o que importa está em **negrito**.

## Visão geral

| Peça | O que faz | Onde |
|---|---|---|
| **GlitchTip** (SDK do Sentry) | Recebe os erros da API, do worker e do web, ligados ao commit (`release`) | `https://erros.crm.aledias.com.br`, projetos `leadtogo-api` (API e worker, tag `papel`) e `leadtogo-web` |
| **Uptime Kuma** | Avisa quando algo cai ou quando há eventos/jobs falhos | monitores do passo 3 |
| **Notificações do Coolify** | Avisa deploy falho, backup falho, disco cheio | passo 4 |
| **Resend** | Envia todos os e-mails de alerta (SMTP) | o mesmo do app (`runbook_e13.md`) |
| **Logs com `request_id`** | Rastrear uma requisição | logs dos containers no Coolify |

**Alertas: só e-mail por enquanto.** Telegram e WhatsApp (Evolution/n8n) e a notificação de deploy pelo n8n ficam como evolução futura (seção 8).

## 1. GlitchTip no Coolify

1. Coolify → o projeto → **New Resource → Services → GlitchTip** (modelo pronto: web, worker, banco e Valkey próprios).
2. **Domínio:** `https://erros.crm.aledias.com.br` (o curinga `*.crm` do DNS já cobre; proxy da Cloudflare desligado, como nos outros).
3. **Variáveis do serviço** (o Coolify gera a `SECRET_KEY`). Confira na documentação do GlitchTip da versão instalada os nomes exatos:
   - e-mail pelo Resend: `EMAIL_URL` (SMTP `smtp.resend.com`, usuário `resend`, senha = a API key do Resend) e o remetente (`DEFAULT_FROM_EMAIL`), de um domínio já verificado no Resend;
   - depois de criar a sua conta, **feche o cadastro aberto** (`ENABLE_USER_REGISTRATION=false`) e reinicie o serviço.
4. **Deploy** e acesse a URL. Crie o usuário administrador (o primeiro cadastro).
5. Crie a **organização** (ex.: `leadtogo`) e dois **projetos**: `leadtogo-api` (plataforma Node.js) e `leadtogo-web` (React). Os *slugs* devem ser exatamente esses: o CI usa `leadtogo-web`.
6. Em cada projeto, copie o **DSN** (Settings → Client Keys).
7. Crie um **token de API** (perfil → Auth Tokens) com permissão de escrita em projetos e releases: é o `SENTRY_AUTH_TOKEN` do CI (source maps).
8. Anote o *slug* da organização (`SENTRY_ORG`).
9. Em **Projeto → Alerts**, deixe o alerta por e-mail para **novos erros** ligado e inclua o seu e-mail.

O GlitchTip tem banco próprio: o backup diário do Coolify para o R2 já cobre "todos os bancos da VPS" (`runbook_backup.md`); confira que o do GlitchTip entrou na lista.

## 2. Onde cadastrar cada variável

| Onde | Nome | Valor | Segredo? |
|---|---|---|---|
| **Coolify → recurso `api`** | `SENTRY_DSN` | DSN de `leadtogo-api` | não (mas só no Coolify) |
| | `ALERTAS_TOKEN` | `openssl rand -hex 32` (mínimo 32 caracteres) | **sim** |
| | `ALERTAS_LIMITE_JOBS_FALHOS` | opcional; padrão `1` | não |
| **Coolify → recurso `worker`** | `SENTRY_DSN` | **o mesmo** DSN de `leadtogo-api` (a tag `papel` separa API e worker) | não |
| **Coolify → recurso `web`** | nada | o DSN do web entra no build | |
| **GitHub → Settings → Secrets and variables → Actions → Variables** | `SENTRY_DSN_WEB` | DSN de `leadtogo-web` (público por desenho) | não |
| | `SENTRY_URL` | `https://erros.crm.aledias.com.br` | não |
| | `SENTRY_ORG` | *slug* da organização no GlitchTip | não |
| **GitHub → … → Secrets** | `SENTRY_AUTH_TOKEN` | token do passo 1.7 | **sim** |
| **Uptime Kuma** | cabeçalho `X-Alertas-Token` do monitor de alertas | o mesmo `ALERTAS_TOKEN` | **sim** |

- `release` é o `APP_VERSION` (o commit) e `environment` é `production`: não há variável para isso.
- Depois de cadastrar no Coolify, faça um **redeploy** de `api` e `worker` (variáveis só valem no container novo). Para o web, o próximo push de código já leva o DSN (e, com `SENTRY_AUTH_TOKEN`, os source maps).
- Sem `SENTRY_AUTH_TOKEN` o build do web **não gera mapas**: o app funciona, só que as pilhas do navegador saem minificadas.

## 3. Uptime Kuma no Coolify

1. **New Resource → Services → Uptime Kuma**. Domínio opcional: `status.crm.aledias.com.br` (`plano_implantacao.md`, seção 3). Crie o usuário administrador.
2. **Notificação** (Settings → Notifications → *Email (SMTP)*): host `smtp.resend.com`, porta `465`, SSL/TLS ligado, usuário `resend`, senha = API key do Resend, remetente de domínio verificado, destinatário o seu e-mail. Marque **"Default enabled"** e **"Apply on all existing monitors"**.
3. **Monitores** (todos *HTTP(s)*; intervalo 60 s; **tentativas: 3** com intervalo de nova tentativa de 30 s, para o 503 curto de um deploy não gerar alerta):

| Monitor | URL | O que verifica |
|---|---|---|
| Web | `https://crm.aledias.com.br/` | tipo *HTTP(s) – Keyword*, palavra `id="root"` |
| API e dependências | `https://api.crm.aledias.com.br/health` | *Keyword* `"status":"ok"` (o `/health` já checa **banco, Valkey e Garage**: é o monitor de banco) |
| Rota pública `/v1` | `https://crm.aledias.com.br/v1/primeiro-acesso/estado` | *Keyword* `"aberto"` (a resposta é `{"aberto":false}` com o cadastro fechado), garante o roteamento do Traefik até a API |
| **Alertas** (eventos e jobs) | `https://api.crm.aledias.com.br/health/alertas` | *HTTP(s)*, status aceito só `200-299`; em **Headers**: `{"X-Alertas-Token": "<ALERTAS_TOKEN>"}` |
| Painel do Coolify | `https://painel.aledias.com.br` | status aceito `200-399` |
| GlitchTip | `https://erros.crm.aledias.com.br/` | status aceito `200-399` |

O monitor "Alertas" fica vermelho (503) quando há **evento do outbox esgotado e não tratado**, **falha final de job nas últimas 24 h** (a partir de `ALERTAS_LIMITE_JOBS_FALHOS`, padrão 1) ou quando não é possível verificar (status `erro`). A resposta só tem contagens:

```json
{"status":"alerta","eventos_esgotados":1,"jobs_falhos":{"manutencao":0,"notificacoes":0,"email":0,"outbox":0},"jobs_falhos_total":0,"limite_jobs_falhos":1}
```

O banco não tem porta pública (de propósito): não há monitor TCP direto. Se o Postgres cair, `database` vira `erro` no `/health` e o monitor da API alerta.

## 4. Notificações do Coolify (e-mail)

Coolify → **Notifications → Email (SMTP)**: os mesmos dados do Resend. Marque pelo menos: **deploy com sucesso e com falha**, **falha de backup** (importante: avisa se o backup do R2 parar), **disco quase cheio** e **mudança de estado de container**. Use o botão de teste de cada tela.

## 5. Como testar cada peça

| # | Teste | Como | Resultado esperado |
|---|---|---|---|
| 1 | **Erro forçado da API** | Coolify → recurso `api` → *Terminal*: `node dist/testar-erro.js` | Sai com 0 e imprime a versão. Em `leadtogo-api` aparece "Erro de teste do Leadtogo (E14)", tag `papel=api`, `teste=true` e **release = commit** (igual ao `version` de `https://api.crm.aledias.com.br/health`) |
| 2 | **Erro forçado do worker** | Terminal do recurso `worker`: `node dist/testar-erro.js` | O mesmo, com `papel=worker` |
| 3 | **Erro forçado do web** | Abra o app, console do navegador: `setTimeout(() => { throw new Error('teste do web') })` | Aparece em `leadtogo-web` com o commit. Com `SENTRY_AUTH_TOKEN` no CI, a pilha vem com os arquivos `.ts` originais |
| 4 | **Sem dados pessoais** | Abra os eventos dos testes 1 a 3 | Sem cookies, cabeçalhos `Authorization`, corpo da requisição, e-mails, CPF/CNPJ ou telefones; só as tags `tenant_id`, `user_id` e `request_id` (uuids) |
| 5 | **`.map` fora da imagem** | `docker run --rm --entrypoint sh ghcr.io/<dono>/leadtogo-web:latest -c 'find /srv -name "*.map"'` | Nenhuma linha |
| 6 | **API fora do ar** | Coolify → `api` → *Stop* (fora do horário de uso) | Em ~3 min o monitor "API e dependências" cai e chega o e-mail; *Start* de novo: chega o e-mail de recuperação |
| 7 | **Alerta de eventos esgotados** | Veja 5.1 | Monitor "Alertas" vermelho, e-mail, e o alerta some depois do tratamento |
| 8 | **Alerta de jobs falhos** | Coberto por teste automatizado (`alertas.test.ts`, com BullMQ real). Em produção, um job que esgota as tentativas aparece em `jobs_falhos` por **24 h** e depois sai sozinho | Se precisar silenciar antes, pause o monitor ou use uma janela de manutenção do Kuma |
| 9 | **Token** | `curl -i https://api.crm.aledias.com.br/health/alertas` e com `-H 'X-Alertas-Token: errado'` | `401` nos dois; sem `ALERTAS_TOKEN` configurado, `404`. Com o token certo: `200` (ou `503` se houver alerta) |
| 10 | **Notificações do Coolify** | Botão de teste em *Notifications* | E-mail chega |
| 11 | **Deploy falho** | Um push cuja migração falhe mantém a versão antiga (esteira_deploy.md, seção 7.2) | E-mail do GitHub (falha do workflow) e do Coolify |

### 5.1 Provocar um evento esgotado (teste ponta a ponta, sem SQL)

Convites passam pelo outbox; se o envio de e-mail falha, o relay tenta 8 vezes (5 s, 10 s, 20 s… até esgotar, cerca de 10 minutos).

1. No recurso `worker`, troque **temporariamente** `SMTP_HOST` por um valor inválido (ex.: `smtp.invalido.test`) e faça o redeploy do worker.
2. No app, convide `teste-e14@exemplo.invalid` (empresa de teste, de preferência).
3. Aguarde ~10 min: o monitor "Alertas" fica vermelho e chega o e-mail.
4. **Restaure o `SMTP_HOST`** do worker e faça o redeploy.
5. Trate o evento (seção 6) e confirme que o monitor volta ao verde.

## 6. Tratar eventos esgotados: `node dist/outbox-tratar.js`

Sempre pelo comando, **nunca por SQL**. No terminal do container da `api` (ou do `worker`):

```bash
node dist/outbox-tratar.js --listar
node dist/outbox-tratar.js --reprocessar <id> --por "Seu Nome"
node dist/outbox-tratar.js --descartar <id> --por "Seu Nome"
```

- `--listar`: id, empresa, tipo, tentativas, quando esgotou e o último erro (com e-mails, CPF e telefones mascarados). Não mostra o conteúdo do evento.
- `--reprocessar`: use **depois de corrigir a causa** (ex.: SMTP voltou). Zera as tentativas e o relay entrega de novo, em segundos. Se falhar de novo, o evento volta a contar no alerta.
- `--descartar`: abandona o evento (apaga o conteúdo). Use quando reenviar já não faz sentido (convite vencido, notificação velha).
- `--por` é obrigatório: **quem tratou e quando** ficam gravados no evento (`tratado_por`, `tratado_em`, `tratamento`), e o alerta ignora o evento tratado.
- Saída `0` feito; `1` falha (evento não existe ou já tratado); `2` uso incorreto.

Depois de tratar tudo, o `/health/alertas` volta a `200` na próxima verificação do Kuma.

## 7. Rastrear uma requisição (`request_id`)

Todo log da API traz `request_id`, `tenant_id` e `user_id`, e a resposta devolve o cabeçalho `x-request-id`. Um evento do GlitchTip tem a tag `request_id`: copie o valor e busque nos logs do recurso `api` no Coolify (*Logs*). O inverso também vale: um erro 500 mostrado ao usuário traz o `request_id` na resposta; procure por ele no GlitchTip.

## 8. Investigar o 503 curto do deploy do web (próximo deploy)

O `web.Dockerfile` **já tem `HEALTHCHECK`** (`/health` do Caddy), então o 503 breve vem de outro lugar. No próximo deploy:

1. Na VPS, logo após o push: `watch -n1 "docker ps --format '{{.Names}}\t{{.Status}}' | grep -i web"`.
2. Se o container novo **não** mostrar `health: starting` → `healthy`, o Coolify não está usando o healthcheck da imagem: ligue o do painel em *Healthcheck* (`GET`, `http`, `127.0.0.1`, porta `8080`, caminho `/health`; ver `runbook_e13.md`, "Plano B").
3. Se mostrar `healthy` e o 503 persistir, o Traefik está trocando a rota antes da hora: ajuste `start-period` e `interval` do `HEALTHCHECK` no `web.Dockerfile`.
4. Registre o resultado aqui.

## 9. Evolução futura (não implementado)

- Alertas por **Telegram** e **WhatsApp** (Evolution API via n8n): o Uptime Kuma tem notificação por webhook, que chamaria um fluxo do n8n.
- **Notificação de deploy** (sucesso/falha) por webhook do GitHub Actions para o n8n.
- Grafana + Loki + Prometheus, se o volume pedir (`configuracao_tecnologia.md`, seção 13).
- Limpeza periódica dos eventos já tratados do outbox (hoje ficam para histórico).

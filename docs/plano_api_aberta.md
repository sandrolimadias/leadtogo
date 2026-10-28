# Plano da API aberta: chaves de API, API pública e webhooks (Fase de integrações)

> **Status:** **aprovado pelo Ale em 28/10/2026**, com as recomendações deste documento para todas as perguntas da seção 11. Execução registrada na seção 13.
> **Escopo:** a base de todas as integrações: **chaves de API** por empresa, **API pública** `/v1/publica/*` e **webhooks de saída**. É o primeiro passo da ordem decidida para a situação financeira (`funcionalidades.md` §13.6) e substitui, como plano de execução, o que `funcionalidades.md` §13.2 e `configuracao_tecnologia.md` §4 e §11.1 descrevem como regra.
> **Primeiro consumidor:** o n8n, como *middleware* (Omie → Leadtogo; Leadtogo → cobrança e avisos). O desenho não depende do n8n: qualquer sistema que fale HTTP usa o mesmo contrato.

## 1. Fases

| Fase | Entrega | Migração |
|---|---|---|
| **I1** | Chaves de API: cadastro, autenticação por chave, escopos, membro de integração, limites, auditoria "Integração: <nome>", tela Configurações → Integrações → Chaves | 0038 |
| **I2** | API pública v1: rotas `/v1/publica/*` (empresas, contatos, atividades, oportunidades, cadastros), idempotência, paginação por cursor, OpenAPI pública versionada | 0039 |
| **I3** | Webhooks de saída: eventos de domínio no outbox, cadastro de destinos, entrega assinada (HMAC) com reenvio, log de entregas, tela Configurações → Integrações → Webhooks | 0040 |
| **I4** | Pacote do n8n: credencial, workflows modelo versionados em `integrations/n8n/`, guia de uso e roteiro de teste de ponta a ponta | — |

Depois da I4 vem o **recurso financeiro** (`funcionalidades.md` §13.6), que usa as três peças.

Cada fase termina em portão, como no portal: gate verde, CI verde, deploy, roteiro de teste (`roteiro_teste_api_I1.md` …) e aceite do Ale. Migração só de expansão; **Backup Now antes do deploy de cada fase**.

## 2. Decisões (propostas)

| # | Decisão |
|---|---|
| D1 | **A chave pertence à empresa (tenant)**, não a uma pessoa. Quem sai da equipe não derruba as integrações |
| D2 | Cada chave tem um **membro de integração** próprio (`membros.tipo = 'integracao'`, sem login). Ele preenche `criado_por`/`atualizado_por`, aparece no histórico como **"Integração: <nome da chave>"** e reaproveita RLS, auditoria e regras de negócio sem caminho paralelo |
| D3 | **Escopos = chaves do catálogo de permissões** (`empresas.ver`, `atividades.criar`…), escolhidos ao criar a chave, só entre as **liberadas para integração** (seção 4.3). Alcance da carteira sempre **todas** |
| D4 | **API pública separada** em `/v1/publica/*`, com **DTOs próprios em lista de permissão** (mesmo princípio do portal). As rotas internas `/v1/*` continuam só para a sessão do app e podem mudar à vontade; a pública é um contrato |
| D5 | **Só a chave entra na API pública e só a sessão entra na interna.** Uma chave nunca chama rota interna; uma sessão nunca chama `/v1/publica/*` |
| D6 | Webhooks nascem do **outbox existente**, gravados **na mesma transação** do dado (desfeita a transação, não há evento). Entrega **pelo menos uma vez**, sem ordem garantida; o consumidor deduplica pelo `id` do evento |
| D7 | Assinatura **HMAC-SHA256 com carimbo de tempo** (proteção contra repetição), segredo por webhook cifrado com a `TOKEN_ENCRYPTION_KEY` |
| D8 | Criar ou ver chaves e webhooks exige a permissão nova **`integracoes.gerir`** (catálogo v10), padrão só no perfil Admin |
| D9 | Versão única **v1**, só com mudanças **aditivas**. Quebra de contrato só numa v2, com convivência de pelo menos 6 meses |

## 3. Arquitetura

```
n8n / ERP / site ──HTTP + chave──► /v1/publica/*  ──► ChaveGuard ─► TenantInterceptor (RLS, membro de integração)
                                                                         │
                                                       serviços de domínio já existentes (carteira, atividades…)
                                                                         │ mesma transação
                                                                    eventos_outbox (empresa.criada…)
                                                                         │ relay do worker (já existe)
                                                       webhook.distribuir ─► webhook_entregas ─► fila "webhooks"
                                                                                                  │ POST assinado
n8n (Webhook node) ◄───────────────────────────────────────────────────────────────────────────────┘
```

- **Tudo passa pelos serviços de domínio.** As rotas públicas são controllers finos que validam o DTO público (Zod em `packages/shared/src/publica/`), chamam o mesmo serviço que o app usa e devolvem o DTO público. Regra de negócio nunca é duplicada.
- **Rede:** n8n e API na rede Docker compartilhada do Coolify (`configuracao_tecnologia.md` §11.1). Fora dela, pelo domínio HTTPS público. As duas formas são autenticadas.

## 4. I1 — Chaves de API

### 4.1 Formato e guarda
- Token: `ltg_<ambiente>_<segredo>`, com `ambiente` igual a `live` em produção e `test` fora dela, e `segredo` de **256 bits** em base62. O prefixo `ltg_` permite cadastrar um padrão de *secret scanning* no GitHub.
- **Mostrado uma vez só**, na criação, com o botão Copiar. No banco ficam só o **hash SHA-256** do token (a entropia de 256 bits dispensa hash lento) e os **8 primeiros caracteres** do segredo (`prefixo`), para a tela identificar a chave.
- Envio: `Authorization: Bearer ltg_live_...`. Nunca por *query string* (acabaria em log).
- **Localização antes do tenant:** a função `app_localizar_chave(hash)` (`SECURITY DEFINER` do `leadtogo_owner`, `search_path` fixo, `EXECUTE` só para o `leadtogo_app`, mesmo padrão do portal) devolve só `(chave_id, tenant_id)` de uma chave **ativa, não revogada e não vencida**. Daí em diante tudo roda sob RLS com o tenant da chave.
- **`ChaveGuard`** para as rotas marcadas `@RotaPublica()`. O `AcessoGuard` atual deixa essas rotas passar, como já faz com `CHAVE_PORTAL`. O `TenantInterceptor` monta o contexto com o membro de integração e as permissões vindas da chave, e o `@Permissao` funciona igual.
- Erros:
  - sem chave, chave inválida, revogada ou vencida: **401** `chave_invalida`, sempre com a mesma mensagem (não revela qual dos casos);
  - escopo faltando: **403** `escopo_insuficiente`, com a permissão exigida no corpo;
  - empresa inativa: **403**, como no app.
- `ultimo_uso_em` e `ultimo_ip` atualizados no máximo **uma vez por minuto** por chave (cache no Valkey), para não gravar no banco a cada chamada.

### 4.2 Ciclo de vida
- **Criar:** nome (ex.: "n8n — Omie"), escopos, validade opcional e IPs permitidos opcionais (lista de CIDR). Exige **2FA ativo** de quem cria, e confirmação do código se a última verificação tiver mais de 15 minutos.
- **Revogar:** efeito imediato. A chave revogada fica na lista, riscada, para o histórico.
- **Rotacionar:** cria uma chave nova com os mesmos escopos e mantém a antiga válida por até 7 dias (o admin escolhe o prazo), para trocar no n8n sem parada.
- **Vencimento:** aviso na central de notificações para quem tem `integracoes.gerir`, 15 dias e 1 dia antes.
- **Editar:** nome, escopos e IPs. O token nunca muda.
- Toda ação vai para a auditoria (`entidade = 'api_chave'`), sem o token.

### 4.3 Escopos liberados para integração
Todo o catálogo, **menos**: `perfis.gerir`, `equipe.gerir`, `equipe.ver_emails`, `seguranca.gerir`, `integracoes.gerir`, `carteira.configurar`, `portal.*` e `importacao.executar` (a importação tem tela e fluxo próprios). A lista fica em `packages/shared/src/permissoes.ts` (`PERMISSOES_DE_INTEGRACAO`), com teste. Uma permissão nova do catálogo **não** entra na lista sozinha.

### 4.4 Membro de integração
- Coluna nova `membros.tipo` (`pessoa` · `integracao`, padrão `pessoa`). O membro de integração nasce com a chave, tem `usuario_id` nulo e o nome da chave, e é desativado na revogação.
- **Fica fora** da equipe, das escolhas de responsável, do Dashboard, das métricas por vendedor, das contagens de assentos e dos filtros de "Responsável". Um teste garante isso em cada lista que mostra membros.
- **Responsável padrão (opcional, por chave):** usado quando a integração cria empresa, contato ou atividade sem informar o responsável. Sem ele, o campo `responsavel` é obrigatório no corpo da chamada.

### 4.5 Auditoria
- `AuditoriaService` passa a gravar a `origem` pelo contexto: `app` na sessão e `integracao` na chave. Hoje a origem é fixa em `'app'`. O `membro_id` é o membro de integração.
- O histórico da empresa mostra "Integração: n8n — Omie".

### 4.6 Limites
- Por chave: **120 requisições/min** e **20.000/dia**. Por IP: o limite global que já existe. Estourou: **429** com `Retry-After`. Contadores no Valkey, como o `rate-limit` atual (falha aberta, com aviso no log).
- Cabeçalhos em toda resposta: `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `X-RateLimit-Reset`.

### 4.7 Tela — Configurações → Integrações → Chaves de API
- Lista com nome, prefixo (`ltg_live_a1B2c3D4…`), escopos (resumo), criada por e em, último uso, vencimento e situação. Ações: **Nova chave**, **Editar**, **Rotacionar**, **Revogar**.
- O diálogo "Chave criada" mostra o token uma vez, com o aviso "guarde agora; não será mostrada de novo".
- Estado vazio com o link para o guia do n8n (I4).

## 5. I2 — API pública v1

### 5.1 Convenções
- Base: `/v1/publica`. JSON em UTF-8, nomes de campos em português e `snake_case` (iguais ao banco, o mesmo idioma do produto).
- **Datas:** ISO 8601 com fuso (`2026-10-28T09:00:00-03:00`); datas sem hora, `AAAA-MM-DD`. **Dinheiro:** string decimal (`"350.00"`), para não perder centavos em `float`. **CNPJ:** só os 14 caracteres alfanuméricos; a API aceita com ou sem máscara.
- **Paginação por cursor:** `?limite=` (1–200, padrão 50) e `?cursor=`, com resposta `{ "dados": [...], "proximo_cursor": "..." | null }`. Para sincronizar, o filtro `?atualizado_desde=` fica em todas as listas.
- **Idempotência:** todo `POST` aceita o cabeçalho `Idempotency-Key` (até 100 caracteres). A mesma chave com o mesmo corpo devolve a resposta guardada por 24 h; com outro corpo, **409** `idempotencia_conflito`. Onde há `id_externo` (atividades, títulos), ele também deduplica.
- **Erros:** o formato único que a API já usa (`{ "statusCode", "erro", "mensagem", "request_id", "detalhes" }`, `filtro-excecoes.ts`), com `erro` estável para a integração tratar e `detalhes` campo a campo na validação.
- **Tags pela chave do sistema ou pelo id**, nunca pelo nome (o cliente pode renomear).
- **Lote:** rotas `/lote` aceitam até **500 itens**, processados item a item, e devolvem o resultado de cada um (`criado`, `atualizado`, `ignorado` ou `erro` com o motivo). Um item ruim não derruba o lote.

### 5.2 Rotas da primeira versão

| Recurso | Rotas | Escopo |
|---|---|---|
| Identidade | `GET /eu`: empresa, nome da chave, escopos e limites | qualquer chave válida |
| Empresas | `GET /empresas` (filtros: `cnpj`, `status` pela chave do sistema, `tag`, `responsavel`, `atualizado_desde`) · `GET /empresas/{id}` · `GET /empresas/cnpj/{cnpj}` · `POST /empresas` · `PATCH /empresas/{id}` · `POST /empresas/lote` (*upsert* pelo CNPJ) | `empresas.ver` / `criar` / `editar` |
| Tags da empresa | `PUT /empresas/{id}/tags/{tag}` (aplica; respeita a seleção única) · `DELETE /empresas/{id}/tags/{tag}` | `empresas.editar` |
| Contatos | `GET /contatos` (filtros: `email`, `telefone` E.164, `empresa`) · `GET /contatos/{id}` · `POST /contatos` · `PATCH /contatos/{id}` | `contatos.*` |
| Atividades | `GET /atividades` · `POST /atividades` (com `id_externo`; `origem = integracao`) · `POST /atividades/{id}/concluir` | `atividades.*` |
| Oportunidades | `GET /oportunidades` · `POST /oportunidades` · `PATCH /oportunidades/{id}` (fase, valor, previsão) | `oportunidades.*` |
| Cadastros (só leitura) | `GET /tags` · `GET /tipos-atividade` · `GET /funis` · `GET /origens` · `GET /membros` (só id, nome e e-mail, sem os de integração) | `empresas.ver` |

- **Fora da v1:** excluir registros, transferir carteira, importação, chamados, portal e arquivos. Entram quando houver um caso real.
- As regras do app valem igual. Exemplos: a empresa inativa na Receita bloqueia o que já bloqueia no app; concluir uma atividade atualiza a última visita, o último contato e as tags; conquistar uma oportunidade vira a empresa Cliente.
- **Empresa nova pela API** sem `consultar_receita: false` entra na fila de consulta à Receita do worker, como na importação, e a resposta volta na hora (**201** com `receita: "pendente"`).

### 5.3 Contrato e documentação
- Documento OpenAPI **só das rotas públicas**, gerado pelo `gerar-openapi.ts`, servido em `GET /v1/publica/openapi.json` e com uma página de referência em `/v1/publica/docs`. As duas ficam **abertas em produção**, porque só descrevem o que é público. O Swagger interno continua desligado em produção.
- O arquivo `docs/api/publica-v1.openapi.json` vai **versionado no repositório**. Um teste de contrato no CI falha quando a geração diverge dele e acusa mudança **não aditiva** (campo removido, tipo trocado, campo novo obrigatório). Para atualizar, roda-se `pnpm api:publica:atualizar`, e o diff aparece no commit.
- O teste "nenhuma rota sem decisão" passa a cobrir as rotas públicas: cada uma declara `@Permissao` e o DTO de saída.

## 6. I3 — Webhooks de saída

### 6.1 Eventos de domínio
Os serviços passam a gravar no `eventos_outbox`, **na mesma transação**, os eventos abaixo. Cada um é uma função `emitirEvento(tx, tipo, entidade, dados)` usada pelos serviços, com teste de que o rollback não deixa evento.

| Grupo | Eventos (v1) |
|---|---|
| Empresa | `empresa.criada` · `empresa.atualizada` · `empresa.tag_alterada` · `empresa.responsavel_alterado` |
| Contato | `contato.criado` · `contato.atualizado` |
| Atividade | `atividade.criada` · `atividade.concluida` |
| Oportunidade | `oportunidade.criada` · `oportunidade.fase_alterada` · `oportunidade.status_alterado` |
| Teste | `webhook.teste` (botão "Enviar teste") |

- **Ficam para depois:** `atividade.atrasada` e `oportunidade.parada`, que dependem do tempo e precisam de uma varredura agendada; também os eventos de WhatsApp. `financeiro.situacao_alterada` entra com o recurso financeiro.
- Eventos de importação em massa (milhares de empresas de uma vez) saem como **um** evento `importacao.concluida`, com o id do lote, e não um por empresa. O consumidor busca as empresas pela API com `?atualizado_desde=`.

### 6.2 Envelope
```json
{
  "id": "0193a7c2-…",
  "tipo": "empresa.tag_alterada",
  "versao": 1,
  "ocorrido_em": "2026-10-28T09:00:00-03:00",
  "empresa_tenant": { "id": "…", "nome": "Ale Dias" },
  "ator": { "tipo": "membro", "id": "…", "nome": "Ana" },
  "dados": { "empresa": { /* DTO público da empresa, o mesmo do GET */ }, "alteracoes": { "tags": { "antes": ["lead"], "depois": ["cliente"] } } }
}
```
- `ator.tipo` vale `membro`, `integracao` ou `sistema`. **Eco de integração:** o n8n pode ignorar eventos causados pela própria chave (`ator.tipo = integracao` e `ator.id` = o membro dela) para não entrar em laço.
- `dados` traz o **DTO público** no momento do evento: o consumidor não precisa chamar a API para o caso comum.

### 6.3 Assinatura
- Cabeçalhos: `X-Leadtogo-Evento` (tipo), `X-Leadtogo-Entrega` (id da entrega) e `X-Leadtogo-Assinatura: t=<unix>,v1=<hex>`, com `v1 = HMAC-SHA256(segredo, "<t>.<corpo bruto>")`.
- O consumidor recusa `t` com mais de **5 minutos** de diferença e compara a assinatura em tempo constante. O guia da I4 traz o trecho pronto para o nó *Code* do n8n.
- Segredo por webhook (`whsec_…`, 256 bits), mostrado uma vez e cifrado com a `TOKEN_ENCRYPTION_KEY` (mesmo esquema do SMTP). Para **rotacionar**, as duas assinaturas (`v1` antiga e nova) seguem juntas por 24 h.

### 6.4 Entrega
- O relay do outbox ganha o manipulador `webhook.distribuir`: para cada webhook **ativo** assinante do tipo, cria uma linha em `webhook_entregas` e enfileira um job na fila nova **`webhooks`** (concorrência 5, para não disputar CPU com a geocodificação).
- **POST** com timeout de **10 s**, **sem seguir redirecionamento**, lendo no máximo 2 KB da resposta para o log. Respostas `2xx` são sucesso; `410 Gone` desativa o webhook; o resto conta como falha.
- **Reenvio** com espera progressiva: 1 min, 5 min, 30 min, 2 h, 6 h, 12 h e 24 h (8 tentativas, cerca de 2 dias). Depois a entrega fica `falhou`, com o botão **Reenviar**.
- **Desativação automática:** um webhook com todas as entregas falhando há **3 dias** é desligado, e quem tem `integracoes.gerir` recebe uma notificação. Religar é manual.
- **Proteção contra SSRF:**
  - em produção, só `https`;
  - o host é resolvido e recusado quando cai em faixa privada, *loopback*, *link-local* ou metadados de nuvem (`169.254.169.254`), conferindo no momento da conexão para não cair em *DNS rebinding*;
  - **exceção:** os hosts internos listados na variável nova `WEBHOOK_HOSTS_INTERNOS` (ex.: `n8n:5678`), que aceitam `http` na rede Docker.
- **Retenção:** entregas com sucesso por **30 dias**, falhas por **90 dias**, numa limpeza agendada na fila `manutencao` (mesmo padrão do `app_limpar_outbox`).

### 6.5 Tela — Configurações → Integrações → Webhooks
- Lista: descrição, URL (com o host em destaque), eventos, situação e taxa de sucesso nas últimas 24 h. Ações: **Novo webhook**, **Editar**, **Enviar teste**, **Rotacionar segredo**, **Desativar** e **Excluir** (só sem entregas; com entregas, só desativa).
- **Log de entregas** de cada webhook: data, evento, tentativa, status HTTP, duração e trecho da resposta. Filtros por situação e evento; **Reenviar** em cada linha e **Reenviar as falhas** em lote.

## 7. Modelo de dados

Regras do projeto: português, uuid v7, `tenant_id`, RLS forçado, colunas padrão, teste de isolamento, só expansão.

- **0038 (I1):**
  - `api_chaves`: nome, prefixo `char(8)`, hash `bytea` único, ambiente, membro_id (o de integração), permissoes `text[]`, responsavel_padrao_id, ips_permitidos `cidr[]`, expira_em, revogada_em, revogada_por, substituida_por, ultimo_uso_em, ultimo_ip, colunas padrão;
  - `membros.tipo` (enum `tipo_membro`);
  - função `app_localizar_chave(hash)`;
  - catálogo de permissões **v10** (`integracoes.gerir`).
- **0039 (I2):** `idempotencia_chaves` (tenant_id, chave_api_id, chave, hash do corpo, status, resposta `jsonb`, criado_em). Única por `(tenant_id, chave_api_id, chave)`. Limpeza das linhas com mais de 24 h.
- **0040 (I3):**
  - `webhooks`: descricao, url, eventos `text[]`, segredo cifrado, segredo_anterior cifrado com validade, ativo, desativado_motivo, colunas padrão;
  - `webhook_entregas`: webhook_id, evento_id, tipo, tentativa, situacao (`pendente` · `sucesso` · `falhou`), status_http, duracao_ms, resposta_trecho, erro, proxima_tentativa_em, entregue_em. Índices `(tenant_id, webhook_id, criado_em desc)` e `(situacao, proxima_tentativa_em)`;
  - funções `SECURITY DEFINER` para o worker reservar entregas, como `app_reservar_eventos`.

`modelagem_banco.md` §11.1 é atualizado com as colunas finais em cada fase.

## 8. Segurança e LGPD

- **Segredos:** token e segredo de webhook só em hash ou cifrados, nunca em log, auditoria, outbox ou resposta (fora o momento da criação). Teste de que o log da requisição mascara `Authorization`.
- **Escopo mínimo:** a tela sugere os escopos por modelo de uso ("Leitura da carteira", "Financeiro", "Formulário do site"), e o admin ajusta.
- **IPs permitidos** opcionais por chave. Para o n8n na rede interna, o IP da rede Docker.
- **LGPD:** os webhooks levam dados pessoais (nome, e-mail e telefone de contatos) a sistemas de terceiros. A tela de webhook avisa isso, a criação fica registrada, e `lgpd.md` ganha a seção "Compartilhamento com integrações" (o operador é o destino cadastrado pelo admin da empresa).
- **Abuso:** limites por chave (seção 4.6), corpo máximo de **1 MB** nas rotas públicas e lote de até 500 itens.

## 9. Observabilidade

- Métricas por chave (requisições, erros 4xx e 5xx, 429) e por webhook (entregas, falhas, latência), com a mesma ferramenta do `runbook_observabilidade.md`.
- Alertas: webhook desativado automaticamente; fila `webhooks` com mais de 1.000 entregas pendentes; chave usada de IP fora da lista.
- O log de cada requisição pública leva `chave_id` (nunca o token).

## 10. Testes (por fase, além dos de unidade)

- **Isolamento:** a chave do tenant A não lê nem grava no tenant B, nem por id adivinhado (**404**, não 403).
- **I1:** chave revogada, vencida ou de IP fora da lista dá 401; escopo faltando dá 403; o membro de integração não aparece em nenhuma lista de equipe ou responsável; a auditoria sai com `origem = integracao`; 429 com `Retry-After`; a chave nunca chama rota interna e a sessão nunca chama a pública.
- **I2:** contrato (snapshot do OpenAPI público, mudança não aditiva quebra o CI); idempotência (mesma chave e corpo dá a mesma resposta, outro corpo dá 409); lote com item ruim; tag pela chave do sistema depois de renomear; regras do app valendo pela API (empresa inativa, conquista vira Cliente).
- **I3:** sem evento após rollback; assinatura confere e o carimbo vencido é recusado; reenvio com espera progressiva; desativação automática; SSRF (IP privado, redirecionamento, DNS rebinding) recusado; eco de integração identificável; E2E com um receptor de teste no CI.
- **I4:** roteiro manual de ponta a ponta com o n8n de produção.

## 11. Perguntas em aberto (com a recomendação)

| # | Pergunta | Recomendação |
|---|---|---|
| P1 | Prefixo das rotas públicas | `/v1/publica/*` (separado das internas) |
| P2 | Validade padrão da chave | Sem validade obrigatória, com aviso se passar de 1 ano sem rotação |
| P3 | Quem cria chaves e webhooks | Só quem tem `integracoes.gerir` (padrão: Admin), com 2FA |
| P4 | Webhook `http` na rede interna (n8n) | Sim, só para os hosts da `WEBHOOK_HOSTS_INTERNOS` |
| P5 | Evento com o registro inteiro (DTO) ou só o id | O DTO inteiro (menos chamadas no n8n) |
| P6 | Retenção do log de entregas | 30 dias para sucesso, 90 para falha |
| P7 | Limites por chave | 120/min e 20.000/dia, ajustáveis por chave pelo suporte |

## 12. Variáveis novas (cadastrar no Coolify)

| Variável | Fase | Uso |
|---|---|---|
| `WEBHOOK_HOSTS_INTERNOS` | I3 | Hosts da rede Docker liberados para webhook `http` (ex.: `n8n:5678`); vazio = nenhum |

A `TOKEN_ENCRYPTION_KEY`, que já existe, cifra os segredos dos webhooks.

## 13. Execução

### I1 — Chaves de API (migração 0038)
- Entregue como na seção 4, com estes ajustes:
  - o hash é `char(64)` em hexadecimal (não `bytea`): mais simples de conferir e de indexar, mesma segurança;
  - o membro de integração nasce **inativo** (`ativo = false`): assim nenhuma escolha de responsável o oferece, porque todas exigem membro ativo; ele assina o que a chave faz e aparece no histórico como "Integração: <nome>";
  - criar e rotacionar exigem o **2FA ativo** de quem age (403 `2fa_obrigatorio`); a reconfirmação do código depois de 15 minutos ficou para depois (o Better Auth não expõe a hora da última verificação);
  - o limite por chave (120/min e 20.000/dia) é fixo no código; o ajuste por chave pelo suporte ficou para depois;
  - IP fora da lista dá 401 `chave_invalida`, com a mesma mensagem dos outros casos.
- Gestão: `GET/POST /v1/integracoes/chaves`, `PATCH /v1/integracoes/chaves/{id}`, `POST .../{id}/rotacionar` e `POST .../{id}/revogar`, todas com `integracoes.gerir` (catálogo **v10**, só o perfil Administrador recebe).
- Aviso de vencimento: tarefa `avisar-chaves` do worker, todo dia às 11:00 UTC (08:00 de Brasília).
- Testes: `apps/api/src/integracoes/chaves.test.ts` (gestão, 2FA, escopos, 401/403, IP, revogação, vencimento, isolamento, sessão × chave, rotação, aviso) e `packages/db/src/testes/integracoes.test.ts` (função de localização, RLS sem empresa, CHECK do hash), além da fábrica de isolamento.

### I2 — API pública v1 (migração 0039)
- Rotas como na seção 5.2, em `apps/api/src/integracoes/publica/`. As escritas passam pelos mesmos serviços do app (`EmpresasDaCarteiraService`, `ContatosService`, `AtividadesService`, `OportunidadesService`); a leitura é um modelo próprio (um SQL por página, DTO em lista de permissão).
- Ajustes na execução:
  - a chave cadastra empresa, oportunidade e atividade **em nome de qualquer membro ativo** (a integração nunca é a responsável), sem precisar de `empresas.transferir`; **trocar** o responsável de uma empresa que já existe continua exigindo `empresas.transferir`, que passou a ser uma permissão liberada para chaves;
  - empresa nova com CNPJ: a Receita vai para a fila do worker (`receita.situacao_nao_verificada = true` na resposta), como planejado; `consultar_receita: false` não consulta;
  - `origem` da atividade criada pela API é `api` (valor que o enum já tinha), não `integracao`;
  - grupo automático (Visitação) recusado com **400** (a validação de tags que o app já usa), não 422;
  - no lote, `status` e `tags` só se aplicam a empresa nova (na atualização, use `PUT /empresas/{id}/tags/{tag}`);
  - `Idempotency-Key` também guarda o status HTTP e devolve `Idempotent-Replayed: true` na repetição.
- Contrato: `docs/api/publica-v1.openapi.json` (gerado por `pnpm --filter @leadtogo/api api:publica:atualizar`, que **recusa mudança não aditiva**, salvo `--quebrar` numa v2); o teste `openapi-publica.test.ts` confere que o retrato está em dia, que toda rota pública está nele e que a página e o JSON são servidos. O documento interno (`apps/api/openapi.json`) não traz as rotas públicas.
- Documentação aberta em produção: `/v1/publica/docs` (Swagger UI) e `/v1/publica/openapi.json`.
- Testes: `apps/api/src/integracoes/publica/publica.test.ts` (identidade, cadastros, empresas, tags pela chave do sistema, cursor, lote, transferência, idempotência, contatos, atividades com `id_externo`, oportunidades, escopo e isolamento) e a rede de segurança de `isolamento-http.test.ts` (toda rota pública dá 401 `chave_invalida` sem chave).

### I3 — Webhooks de saída (migração 0040)
- Entregue como na seção 6. Código em `apps/api/src/integracoes/webhooks/`: `eventos.ts` (envelope e emissão no outbox), `entrega.ts` (POST assinado, proteção contra SSRF), `processador.ts` (distribuição, entrega, reenvio, desligamento, varredura) e a gestão em `/v1/integracoes/webhooks` (`integracoes.gerir`; criar e trocar o segredo exigem 2FA).
- Eventos emitidos: `empresa.criada` (não na importação), `empresa.atualizada` (com `campos`), `empresa.tag_alterada` (inclusive as automáticas, como Visitada e Contactada; não no cadastro), `empresa.responsavel_alterado`, `contato.criado`, `contato.atualizado`, `atividade.criada`, `atividade.concluida`, `oportunidade.criada`, `oportunidade.fase_alterada`, `oportunidade.status_alterado` (fechar e reabrir) e `importacao.concluida` (um por lote).
- Ajustes na execução:
  - o segredo é `whsec_` + 256 bits e a assinatura vai em `X-Leadtogo-Assinatura: t=<unix>,v1=<hex>`; na rotação, dois `v1` por 24 h;
  - a fila nova `webhooks` (concorrência 5) só é consumida com a `TOKEN_ENCRYPTION_KEY` definida (sem ela não há como decifrar o segredo);
  - o reenvio é nosso (não o do BullMQ): a entrega guarda `proxima_tentativa_em`, e a varredura `varrer-webhooks` (a cada minuto) devolve à fila a que se perdeu;
  - "Enviar teste" sai mesmo com o webhook desligado (entrega `avulsa`); o reenvio manual zera as tentativas;
  - variáveis novas: `WEBHOOK_HOSTS_INTERNOS` (lista) e `WEBHOOK_TIMEOUT_MS` (padrão 10 s).
- Testes: `apps/api/src/integracoes/webhooks/webhooks.test.ts` (entrega de ponta a ponta com destino falso e assinatura conferida, sem assinante nada no outbox, rollback sem evento, teste avulso, falha com reagendamento, reenvio, desistência na 8ª, redirecionamento não seguido, 410, 3 dias falhando, religar, rotação do segredo, 2FA, segredo cifrado, URL interna recusada, isolamento, exclusão, SSRF por IP literal e por DNS) e `packages/db/src/testes/integracoes.test.ts` (varredura e limpeza).

### I4 — Pacote do n8n
- `integrations/n8n/README.md` (credencial, endereço, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, convenções da API, como receber eventos e versionar) e três workflows modelo em `integrations/n8n/workflows/`: receber eventos com a assinatura conferida, formulário do site → Lead + contato + tarefa, e a lista diária dos associados (o primeiro passo da integração com o Omie).
- O código de conferência da assinatura do workflow foi testado contra a assinatura que a API gera (corpo bruto e corpo reserializado aceitos; corpo adulterado e carimbo com mais de 5 minutos recusados). A importação dos JSON no n8n é conferida no roteiro de teste (não há n8n no ambiente de desenvolvimento).
- Roteiro de teste de ponta a ponta das quatro fases: [`roteiro_teste_api_aberta.md`](roteiro_teste_api_aberta.md).

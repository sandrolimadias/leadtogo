# Plano: card e zonas do Kanban, data de fechamento e tags de oportunidade

*Proposta de 30/10/2026, **aprovada pelo Ale em 31/10/2026** (as decisões da seção 3 como recomendado, mais a decisão 8a: o administrador pode alterar a data de criação da oportunidade; o que ficou para depois foi para `backlog_pos_mvp.md`, seção Oportunidades). Quatro pedidos na tela **Oportunidades**: (1) o card do Kanban passa a mostrar a **empresa em maiúsculas e negrito** na primeira linha e o **título** abaixo; (2) as **zonas de fechamento** (Conquistada, Perdida, Cancelada, Suspensa) deixam de cobrir o cabeçalho das colunas: quando aparecem, as colunas **descem**; (3) ao fechar, **admin e gestor escolhem a data de fechamento** (nunca no futuro); (4) **funcionalidade nova:** **tags de oportunidade**, em grupos próprios que não valem para empresas nem contatos, com várias tags por oportunidade. Regras em `funcionalidades.md` (seções 2, 7 e "Perfis de acesso") e modelo em `modelagem_banco.md`, que serão atualizados nos mesmos commits.*

## 1. Objetivo

1. **Card do Kanban.** Hoje: título (link, negrito) e, abaixo, a empresa em cinza. Passa a ser: **NOME DA EMPRESA** (maiúsculas, negrito) na 1ª linha e o **título da oportunidade** (link para a ficha, peso normal) na 2ª. O resto do card não muda.
2. **Zonas de fechamento visíveis.** Hoje, ao arrastar, as quatro zonas aparecem numa faixa `absolute` por cima do topo do quadro e escondem o nome, a quantidade e a soma das fases. Passam a ocupar **espaço próprio** acima das colunas: ao começar a arrastar, a faixa entra no fluxo e as colunas **descem** a altura dela; ao soltar ou cancelar, as colunas sobem de volta.
3. **Data de fechamento.** A janela "Fechar oportunidade" (aberta ao soltar numa zona, pelo menu do card, pela lista ou pela ficha) ganha o campo **"Data de fechamento"** (padrão: hoje, **sem data futura**), visível e aceito **só para quem tem a permissão nova** `oportunidades.data_fechamento` (perfis de sistema **Admin** e **Gestor**). Sem a permissão, o campo não aparece e a data continua sendo o momento do fechamento.
4. **Tags de oportunidade.** O admin cria, em *Configurações → Tags*, grupos de tags **de oportunidade** (ex.: "Tipo de negócio": Novo, Renovação, Upsell; "Concorrente": Concorrente A, Concorrente B). Esses grupos **não aparecem para empresas nem para contatos**, e os deles não aparecem para oportunidades. Uma oportunidade pode ter **várias tags**. As tags aparecem no card do Kanban, na lista e na ficha, entram no formulário e viram o filtro **"Tag da oportunidade"**.

## 2. O que se reaproveita

| Peça | Onde está | Uso aqui |
|---|---|---|
| Card do Kanban | `apps/web/src/telas/oportunidades/cartao.tsx` (`CartaoDeOportunidade`, também usado no `DragOverlay`) | Troca a ordem e o estilo das duas primeiras linhas; ganha os chips de tags |
| Faixa das zonas e detecção de colisão | `apps/web/src/telas/oportunidades/kanban.tsx` (`ZONAS`, `ZonaDeFechamento`, `colisao`, `coordenadasDoTeclado`) | A faixa sai do `absolute` e entra no fluxo; medição dos alvos durante o arraste |
| Janela "Fechar oportunidade" | `apps/web/src/telas/oportunidades/fechar.tsx` (`JanelaDeFechamento`, `DadosDoFechamento`) | Campo "Data de fechamento" |
| Entrada do fechamento | `packages/shared/src/oportunidades.ts` (`fecharOportunidadeSchema`) | Campo opcional `dataFechamento` (dia `AAAA-MM-DD`) |
| Gravação do fechamento | `apps/api/src/carteira/oportunidades-gravacao.ts` (`registrarFechamento` já aceita `dataFechamento`, usado pela importação) | Recebe a data escolhida pela tela |
| Regra "não pode ser no futuro" | `apps/api/src/importacao/executor-oportunidades.ts` (importação já recusa fechamento futuro) | Mesma regra e mesma mensagem |
| Catálogo de permissões e sincronização dos perfis de sistema | `packages/shared/src/permissoes.ts` (`VERSAO_DO_CATALOGO`, `NOVAS_POR_VERSAO`), `apps/api/src/perfis/padroes-dos-perfis.ts` | Permissão nova na versão 11, ligada no padrão de Admin e Gestor |
| Escopo da carteira | `apps/api/src/carteira/regras-de-carteira.ts` (`escopoDaCarteira`) | Campo novo `dataDeFechamento: boolean` |
| `tag_grupos`/`tags` com `aplica_a`, gatilho `app_conferir_alvo_da_tag()` | migração `0043_tags_de_contato.sql`, `packages/db/src/schema/cadastros.ts` | Valor novo `oportunidade` no enum e tabela `oportunidade_tags` |
| Tags do contato (conferência, diferença, rota, auditoria, abas da configuração, janela "Editar tags") | `apps/api/src/carteira/contato-tags.ts`, `apps/web/src/telas/cadastros/tags.tsx`, `apps/web/src/telas/empresas/ficha-tags.tsx` | Mesmo desenho para `oportunidade-tags.ts`; terceira aba **Oportunidades** |
| Filtros da tela (URL) | `apps/web/src/telas/oportunidades/busca.ts`, `lista-oportunidades.service.ts` | Filtro novo `tagOportunidadeId` (Kanban e lista) |

## 3. Decisões (aprovadas pelo Ale em 31/10/2026)

**Card (item 1)**

1. A maiúscula é **só visual** (`uppercase` do CSS): o nome continua gravado como está, a busca e as outras telas não mudam, e o leitor de tela lê o nome normal. Nome longo quebra em **até 2 linhas** (`line-clamp-2`, com o nome completo no `title`), para o card não crescer demais. *Recomendado.*
2. O **link para a ficha** continua no título (2ª linha). A empresa fica como texto (sem link), para não haver dois alvos de clique colados no card pequeno.
3. Vale **só para o card do Kanban** (e o clone que acompanha o ponteiro). Lista, ficha e busca global seguem como estão.

**Zonas (item 2)**

4. A faixa das zonas (altura 48px + respiro, como hoje) **entra no fluxo** do quadro enquanto se arrasta; as colunas encolhem na altura e descem. Sem animação quando o sistema pede movimento reduzido; nos demais casos, transição curta de altura (≤150ms, token de duração do design system).
5. O `DndContext` passa a **medir os alvos durante o arraste** (`measuring.droppable.strategy = Always`), porque as colunas mudam de lugar depois que o arraste começa. A detecção de colisão continua dando prioridade às zonas.
6. Vale para desktop, tablet e celular (no celular a faixa já é a mesma, com 4 zonas em grade).

**Data de fechamento (item 3)**

7. **Permissão nova `oportunidades.data_fechamento`** ("Escolher a data de fechamento da oportunidade"), versão 11 do catálogo, ligada no padrão dos perfis de sistema **Admin** e **Gestor** e desligada no **Vendedor**. Os perfis de sistema existentes recebem a chave na partida da API (mecanismo de `NOVAS_POR_VERSAO`); **perfis criados pela empresa não recebem** (o admin liga se quiser). *Recomendado* em vez de olhar o papel fixo, porque o sistema já decide tudo por perfil.
8. O campo é um **dia** (`AAAA-MM-DD`, no fuso da empresa), padrão **hoje**, com `max` = hoje. Regras na API: **não pode ser no futuro** (400 `fechamento_no_futuro`, "A data de fechamento não pode ser no futuro.", a mesma mensagem da importação) e **não pode ser antes da criação da oportunidade** (400 `fechamento_antes_da_criacao`). *Recomendado* o limite inferior para o relatório não ficar com oportunidade fechada antes de existir; se o Ale preferir sem limite inferior, sai essa regra.
8a. **O administrador pode alterar a data de criação** (pedido do Ale em 31/10/2026, para acompanhar o limite da decisão 8). Permissão nova **`oportunidades.data_criacao`** ("Alterar a data de criação da oportunidade"), na mesma versão 11, ligada só no padrão do perfil de sistema **Admin**. No formulário de **editar**, quem tem a permissão vê o campo **"Criada em"** (dia; `max` = hoje). Regras na API: não pode ser no futuro (400 `criacao_no_futuro`) nem depois da data de fechamento, se a oportunidade estiver fechada (400 `criacao_depois_do_fechamento`); sem a permissão, mandar o campo dá 403 `acesso_negado`. Dia passado grava o meio-dia no fuso da empresa (como a decisão 9). Muda `oportunidades.criado_em` (base de "Criada em" na ficha, da ordenação da lista e das "novas no período" do Dashboard); a linha `criada` do histórico de fases continua como foi registrada (o histórico é só de acréscimo) e a troca fica na **auditoria** (`criadaEm` de/para).
9. **Hoje** grava o momento exato (como hoje). **Dia passado** grava o **meio-dia** desse dia no fuso da empresa (fica no dia certo em qualquer filtro por período e no Dashboard, que agrupa por dia no fuso).
10. Quem **não tem** a permissão não vê o campo; se mandar `dataFechamento` pela API, recebe **403** `acesso_negado` (não é ignorado em silêncio). Chave de API (integração) segue a mesma permissão do perfil de integração.
11. **Suspensa:** também aceita a data (o fechamento de suspensa marca quando saiu de Ativo). "Retomar em" continua não podendo ser no passado.
12. **Histórico:** a linha de `oportunidade_historico` continua com `em` = momento real do registro (não reescreve a ordem dos eventos); a data escolhida vai na **auditoria** (`dataFechamento` em `alteracoes`) e aparece na aba Histórico como "Fechada com data de 12/10/2026". Reabrir apaga a data, como hoje.
13. **Fora desta entrega:** alterar a data de fechamento **depois** de fechada (só reabrindo e fechando de novo).

**Tags de oportunidade (item 4)**

14. **Modelo: as mesmas tabelas `tag_grupos`/`tags`**, com o valor novo **`oportunidade`** no enum `alvo_de_tag`, e a tabela nova **`oportunidade_tags`**, exatamente como as tags de contato (29/10/2026). *Recomendado:* reaproveita cor, ordem, inativação, nome único, proteção de exclusão, a tela de configuração e o gatilho que recusa tag do destino errado.
15. O destino do grupo é escolhido na criação e **não muda depois**. Vários grupos de oportunidade, cada um com seleção **única** ou **múltipla** (padrão **múltipla**). **Sem "obrigatório" nem "automático"**; **nenhum grupo nasce pronto** (o admin cria). Nome do grupo continua **único por empresa** entre os três destinos.
16. **Onde se aplicam:** no **formulário** de nova oportunidade e de editar (seção "Tags", só quando existe grupo de oportunidade com tag ativa) e no botão **"Editar tags"** da ficha da oportunidade.
17. **Onde aparecem:** **card do Kanban** (chips pequenos abaixo do título, todos, quebrando linha, na ordem do grupo e da tag), **coluna "Tags"** na lista (depois de "Oportunidade") e chips nos cartões do celular, e o **cabeçalho da ficha**.
18. **Filtro novo "Tag da oportunidade"**, de escolha única, no Kanban e na lista (E/OU fica para depois, como nos contatos).
19. **Duplicar** copia as tags (são parte da descrição do negócio, como solução e origem); a cópia pode tirá-las no formulário.
20. **Permissões:** criar e editar grupos e tags é de `cadastros.gerir` (*Configurações → Tags*). Aplicar e tirar é de **quem pode editar a oportunidade** (`oportunidades.editar` com o alcance da carteira). Oportunidade **fechada** também aceita mudar tags (serve para classificar o histórico, ex.: "Concorrente" de uma perdida).
21. **Histórico:** só a **auditoria** (ação `alterar_tags`, lida em português na aba Histórico da ficha). Sem tabela de histórico de tags.
22. **Fora desta entrega** (backlog): tags na importação de oportunidades, na API pública e nos webhooks, aplicar em massa, combinação E/OU, Dashboard por tag e busca global por tag.

## 4. Parte 1: card do Kanban (só front)

**Arquivos:** `apps/web/src/telas/oportunidades/cartao.tsx`, `kanban.test.tsx`.

- 1ª linha: `<span>` com `o.empresa.nome`, `uppercase font-semibold text-[13px] tracking-wide text-ink line-clamp-2 [overflow-wrap:anywhere]`, `title` com o nome completo.
- 2ª linha: o `Link` do título, `text-sm text-ink font-normal`, sublinhado no hover (como hoje).
- `aria-label` do `article` passa a ser "Título · Empresa", para o leitor de tela e a busca por papel.
- Tokens do design system apenas (`ink`, `ink-muted`, tamanhos da escala); nada de cor ou peso fora deles.
- **Testes:** a empresa vem antes do título e com a classe `uppercase`; o link da ficha continua no título; o clone do arraste mostra o mesmo.
- **Docs:** `funcionalidades.md` seção 7 ("Card: **empresa (maiúsculas, negrito)**, nome, valor…") e `revisao_prototipo.md` (o protótipo mostra o nome primeiro; vale o documento).

## 5. Parte 2: zonas de fechamento acima das colunas (só front)

**Arquivos:** `apps/web/src/telas/oportunidades/kanban.tsx`, `kanban.test.tsx`, `apps/web/e2e/` (E2E do arraste, se houver; senão um novo `oportunidades-kanban.spec.ts`).

- A `div` das zonas deixa de ser `absolute inset-x-0 top-0 z-20` e vira um bloco **no fluxo**, antes do quadro, dentro do `flex-col`: `grid grid-cols-4 gap-2 flex-none`. O quadro (`flex-1 min-h-0`) encolhe sozinho; cada coluna continua rolando os próprios cards.
- `DndContext` com `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}`.
- Atualizar o comentário de `colisao` (as zonas não cobrem mais as colunas; a prioridade continua) e conferir `coordenadasDoTeclado` (seta para cima/baixo entre faixa e fases continua funcionando).
- Movimento reduzido: sem transição (`useReduzirMovimento`, já usado no arquivo).
- **Testes (Vitest):** ao começar a arrastar, a faixa existe e o cabeçalho das fases continua visível (não está dentro de um bloco sobreposto); ao soltar, a faixa some. **E2E (Playwright, desktop e celular):** durante o arraste, o retângulo do cabeçalho da primeira fase fica **abaixo** do retângulo da faixa (sem sobreposição) e soltar numa zona abre "Fechar oportunidade".
- **Docs:** `funcionalidades.md` seção 7 (zona de soltura "no topo, **empurrando as colunas para baixo**") e `design_system.md`, seção "Kanban".

As Partes 1 e 2 são independentes e podem ir para produção antes das outras.

## 6. Parte 3: data de fechamento escolhida por admin e gestor

### 6.1 Compartilhado (`packages/shared`)

- `permissoes.ts`: `p('oportunidades', 'data_fechamento', 'Escolher a data de fechamento da oportunidade')` e `p('oportunidades', 'data_criacao', 'Alterar a data de criação da oportunidade')`; `VERSAO_DO_CATALOGO = 11`; `NOVAS_POR_VERSAO[11] = ['oportunidades.data_fechamento', 'oportunidades.data_criacao']`; `data_fechamento` ligada no padrão de `admin` e `gestor`, `data_criacao` só no de `admin`.
- `oportunidades.ts`: `criadaEm: dia.optional()` na entrada de **alteração** (não na criação).
- `oportunidades.ts`: `dataFechamento: dia.optional()` em `fecharOportunidadeSchema`.
- Testes: schema aceita dia válido e recusa formato inválido; o catálogo tem a chave e a versão 11.

### 6.2 API (`apps/api`)

- `regras-de-carteira.ts`: `dataDeFechamento: permissao.pode('oportunidades.data_fechamento')` no escopo.
- `oportunidades.service.ts` (`fechar`): se veio `dataFechamento` e o escopo não tem a permissão → 403 `acesso_negado`; se é maior que hoje no fuso → 400 `fechamento_no_futuro`; se é menor que o dia de `criado_em` no fuso → 400 `fechamento_antes_da_criacao`. Converte: hoje → `new Date()`; dia passado → meio-dia no fuso (função ao lado de `inicioDoDiaNoFuso`). Passa para `registrarFechamento` (que já aceita o campo).
- Auditoria `fechar` com `dataFechamento` quando escolhida; `historico` da ficha lê em português.
- Leitura da oportunidade e de `/me` (ou de onde a tela tira as permissões): nada novo além da chave no perfil.
- OpenAPI atualizado e `packages/api-client` regenerado.
- **Testes:** gestor fecha com data passada (grava o meio-dia no fuso e o Dashboard conta no mês certo); admin fecha com hoje; data futura → 400; antes da criação → 400; vendedor manda a data → 403; vendedor sem a data continua fechando; perfil de sistema antigo recebe a chave na sincronização (teste de `padroes-dos-perfis`); perfil customizado não recebe; reabrir limpa a data.

### 6.3 Web (`apps/web`)

- `fechar.tsx`: `TextField type="date"` **"Data de fechamento"**, `max={hojeEmTexto()}`, padrão hoje, dica "Use quando a oportunidade fechou antes de ser registrada aqui.", só quando a sessão tem `oportunidades.data_fechamento`. Validação local (futuro) e mensagem da API exibida no campo. `DadosDoFechamento` ganha `dataFechamento?` (enviado só quando diferente de hoje).
- **Testes:** gestor vê o campo e manda a data; vendedor não vê; data futura bloqueada; erro da API aparece.
- **Docs:** `funcionalidades.md` seção 7 (tabela "Data de fechamento": "Automática ao sair de Ativo; **admin e gestor podem informar um dia passado**") e "Perfis de acesso" (catálogo com 30+ chaves, a nova chave e a versão 11); `roteiro_teste_modulo6.md` ou roteiro novo (seção 9).

## 7. Parte 4: tags de oportunidade

### 7.1 Banco (migrações `0044` e `0045`, só expansão)

- **`0044_alvo_de_tag_oportunidade.sql`**: `ALTER TYPE alvo_de_tag ADD VALUE 'oportunidade';` sozinha (o valor novo de enum não pode ser usado na mesma transação em que foi criado).
- **`0045_tags_de_oportunidade.sql`**:
  - Tabela **`oportunidade_tags`** no molde de `contato_tags`: `tenant_id uuid NOT NULL` → `tenants`, `oportunidade_id uuid NOT NULL` → `oportunidades`, `tag_id uuid NOT NULL` → `tags`, `aplicada_em timestamptz NOT NULL DEFAULT now()`, `aplicada_por uuid` → `membros`. **PK `(oportunidade_id, tag_id)`**, índice `(tenant_id, tag_id)`.
  - **RLS habilitado e forçado** com a política padrão por `tenant_id`; `GRANT` para `leadtogo_app`.
  - `CREATE OR REPLACE FUNCTION app_conferir_alvo_da_tag()` com o `CASE` incluindo `'oportunidade_tags' THEN 'oportunidade'`, e o gatilho `oportunidade_tags_alvo AFTER INSERT OR UPDATE OF tag_id`.
- Drizzle: valor novo em `alvoDeTag` (`schema/cadastros.ts`) e `oportunidadeTags` em `schema/oportunidades.ts`; `pnpm db:generate` para conferir.
- **Testes (`packages/db/src/testes`):** fábrica de `oportunidade_tags` no teste de isolamento (tenant A não lê nem grava as do tenant B); o gatilho recusa tag de empresa e de contato em `oportunidade_tags` e tag de oportunidade em `empresa_tags` e `contato_tags`.

### 7.2 Compartilhado (`packages/shared`)

- `cadastros.ts`: `aplicaA` aceita `'oportunidade'` (na criação; para `contato` e `oportunidade`, `obrigatorio` falso).
- `oportunidades.ts`: `tags` (id, nome, cor, grupo) na leitura e no item do Kanban/lista; `tagIds` (até 50) na criação e na edição; `tagOportunidadeId` na consulta do Kanban e da lista; `editarTagsDaOportunidadeSchema = { tagIds }`.
- Testes dos schemas.

### 7.3 API (`apps/api`)

- **Cadastro de tags:** `GET /configuracoes/tag-grupos?aplicaA=oportunidade`; `aplicaA=todos` passa a trazer os três destinos. Sem o parâmetro continua só empresa (nada muda nas telas de empresa). "Tag/grupo em uso" passa a contar `oportunidade_tags` ("já foram usadas por empresas, contatos ou oportunidades").
- **`carteira/oportunidade-tags.ts`** (no molde de `contato-tags.ts`): `conferirTagsDaOportunidade` (existe, ativa, grupo `oportunidade` ativo, no máximo uma por grupo de seleção única) e `gravarDiferencaDeTagsDaOportunidade`.
- `oportunidades.service.ts`: criar, editar e **duplicar** aceitam `tagIds`; rota nova **`PUT /oportunidades/:id/tags`** (`{ tagIds }`), com `oportunidades.editar` e a regra de carteira, aceita também em oportunidade fechada; auditoria `alterar_tags` (nomes adicionados e removidos), lida em português no histórico da ficha.
- `oportunidades-leitura.ts`, Kanban e `lista-oportunidades.service.ts`: devolvem as tags (uma consulta agregada por fase/página, não por card) e filtram `tagOportunidadeId` com `EXISTS`.
- Exclusão lógica da oportunidade mantém as tags (restaurar traz de volta).
- OpenAPI e `packages/api-client` regenerados.
- **Testes:** grupo de oportunidade criado; tag de oportunidade recusada em empresa e contato, e as deles recusadas na oportunidade (400 com código estável); seleção única; filtro no Kanban e na lista; tags na leitura na ordem certa; duplicar copia; tag usada só por oportunidade não se exclui (409); vendedor fora da carteira não altera (403/404); auditoria em português; **isolamento entre tenants** na rota nova.

### 7.4 Web (`apps/web`)

- **Configurações → Tags** (`telas/cadastros/tags.tsx`): terceira aba **Oportunidades** (estado vazio próprio; janela sem "Obrigatório"; textos "a oportunidade tem só uma tag do grupo" / "pode ter várias").
- **Card do Kanban** (`cartao.tsx`): chips `Tag` pequenos abaixo do título, quebrando linha.
- **Lista** (`lista.tsx`): coluna "Tags" e chips nos cartões do celular.
- **Ficha** (`ficha.tsx`): tags no cabeçalho + **"Editar tags"** (janela de `ficha-tags.tsx`, a mesma da empresa e do contato), só com permissão de editar.
- **Formulário** (`formulario.tsx`): seção "Tags" (checkbox nos grupos de múltipla, radio nos de única); na edição, as tags só vão no corpo quando mexidas (como no contato); duplicar vem com as tags.
- **Filtro** "Tag da oportunidade" (`busca.ts`: `tagOportunidade` na URL, na contagem de filtros e na consulta), no Kanban e na lista.
- **Testes:** aba da configuração; formulário com tags; ficha editando (única e múltipla); card e lista com chips; filtro na URL e na consulta; telas de empresa e contato não mostram grupos de oportunidade.

### 7.5 Documentos

- `funcionalidades.md`: seção 2 ("Aplica a: Empresas, Contatos ou **Oportunidades**", com as regras das decisões 14 e 15) e seção 7 (cadastro com "Tags"; card, lista, ficha e filtros).
- `modelagem_banco.md`: enum com `oportunidade`, `oportunidade_tags`, o gatilho e a nota das migrações 0044/0045; contagem de tabelas.
- `backlog_pos_mvp.md`: o que ficou fora (decisões 13 e 22).

## 8. Commits (cada um com `pnpm lint && pnpm typecheck && pnpm test` verde)

1. `feat(web): card do kanban com a empresa em maiúsculas acima do título` (Parte 1 + docs).
2. `feat(web): zonas de fechamento empurram as colunas do kanban para baixo` (Parte 2 + E2E + docs).
3. `feat: admin e gestor escolhem a data de fechamento da oportunidade` (permissão v11, schema, API, janela, testes, docs).
4. `feat(db): valor oportunidade no destino das tags` (migração 0044).
5. `feat(db): tabela oportunidade_tags com RLS e gatilho de destino` (migração 0045, Drizzle, isolamento).
6. `feat(api): tags da oportunidade no cadastro, na ficha, no kanban e na lista` (rota, leitura, filtro, duplicar, auditoria, api-client).
7. `feat(web): aba Oportunidades em Configurações → Tags`.
8. `feat(web): tags no card, na lista, na ficha, no formulário e no filtro de oportunidades`.
9. `docs: roteiro de teste do kanban, da data de fechamento e das tags de oportunidade` (`roteiro_teste_oportunidades_tags.md`).

As migrações 0044 e 0045 só **acrescentam** (valor de enum e tabela nova): nenhum `BREAKING-DB`, e o código antigo continua funcionando durante o deploy. A versão 11 do catálogo só **acrescenta** a chave aos perfis de sistema.

## 9. Roteiro de teste manual (resumo, para o Ale)

1. Kanban: o card mostra **EMPRESA** em negrito e o título abaixo; nome longo quebra em duas linhas.
2. Arrastar um card: as quatro zonas aparecem e as colunas descem; nomes, quantidades e somas das fases continuam visíveis; soltar ou cancelar volta ao normal (desktop, tablet e celular).
3. Como **gestor**: fechar como Conquistada com data de 3 dias atrás; conferir a data na ficha, na lista (filtro "fechada de/até") e no Dashboard. Tentar data futura: bloqueado.
4. Como **vendedor**: a janela não mostra a data; a oportunidade fecha com hoje.
5. *Configurações → Tags → Oportunidades*: criar "Tipo de negócio" (múltipla) com três tags; aplicar duas numa oportunidade pela ficha e uma pelo formulário; filtrar o Kanban e a lista; duplicar e conferir as tags; conferir que empresas e contatos não mostram o grupo; tentar excluir tag em uso (só inativa).

## 10. Riscos

| Risco | Como se trata |
|---|---|
| Colunas mudarem de lugar no meio do arraste e o card cair na fase errada | Medição contínua dos alvos (`MeasuringStrategy.Always`) + teste E2E do retângulo e do soltar |
| "Pulo" visual ao aparecer a faixa | Transição curta de altura, desligada com movimento reduzido |
| Fechamento com data retroativa distorcer relatórios | Só com permissão, nunca no futuro, nunca antes da criação, e registrado na auditoria |
| Tag de oportunidade vazar para empresa ou contato | `GET` sem parâmetro continua só empresa, conferência na API e gatilho no banco, com teste |
| Kanban mais lento com as tags | Uma consulta agregada por carga do quadro e o índice `(tenant_id, tag_id)` |
| `ADD VALUE` de enum na mesma transação que o usa | Migração 0044 separada da 0045 |

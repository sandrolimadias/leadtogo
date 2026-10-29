# Plano: filtros recolhíveis e tags dos contatos

*Proposta de 29/10/2026, **aguardando a aprovação do Ale** (decisões da seção 3). Duas melhorias na tela **Contatos**: (1) os filtros saem da barra e passam a abrir e fechar por um botão "Filtros", um abaixo do outro; (2) **funcionalidade nova:** tags próprias do contato, em grupos que não valem para empresas, com várias tags por contato. Regras em `funcionalidades.md` (seções 2 e 4) e modelo em `modelagem_banco.md` (seções de cadastros e de contatos), que serão atualizados nos mesmos commits.*

## 1. Objetivo

1. **Filtros recolhíveis.** Hoje, no desktop e no tablet, os quatro filtros (Empresa, Cargo, Papel na decisão, Tag da empresa) ficam em linha ao lado da busca; só o celular tem o botão "Filtros". Passa a ser igual em todos os dispositivos: a busca fica sozinha na barra, com o botão **"Filtros"** ao lado; o botão abre, **abaixo da busca**, os filtros **um abaixo do outro**; depois de escolher, o mesmo botão (ou "Fechar filtros") **recolhe a seção** de novo, e os filtros continuam valendo.
2. **Tags do contato.** O admin cria, em *Configurações → Tags*, **grupos de tags de contato** (ex.: "Perfil": Técnico, Comprador, Indicador; "Relacionamento": Promotor, Detrator). Esses grupos **não aparecem para empresas** (nem na ficha, nem na lista, nem no mapa, nem na importação) e os de empresa não aparecem para contatos. Um contato pode ter **várias tags**. As tags aparecem na lista e na ficha do contato e viram um filtro novo, **"Tag do contato"**.

## 2. O que se reaproveita

| Peça | Onde está | Uso aqui |
|---|---|---|
| Botão "Filtros · N" e `quantosFiltros` | `apps/web/src/telas/contatos/lista.tsx` e `busca.ts` (hoje só no celular) | Passa a valer em todos os dispositivos |
| Filtros na URL (`lerBusca`, `consultaDeContatos`) | `apps/web/src/telas/contatos/busca.ts` | Ganha `tagContato` |
| `tag_grupos` e `tags` (cor da paleta, ordem, ativo, seleção única/múltipla, nome único, proteção de exclusão em uso) | `packages/db/src/schema/cadastros.ts`, `apps/api/src/cadastros/tags.service.ts` | Mesmas tabelas, com a coluna nova `aplica_a` |
| Tela *Configurações → Tags* (grupos em blocos, Subir/Descer, janelas de grupo e tag) | `apps/web/src/telas/cadastros/tags.tsx` | Ganha as abas **Empresas** e **Contatos** |
| Janela "Editar tags" (uma por grupo de seleção única, várias nos de múltipla) | `apps/web/src/telas/empresas/ficha-tags.tsx` | Generalizada para empresa e contato |
| Conferência e gravação da diferença de tags | `apps/api/src/carteira/empresa-tags.ts` (`conferirTagsDaEmpresa`, `gravarDiferencaDeTags`) | Mesmo desenho para `contato-tags.ts` |
| Filtro de tag da empresa na lista de contatos | `apps/api/src/carteira/lista-contatos.service.ts` | Filtro novo, irmão, sobre `contato_tags` |
| Auditoria do contato (aba Histórico em português) | `AuditoriaService`, `historico-contato.service.ts` | Ação nova `alterar_tags` |
| Regra de carteira do contato | `condicaoDeVisibilidadeDoContato`, `regras-de-contato.ts` | Quem edita o contato edita as tags dele |

## 3. Decisões (para o Ale aprovar)

1. **Modelo: as mesmas tabelas `tag_grupos`/`tags`, com a coluna nova `tag_grupos.aplica_a`** (`empresa` · `contato`, padrão `empresa`), e a tabela nova **`contato_tags`**. *Recomendado.* Reaproveita cores, ordem, inativação, nome único, proteção de exclusão e a tela de configuração inteira. A alternativa (tabelas `contato_tag_grupos` e `contato_tag_itens` separadas) isola 100% por construção, mas duplica cadastro, API e tela. O risco do modelo recomendado (uma tag de contato vazar para uma tela de empresa) é coberto pela seção 5 (todos os usos de empresa passam a filtrar `aplica_a = 'empresa'`) e por um **gatilho no banco** que recusa tag do destino errado em `empresa_tags` e em `contato_tags`.
2. **O destino do grupo é escolhido na criação e não muda depois** (não se "move" um grupo de empresa para contato: as tags já aplicadas perderiam o sentido).
3. **Vários grupos de contato**, cada um com seleção **única** ou **múltipla** (padrão múltipla). **Nenhum grupo de contato nasce pronto** (o admin cria os que quiser); o estado vazio da aba explica o que são e oferece "Novo grupo". Para contato **não há** "obrigatório" nem "automático" (nenhuma regra do sistema aplica tag em contato nesta fase).
4. **Nome do grupo continua único por empresa** (entre empresa e contato), para não haver dois "Perfil" confundindo a configuração. O nome da tag segue único dentro do grupo.
5. **Onde se aplicam as tags:** na **ficha do contato**, botão **"Editar tags"** ao lado das tags (como na ficha da empresa), e no **formulário de novo contato e de editar contato** (seção "Tags", só quando existe algum grupo de contato ativo).
6. **Onde aparecem:** **coluna "Tags"** na tabela de contatos (todas, quebrando linha, na ordem dos grupos e, dentro do grupo, na ordem das tags, como em Empresas) e **chips nos cartões** do celular; no **cabeçalho da ficha** do contato.
7. **Filtro novo "Tag do contato"**, de escolha única, como o "Tag da empresa" de hoje (que passa a listar só tags de grupos de empresa). Combinação **E / OU** entre várias tags fica para depois (anotada no backlog), igual ao filtro de empresas.
8. **Histórico:** só a **auditoria** do contato (ação `alterar_tags`, lida em português na aba Histórico). Não há tabela de histórico como `empresa_tags_historico`, que existe para medir conversão de Status; contato não tem essa métrica.
9. **Permissões:** criar e editar grupos e tags de contato é do **admin** (*Configurações → Tags*, como hoje). Aplicar e tirar tags é de **quem pode editar o contato** (perfil com `contatos.editar` e regra de carteira).
10. **Filtros recolhíveis:** a seção começa **fechada** em todos os dispositivos, inclusive quando a URL já traz filtros (o botão mostra "Filtros · N" e "Limpar filtros" continua visível). Aberta, mostra os filtros **um por linha**, cada um com o rótulo acima, com largura máxima de 420px no desktop e no tablet e largura total no celular, e o botão **"Fechar filtros"** no fim. Ordem: Empresa · Cargo · Papel na decisão · Tag do contato · Tag da empresa.
11. **Fora desta entrega** (backlog): tags na importação de contatos, na API pública e nos webhooks, aplicar tag de contato **em massa**, busca global por tag e combinação E/OU.

## 4. Parte 1: filtros recolhíveis (só front)

**Arquivos:** `apps/web/src/telas/contatos/lista.tsx`, `lista.test.tsx`, `filtro-de-empresa.tsx` (ganha `label`) e um E2E novo, `apps/web/e2e/contatos-layout.spec.ts` (desktop, tablet e celular, como o de Empresas).

- Barra: `TextField` da busca (largura total) + Button **"Filtros"** (ícone `Filter`, `aria-expanded`, `aria-controls` apontando a seção; com filtro ativo, "Filtros · N") + "Limpar filtros" (ghost, só com filtro ativo) + no celular o IconButton "+" (como hoje).
- Seção de filtros (`id` estável, `role="region"`, `aria-label="Filtros"`): abaixo da barra, `flex flex-col gap-3`, `max-w-[420px]` em `md:` e largura total no celular; cada filtro com rótulo visível (o `Select` já aceita `label`; o `FiltroDeEmpresa` passa a aceitar); botão ghost **"Fechar filtros"** (ícone `ChevronUp`) no fim.
- O estado aberto/fechado é local (`useState`), não vai para a URL; ao abrir, o foco vai para o primeiro filtro; ao fechar pelo botão de dentro, o foco volta para "Filtros".
- Some o `minWidth: 4 * 200 + 3 * 8` e a grade de 4 colunas.
- Tokens e alturas do design system (`data-density="compact"` 28px no desktop e no tablet, 44px de toque no celular); nada de cor ou espaçamento fora dos tokens.
- **Testes (Vitest + Testing Library):** fechada por padrão; abre e mostra os filtros em coluna; escolher um filtro mantém a seção aberta e atualiza "Filtros · 1"; "Fechar filtros" recolhe e o filtro continua na URL e na consulta; "Limpar filtros" funciona com a seção fechada; desktop e celular.
- **Docs:** `funcionalidades.md` seção 4 ("Tela Contatos") e `revisao_prototipo.md` (o protótipo mostra os selects em linha no desktop; vale o documento).

Esta parte é independente e pode ir para produção antes da Parte 2.

## 5. Parte 2: tags do contato

### 5.1 Banco (migração `0043_tags_de_contato.sql`, só expansão)

- Enum `alvo_de_tag` (`empresa`, `contato`).
- `tag_grupos.aplica_a alvo_de_tag NOT NULL DEFAULT 'empresa'` (os grupos existentes ficam como `empresa`; sem backfill).
- Tabela **`contato_tags`**: `tenant_id uuid NOT NULL` → `tenants`, `contato_id uuid NOT NULL` → `contatos`, `tag_id uuid NOT NULL` → `tags`, `criado_em timestamptz NOT NULL DEFAULT now()`, `criado_por uuid` → `membros`. **PK `(contato_id, tag_id)`**, índice `(tenant_id, tag_id)` para o filtro e para "tag em uso". Sem `excluido_em` nem `atualizado_*`, como `empresa_tags` (a linha é o vínculo; tirar a tag apaga a linha e a auditoria guarda o que houve).
- **RLS habilitado e forçado** em `contato_tags`, com a política padrão por `tenant_id`, e `GRANT` para `leadtogo_app`.
- **Gatilho** `app_conferir_alvo_da_tag()` (`BEFORE INSERT OR UPDATE`) em `empresa_tags` e `contato_tags`: recusa a tag cujo grupo não tem o `aplica_a` da tabela. É a garantia final de que uma tela esquecida não grava tag de contato em empresa.
- Drizzle: `aplicaA` em `tagGrupos` (`schema/cadastros.ts`) e `contatoTags` em `schema/contatos.ts`; `pnpm db:generate` para conferir que o SQL gerado bate com a migração.
- **Testes (`packages/db/src/testes`):** fábrica de `contato_tags` no teste de isolamento (o tenant A não lê nem grava as tags de contato do tenant B); o gatilho recusa tag de contato em `empresa_tags` e tag de empresa em `contato_tags`.

### 5.2 Compartilhado (`packages/shared`)

- `cadastros.ts`: `aplicaA` em `tagGrupoSchema` e na entrada de criação (`'empresa' | 'contato'`, padrão `empresa`); a entrada de alteração **não** aceita `aplicaA`. Para `contato`, `obrigatorio` tem de ser falso.
- `carteira-contatos.ts`: `tags` (id, nome, cor, grupo) na leitura do contato e na linha da lista; `tagIds` (até 50) na criação e na edição; `tagContatoId` na consulta da lista; entrada `editarTagsDoContatoSchema = { tagIds }`.
- Testes dos schemas.

### 5.3 API (`apps/api`)

- **Cadastro de tags** (`cadastros/tags.service.ts` e controller): `GET /tags` aceita `?aplicaA=empresa|contato` (sem o parâmetro, devolve todos com o campo `aplicaA`, para a tela de configuração); criar grupo grava `aplicaA`; alterar não muda; "tag em uso" e "grupo em uso" passam a contar também `contato_tags` (mensagem: "já foram usadas por empresas ou contatos").
- **Usos de empresa passam a filtrar `aplica_a = 'empresa'`** (lista levantada no código em 29/10/2026):
  - `carteira/empresa-tags.ts` (`catalogoDeTags`: base da conferência da ficha, da edição em massa e do cadastro),
  - `carteira/lista.service.ts` (filtros e chips da lista de empresas),
  - `carteira/empresa-leitura.ts` (tags da ficha),
  - `carteira/oportunidades-efeitos.ts`, `importacao/executor-empresas.ts` e `importacao/lotes.service.ts` (usam `chave_sistema`, que só existe em grupos de empresa; conferir e cobrir com teste),
  - `visitas/modelos.service.ts` (campo "Tag" do construtor de visita: só tags de empresa),
  - mapa (legenda e seleção) e o filtro "Tag da empresa" da lista de contatos.
- **Tags do contato** (`carteira/contato-tags.ts`, no estilo de `empresa-tags.ts`): `conferirTagsDoContato` (tag existe, está ativa, é de grupo `contato` ativo; no grupo de seleção única, no máximo uma) e `gravarDiferencaDeTagsDoContato` (insere e apaga só o que mudou, na mesma transação).
- `contatos.service.ts`: criar e editar aceitam `tagIds`; rota nova **`PUT /contatos/:id/tags`** (`{ tagIds }`) para a ficha, com a mesma permissão de editar o contato e a regra de carteira; auditoria `alterar_tags` (entidade `contato`, com os nomes adicionados e removidos), lida em português em `historico-contato.service.ts`.
- `contato-leitura.ts` e `lista-contatos.service.ts`: devolvem as tags (uma consulta agregada por página, na ordem do grupo e da tag); filtro `tagContatoId` com `EXISTS` em `contato_tags`.
- **Exclusão do contato:** as tags ficam (o contato é excluído logicamente); a restauração as traz de volta.
- OpenAPI atualizado e `packages/api-client` regenerado.
- **Testes:** criar grupo de contato; tag de contato recusada na empresa (ficha, em massa, cadastro) e tag de empresa recusada no contato (400 com código estável); seleção única respeitada; filtro da lista; tags na leitura e na lista na ordem certa; tag ou grupo usado só por contato não se exclui (409); vendedor sem o contato na carteira não altera tags (403/404); auditoria e histórico em português; **isolamento entre tenants** na rota nova.

### 5.4 Web (`apps/web`)

- **Configurações → Tags** (`telas/cadastros/tags.tsx`): abas **Empresas** e **Contatos** (lembradas na URL, `?aba=contatos`). Na aba Contatos, "Novo grupo" cria com `aplicaA: 'contato'` e a janela não mostra "Obrigatório" e diz "Única: o contato tem só uma tag do grupo" / "Múltipla: o contato pode ter várias". Estado vazio próprio.
- **Telas de empresa** (lista, ficha, nova empresa, ações em massa, mapa, importação, construtor de visita): passam a pedir `GET /tags?aplicaA=empresa` (ou filtram no cliente), para nunca oferecer tag de contato.
- **Janela "Editar tags"**: `ficha-tags.tsx` vira um componente comum (`telas/comum/editar-tags.tsx` ou parecido), usado pela ficha da empresa e pela do contato.
- **Ficha do contato** (`telas/contatos/ficha.tsx`): tags no cabeçalho + Button ghost **"Editar tags"** (só com permissão de editar); salvar invalida a ficha e a lista.
- **Formulário** (`formulario.tsx`, `formulario-dados.ts`): seção "Tags" com os grupos de contato ativos (checkbox nos de múltipla, radio nos de única).
- **Lista** (`lista-partes.tsx`): coluna "Tags" na tabela (chips `Tag` com a cor da paleta, quebrando linha) e chips nos cartões do celular; filtro "Tag do contato" na seção de filtros da Parte 1 (`busca.ts`: `tagContato` na URL, em `temFiltroAtivo`, `quantosFiltros` e `consultaDeContatos`).
- **Testes:** abas da configuração; criar grupo de contato sem "Obrigatório"; ficha da empresa não lista grupos de contato; editar tags do contato (única e múltipla); formulário com tags; coluna e chips; filtro na URL e na consulta.

### 5.5 Documentos (nos mesmos commits)

- `funcionalidades.md`: seção 2 (grupo de tags ganha "Aplica a: Empresas ou Contatos", com as regras das decisões 2 a 4) e seção 4 (cadastro do contato com "Tags"; Tela Contatos com coluna, filtro e filtros recolhíveis).
- `modelagem_banco.md`: `tag_grupos.aplica_a`, `contato_tags`, o gatilho e a nota de implementação da migração 0043; contagem de tabelas.
- `revisao_prototipo.md`: as duas divergências em relação ao protótipo.
- `backlog_pos_mvp.md`: o que ficou fora (decisão 11).
- `roteiro_teste_tags_contatos.md`: roteiro manual para o Ale (criar grupos, aplicar, filtrar, conferir que nada aparece em empresas, excluir em uso).

## 6. Commits (cada um com `pnpm lint && pnpm typecheck && pnpm test` verde)

1. `feat(web): filtros de contatos recolhíveis, um abaixo do outro` (Parte 1 + docs da tela).
2. `feat(db): grupos de tags de contato e tabela contato_tags` (migração 0043, Drizzle, RLS, gatilho, isolamento).
3. `feat(api): destino das tags e telas de empresa só com tags de empresa` (cadastro com `aplicaA`, filtros nos usos de empresa, "em uso" contando contatos).
4. `feat(api): tags do contato na ficha, no cadastro e no filtro da lista` (rota, leitura, lista, auditoria, api-client).
5. `feat(web): aba Contatos em Configurações → Tags`.
6. `feat(web): tags na ficha, no formulário e na lista de contatos`.
7. `docs: roteiro de teste das tags de contato` (e o fechamento da revisão do protótipo).

A migração 0043 só **acrescenta** (coluna com padrão e tabela nova): nenhum `BREAKING-DB`, e o código antigo continua funcionando enquanto o deploy troca as versões.

## 7. Riscos

| Risco | Como se trata |
|---|---|
| Uma tela de empresa esquecida oferecer tag de contato | Filtro na API (`catalogoDeTags`) + gatilho no banco + teste por tela de empresa |
| Lista de contatos mais lenta com a coluna Tags | Uma consulta agregada por página (não por linha) e o índice `(tenant_id, tag_id)` |
| Excluir grupo ou tag usada só por contatos | "Em uso" passa a olhar `contato_tags`; teste de 409 |
| Copiar configurações entre empresas do grupo | Quando essa função existir, copia `aplica_a` junto (anotar em `funcionalidades.md`) |

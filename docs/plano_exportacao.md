# Plano da exportação de dados

*Proposta de 01/11/2026, **aguardando a aprovação do Ale** (as decisões da seção 3 estão com a recomendação marcada). Entrega dois itens: o "Exportar" das ações em massa da lista de Empresas (`funcionalidades.md`, seção "Tela Empresas (lista)"; `backlog_pos_mvp.md`, "Exportar a lista de Empresas") e a **exportação da base inteira por empresa** (`lgpd.md`, seção 9: "Exportação de dados por tenant"; `backlog_pos_mvp.md`, "Exportação de dados por empresa (LGPD)").*

## 1. Objetivo

1. **Exportar a lista de Empresas.** Na lista, marcar o cabeçalho da tabela já mostra a barra de ações em massa, mas só com as linhas da página. A barra ganha:
   - o atalho **"Selecionar todas as N empresas com estes filtros"**, que passa a valer para todas as linhas do banco que a pessoa vê com a busca e os filtros atuais, e não só para a página;
   - o botão **Exportar**, com **Excel (.xlsx)** e **CSV**.
2. **Exportar a base inteira.** Em *Configurações → Exportar dados*, o administrador gera um arquivo com **todos os dados da empresa** (empresas, contatos, atividades, oportunidades, chamados, rotas, cadastros etc.), em Excel ou CSV, para backup próprio, para análise fora do sistema, para a portabilidade da LGPD ou para a saída do cliente.

## 2. O que já existe e se reaproveita

| Peça | Onde está | Uso aqui |
|---|---|---|
| Barra de ações em massa (N selecionadas, Aplicar tag, Levar para offline, Adicionar à rota, Limpar seleção) | `apps/web/src/telas/empresas/acoes-em-massa.tsx` | Recebe o modo "todas do filtro" e o botão Exportar |
| Seleção por página (`marcadas`, `chaveDaPagina`, `alternarTodas`, só as `editavel`) | `apps/web/src/telas/empresas/lista.tsx` | Ganha o modo `todasDoFiltro` (seção 4.1) |
| Filtros, busca e regra de carteira da lista (`condicoes`, `escopoDaCarteira`, `condicaoDeVisibilidade`) | `apps/api/src/carteira/lista.service.ts`, `regras-de-carteira.ts` | A exportação usa **a mesma função** de filtro, para sair exatamente o que a lista mostra |
| `consultaDaListaSchema` (Zod) | `packages/shared` | A exportação recebe a mesma consulta, sem `pagina`/`porPagina` |
| CSV seguro para o Excel (`;`, UTF-8 com BOM, `celulaDeCsv` contra fórmula) | `apps/api/src/importacao/relatorio.service.ts`, usado por `chamados/metricas.service.ts` | Mesmo padrão em todos os CSVs |
| `exceljs` (já é dependência da API, usado na leitura da importação) | `apps/api/package.json` | Escrita do .xlsx em *streaming* (`stream.xlsx.WorkbookWriter`) |
| Filas BullMQ e worker | `apps/api/src/worker/filas.ts`, `processadores.ts` | Nova fila `exportacao` |
| Garage (S3) com URL assinada | `apps/api/src/infra/s3.ts`; padrão de `importacao/lotes.service.ts` e `chamados/anexos.service.ts` | O arquivo gerado fica no Garage e o download sai por URL assinada |
| Central de notificações | `apps/api/src/notificacoes` | "Sua exportação está pronta" |
| Auditoria | `apps/api/src/auditoria` | Toda exportação fica registrada |
| Limite de requisições | `apps/api/src/rate-limit` (`@Limite`) | Nas rotas novas |
| Catálogo de permissões versionado | `packages/shared/src/permissoes.ts` (`VERSAO_DO_CATALOGO = 11`, `NOVAS_POR_VERSAO`) | Versão 12 com as chaves novas |
| Manutenção agendada | `apps/api/src/worker/manutencao.ts` | Apaga os arquivos vencidos |

## 3. Decisões para o Ale aprovar

1. **Formato "XLS".** Gerar **.xlsx** (Excel 2007 em diante; abre no Excel, no LibreOffice e no Google Planilhas). O .xls antigo tem limite de 65.536 linhas e não tem biblioteca boa para Node. *Recomendado: .xlsx.*
2. **Quem pode exportar.** Duas chaves novas:
   - `empresas.exportar` ("Exportar a lista de empresas"): **Administrador e Gestor** por padrão; o Vendedor não (é a porta mais fácil para um vendedor levar a carteira ao sair). O admin liga para quem quiser em *Perfis*.
   - `dados.exportar_tudo` ("Exportar todos os dados da empresa"): **só o Administrador**.
   *Recomendado: assim.*
3. **O que a exportação da lista leva.** Sempre o que a pessoa **vê** pela regra de carteira (alcance própria, equipe ou todas), mesmo as empresas que ela não edita. *Recomendado: sim.* (Hoje a caixinha só aparece nas que ela edita, porque a única ação era Aplicar tag; ver 4.1.)
4. **Ações com "todas do filtro" marcadas.** Nesse modo só o **Exportar** funciona; *Aplicar tag*, *Levar para offline* e *Adicionar à rota* ficam desabilitados com a dica "Disponível para até 200 empresas: selecione na página". Levar o Aplicar tag para o filtro inteiro é outro trabalho (job, desfazer, auditoria em lote) e fica para depois. *Recomendado: assim.*
5. **Colunas da lista exportada.** Um **conjunto fixo e completo** (seção 4.4), não só as colunas visíveis na tela. Escolher as colunas fica para depois. *Recomendado: fixo.*
6. **Limites.** Lista: até **100.000 linhas** por exportação. Base inteira: sem limite de linhas (cada aba do .xlsx vai até 1.048.576 linhas; acima disso a tabela continua numa segunda aba). *Recomendado: assim.*
7. **Síncrono ou em segundo plano.** As duas exportações rodam **no worker** e o arquivo fica no Garage. Na lista, até 5.000 linhas a tela espera com um progresso e baixa sozinha; acima disso, ou se a pessoa fechar o aviso, chega a notificação "Sua exportação está pronta". Uma única infraestrutura, sem pedido HTTP longo travando a API. *Recomendado: assim.*
8. **Base inteira: o que entra** (seção 5.2). *Recomendado:* todas as tabelas de negócio do tenant; **fora** os segredos (senhas, sessões, chaves de API, segredos de webhook, códigos 2FA), as **filas internas** (outbox, jobs) e os **arquivos anexos** (vão só como lista: nome, tamanho, data; baixar os arquivos em lote fica para depois). **Excluídos** (soft delete) e **auditoria** entram só se a pessoa marcar as opções.
9. **Segurança da base inteira.** Pedir **a senha de novo** (e o 2FA, se a pessoa usa) antes de gerar; **avisar todos os administradores** por notificação e e-mail que uma exportação completa foi feita; **uma por vez** por empresa e no máximo **3 por dia**. *Recomendado: assim.*
10. **Validade do arquivo.** Fica **7 dias** no Garage e depois é apagado; cada download gera uma URL assinada de 15 minutos e fica na auditoria. *Recomendado: 7 dias.*

## 4. Parte A: exportar a lista de Empresas

### 4.1 Seleção "todas do filtro" (web)

- Estado da seleção em `lista.tsx` passa a ser:
  ```ts
  type Selecao =
    | { modo: 'pagina'; chave: string; ids: ReadonlySet<string> }
    | { modo: 'todasDoFiltro'; chave: string } // chave = JSON da busca SEM a página
  ```
  A seleção por página continua zerando ao mudar de página, busca ou filtro. A "todas do filtro" **sobrevive à troca de página** (a chave não inclui a página) e zera ao mudar busca ou filtro.
- As caixinhas passam a aparecer em **todas as linhas visíveis** (não só nas `editavel`). Aplicar tag continua mandando os ids e a API continua ignorando as que a pessoa não edita (o aviso "N não foram alteradas" já existe). Com a decisão 3 recusada, a caixinha continua só nas editáveis e a exportação do modo página leva só as marcadas.
- Comportamento (como no Gmail):
  1. Marcou a caixinha do cabeçalho → todas da página marcadas; a barra mostra **"25 selecionadas"** e, ao lado, quando `total > linhas da página`, o link **"Selecionar todas as 1.234 empresas com estes filtros"** (sem filtro e no chip *Todas*: "…todas as 1.234 empresas da carteira").
  2. Clicou no link → a barra mostra **"Todas as 1.234 empresas selecionadas"** e **"Selecionar só esta página"**; todas as caixinhas da tela aparecem marcadas, também nas outras páginas.
  3. Desmarcar uma linha no modo "todas" volta para o modo página com as da página menos aquela (não guardamos exceções numa lista de milhares; fica simples e previsível).
  4. *Limpar seleção* zera tudo.
- **Celular** continua sem seleção em massa. Se o Ale quiser exportar no celular, um item **Exportar** no menu do topo da lista exporta o filtro atual (opcional, fase A3).

### 4.2 Botão Exportar (web)

- Na barra, depois de *Adicionar à rota*: **Exportar ▾** (`Menu` do `@leadtogo/ui`) com **Excel (.xlsx)** e **CSV**. Só aparece com `empresas.exportar` (`pode('empresas.exportar')`).
- Ao escolher: `POST` da exportação (4.3) e um diálogo **"Preparando a exportação… 1.234 empresas"** com barra de progresso (consulta a situação a cada 2 s). Pronto → baixa sozinho e mostra o toast "Exportação concluída". Botão **"Avisar quando terminar"** fecha o diálogo; a notificação chega com o link.
- Erros: 403 sem permissão, 409 `exportacao_em_andamento` (a pessoa já tem uma na fila: "Aguarde a anterior terminar"), 422 `exportacao_grande_demais` (passou de 100.000: "Refine os filtros"), 429.
- Nova tela **`/exportacoes`** (link no menu do avatar e na notificação): as exportações da pessoa nos últimos 7 dias, com situação, formato, linhas, tamanho, **Baixar** e o filtro usado. O admin vê as de todos.

### 4.3 API

| Rota | Permissão | O que faz |
|---|---|---|
| `POST /v1/carteira/empresas/exportar` | `empresas.exportar` | Corpo: `{ formato: 'xlsx' \| 'csv', selecao: { tipo: 'ids', ids: uuid[] (1..200) } \| { tipo: 'filtro', consulta: ConsultaDaLista sem paginação } }`. Conta as linhas com a mesma condição da lista, recusa acima do limite, grava a linha em `exportacoes` e enfileira o job. 202 com `{ id, situacao, linhas }`. `@Limite` 10/min. |
| `GET /v1/exportacoes` | qualquer autenticado | As da pessoa (o admin, com `?todas=true`, as de todos). |
| `GET /v1/exportacoes/:id` | dono ou admin | Situação, progresso, linhas, tamanho, erro. |
| `POST /v1/exportacoes/:id/download` | dono ou admin, e a permissão de origem ainda ativa | Gera a URL assinada (15 min) e registra o download na auditoria. 410 `exportacao_expirada`. |
| `DELETE /v1/exportacoes/:id` | dono ou admin | Cancela a pendente ou apaga o arquivo. |

- **Refatoração necessária:** tirar `condicoes(escopo, consulta)` e `ordem(consulta)` de dentro do `ListaDeEmpresasService` para funções exportadas (`condicaoDaListaDeEmpresas`), usadas pela lista e pela exportação. Teste garante que a lista e a exportação devolvem **os mesmos ids** para várias consultas.
- O **escopo da carteira é calculado no job** com o membro que pediu (não confia em nada guardado do front): se o alcance dele diminuiu entre o pedido e a execução, sai o novo alcance.
- Zod em `packages/shared/src/exportacao.ts` (`criarExportacaoDeEmpresasSchema`, `exportacaoSchema`, enums de formato e situação). `pnpm` gera o `api-client` do OpenAPI como hoje.

### 4.4 Colunas da lista exportada

Na ordem: Nome fantasia · Razão social · Tipo de documento · CNPJ/CPF (com máscara, **como texto**) · Matriz/Filial · Situação na Receita · Data da consulta à Receita · Porte · Regime tributário · Natureza jurídica · CNAE principal (código e descrição) · **uma coluna por grupo de tags** (Status, Visitação, Interesse… na ordem de *Configurações → Tags*; várias tags do mesmo grupo separadas por vírgula) · Vertical · Vendedor · Telefone principal · Outros telefones · E-mail da empresa · Website · Logradouro · Número · Complemento · Bairro · Cidade · UF · CEP · Latitude · Longitude · Última visita · Último contato · Próxima atividade · Oportunidades abertas (quantidade) · Em aberto (R$) · Contatos (quantidade) · Cadastrada em · Atualizada em · ID (uuid, para reimportar ou cruzar).

- **XLSX:** cabeçalho em negrito e congelado, **autofiltro**, largura das colunas ajustada, datas como data de verdade (formato `dd/mm/aaaa hh:mm` no fuso da empresa), dinheiro como número com formato `R$ #.##0,00`, documento e CEP como texto (não perde zero à esquerda), aba "Empresas" e uma aba "Sobre" com quem exportou, quando, o filtro em português e o total.
- **CSV:** `;`, UTF-8 com BOM, `\r\n`, datas `dd/mm/aaaa hh:mm`, dinheiro `1234,56`, cada célula por `celulaDeCsv` (fórmula vira texto).
- Os nomes das colunas ficam num só lugar (`apps/api/src/exportacao/colunas/empresas.ts`), reaproveitado pela base inteira.

## 5. Parte B: exportar a base inteira

### 5.1 Tela

*Configurações → **Exportar dados*** (nova seção em `secoes-das-configuracoes.ts`, só com `dados.exportar_tudo`):

- Texto curto do que sai e do que não sai (5.2).
- **Formato:** *Excel (.xlsx), uma aba por tabela* ou *CSV, um .zip com um arquivo por tabela*. Para bases grandes a tela sugere o CSV (o Excel fica lento acima de algumas centenas de milhares de linhas).
- Opções: **Incluir registros excluídos** (desligada), **Incluir a auditoria** (desligada; com período de até 12 meses).
- Botão **Gerar exportação** → diálogo pedindo a **senha** (e o código 2FA, se a pessoa usa) → job.
- Lista das exportações completas dos últimos 7 dias, com quem pediu, situação, tamanho e **Baixar**.

### 5.2 Conteúdo

Um arquivo por entidade, com **os ids e também os nomes resolvidos** (vendedor, empresa, funil, fase, tipo), para servir no Excel e para reimportar:

| Arquivo / aba | Origem |
|---|---|
| `empresas` | mesmas colunas da 4.4 |
| `empresas_telefones`, `empresas_cnaes`, `empresas_socios`, `empresas_tags` | tabelas filhas da empresa |
| `contatos`, `contatos_telefones`, `contatos_emails`, `contatos_vinculos`, `contatos_tags` | contatos e vínculos com empresas (papel na decisão, "não quer contato") |
| `atividades` | com tipo, responsável, empresa, contato, situação, resultado |
| `oportunidades`, `oportunidades_historico_fases`, `oportunidades_tags` | com funil, fase, valores, motivo, origem, solução |
| `chamados`, `chamados_mensagens`, `chamados_anexos` (só a lista) | as notas internas entram, marcadas como internas |
| `visitas` (check-ins), `rotas`, `rotas_paradas` | com coordenadas |
| `importacao_lotes` | nome, tipo, quem, quando, totais |
| `membros` | nome, e-mail, perfil, situação, entrada (sem nada de autenticação) |
| `perfis_de_acesso` | nome e permissões |
| Cadastros: `tags`, `tag_grupos`, `funis`, `fases`, `tipos_de_atividade`, `origens`, `motivos`, `verticais`, `solucoes`, `papeis_na_decisao`, `areas_de_chamado`, `regioes` | configurações da empresa |
| Portal: `portal_acessos` (contato, situação, datas), `portal_publicacoes`, `portal_documentos` (lista), `portal_eventos` | se o portal estiver ligado |
| `auditoria` | só com a opção marcada |
| `LEIA-ME` (aba ou `.txt`) | quem exportou, quando, opções, e o **dicionário**: cada arquivo, cada coluna e o que significa |

Fora: `auth.*` (senhas, sessões, contas OAuth, 2FA), chaves de API e segredos de webhook (só o nome e a data), outbox, jobs, caches da Receita e do IBGE, tabelas de referência públicas (municípios, CNAEs, setores), os **arquivos** dos anexos.

A lista exata sai de um registro único (`apps/api/src/exportacao/base-completa/tabelas.ts`) com, para cada tabela, a consulta e as colunas. **Teste de cobertura:** todo `pgTable` de `packages/db/src/schema` com `tenant_id` precisa estar no registro **ou** na lista de excluídas com o motivo. Assim, tabela nova sem decisão quebra o CI e ninguém esquece de incluí-la.

### 5.3 Execução

- Job na fila `exportacao` (concorrência 1; `lockDuration` longo e progresso salvo a cada lote).
- Roda **dentro do tenant** (mesma transação com `app.tenant_id` que as outras rotinas do worker), então o **RLS** garante que só sai o que é da empresa.
- Lê cada tabela **por cursor/keyset** em lotes de 2.000 (`WHERE id > $ultimo ORDER BY id LIMIT 2000`; uuid v7 ordena pela criação), sem carregar tudo na memória.
- Escreve em **streaming**: `exceljs` `WorkbookWriter` para o .xlsx; para o CSV, cada tabela num stream dentro do `.zip` (`archiver`); o resultado vai direto para o Garage com `@aws-sdk/lib-storage` (`Upload` multiparte). Memória constante, qualquer tamanho.
- Atualiza `exportacoes.progresso` (tabela atual e linhas) para a tela.
- Fim: grava tamanho, `concluida_em`, `expira_em = +7 dias`; notifica quem pediu e, na base inteira, todos os administradores (e-mail também). Falha: `situacao = falhou`, erro legível, notificação; o objeto parcial é apagado.

## 6. Banco

Nova tabela **`exportacoes`** (migração só de expansão):

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid v7 | PK |
| `tenant_id` | uuid NOT NULL | RLS habilitado e forçado |
| `tipo` | enum `tipo_exportacao` (`lista_empresas`, `base_completa`) | `lista_contatos`, `lista_oportunidades`, `lista_atividades` entram depois (expansão do enum) |
| `formato` | enum `formato_exportacao` (`xlsx`, `csv`) | |
| `parametros` | jsonb | filtro da lista, ids, opções (excluídos, auditoria e período) |
| `situacao` | enum `situacao_exportacao` (`pendente`, `processando`, `concluida`, `falhou`, `cancelada`, `expirada`) | |
| `linhas_previstas`, `linhas_exportadas` | integer | |
| `progresso` | jsonb | tabela atual, linhas |
| `objeto_chave` | varchar | chave no Garage (`exportacoes/{tenant}/{id}/{nome}`), nula até concluir e depois de expirar |
| `nome_arquivo` | varchar | `empresas-2026-11-01-1432.xlsx`, `leadtogo-dados-2026-11-01.zip` |
| `tamanho_bytes` | bigint | |
| `erro` | text | |
| `iniciada_em`, `concluida_em`, `expira_em` | timestamptz | |
| `criado_em`, `atualizado_em`, `criado_por`, `atualizado_por`, `excluido_em` | padrão | |

- Índices: `(tenant_id, criado_por, criado_em desc)`; índice parcial único `(tenant_id, criado_por) WHERE situacao IN ('pendente','processando')` (uma por pessoa na lista); para a base inteira, único `(tenant_id) WHERE tipo = 'base_completa' AND situacao IN (...)`.
- Catálogo de permissões **v12**: `empresas.exportar` e `dados.exportar_tudo` em `NOVAS_POR_VERSAO[12]`; os padrões do Administrador e do Gestor como na decisão 2. Novo módulo `dados` em `ROTULO_DO_MODULO` ("Dados").
- `modelagem_banco.md` ganha a tabela, os enums e o catálogo v12.

## 7. Segurança e LGPD

- **Permissão** checada no pedido **e de novo no job e no download** (perdeu a permissão, não baixa mais).
- **Regra de carteira** na lista (o vendedor com `empresas.exportar` só exporta o que vê) e **RLS** em tudo.
- **Auditoria** de cada pedido (filtro em português, total, formato) e de cada download (IP, quem).
- **Reautenticação** (senha e 2FA) na base inteira; aviso a todos os admins.
- **CSV injection**: `celulaDeCsv` em todo CSV; no .xlsx, valores começando com `=`, `+`, `-`, `@` gravados como texto, nunca como fórmula.
- Bucket **privado**, chave com o uuid da exportação, URL assinada curta, apagado aos 7 dias (`manutencao`: `situacao = expirada`, `objeto_chave = null`).
- `lgpd.md`: marcar "Exportação de dados por tenant" como feita, descrever o que sai, a retenção de 7 dias e o registro na auditoria; a portabilidade e o acesso passam a apontar para essa função.
- Sem variável de ambiente nova (usa o bucket e a fila que já existem). Se for preciso um bucket separado, entra `S3_BUCKET_EXPORTACOES` no `.env.example` e o Ale cadastra no Coolify.

## 8. Fases e commits

Cada fase vai para a `main` com `pnpm lint && pnpm typecheck && pnpm test` verde.

**F1. Infraestrutura (sem tela)**
1. `feat(db): tabela de exportações com RLS` (migração, schema Drizzle, teste de isolamento: o tenant A não lê nem grava as exportações do B).
2. `feat(shared): permissões de exportação (catálogo v12) e esquemas Zod`.
3. `feat(api): gravadores de CSV e XLSX em streaming` (testes: BOM, `;`, fórmula vira texto, datas no fuso, dinheiro, documento como texto, quebra de aba acima do limite).
4. `feat(api): fila de exportação, upload para o Garage e download por URL assinada` (+ retenção na `manutencao`, notificação, rotas `/v1/exportacoes`).

**F2. Lista de Empresas**
5. `refactor(api): condição da lista de empresas compartilhada` (teste: lista e exportação com os mesmos ids).
6. `feat(api): exportar a lista de empresas` (testes: filtro, ids, regra de carteira do vendedor/equipe/todas, 403 sem permissão, 409 em andamento, limite, auditoria).
7. `feat(web): selecionar todas as empresas do filtro na barra de ações em massa` (testes de componente: link aparece só com `total > página`, sobrevive à troca de página, zera ao filtrar, ações desabilitadas no modo "todas").
8. `feat(web): exportar empresas em Excel ou CSV` (menu, diálogo de progresso, download, tela `/exportacoes`).
9. `docs: exportação da lista de empresas` (`funcionalidades.md`, `escopo_mvp.md`, `backlog_pos_mvp.md`, `roteiro_teste_exportacao.md`).

**F3. Base inteira**
10. `feat(api): registro das tabelas da exportação completa` (+ teste de cobertura do schema).
11. `feat(api): exportação completa da empresa` (reautenticação, uma por vez, 3 por dia, aviso aos admins, zip de CSVs e xlsx com abas, LEIA-ME).
12. `feat(web): Configurações → Exportar dados`.
13. `docs: exportação completa e LGPD` (`lgpd.md`, `funcionalidades.md`, `modelagem_banco.md`, `runbook.md`: como acompanhar e reprocessar).

**F4. Depois (fora deste plano, já preparado)**
- Exportar as listas de **Contatos, Oportunidades e Atividades** (mesmo motor; elas ainda não têm seleção em massa, então começam com o botão Exportar no topo exportando o filtro atual).
- Levar o **CSV dos chamados** (`/v1/chamados/exportar.csv`, hoje síncrono e com 10.000 linhas) para o mesmo motor.
- Escolher as colunas; Aplicar tag e Trocar vendedor no modo "todas do filtro"; baixar os anexos em lote; exportação agendada (ex.: backup semanal por e-mail).

## 9. Testes

- **API (Vitest + banco real):** isolamento por tenant da tabela e do **conteúdo** exportado (dados do tenant B nunca aparecem no arquivo do A); regra de carteira (vendedor com alcance própria só exporta as dele); permissão no pedido, no job e no download; limite de linhas; uma por vez; expiração; o arquivo gerado é lido de volta com `exceljs` e com um parser de CSV e as colunas e valores conferem.
- **Cobertura do schema:** toda tabela com `tenant_id` está no registro da base inteira ou na lista de excluídas.
- **Web (Testing Library):** fluxo da seleção "todas do filtro", menu Exportar só com permissão, diálogo de progresso, erros.
- **E2E (Playwright):** filtrar → selecionar todas → exportar CSV → arquivo baixado com o total certo; admin gera a base inteira e baixa.
- **Carga:** 100.000 empresas na lista e uma base de 500.000 linhas no total, medindo tempo e memória do worker (registro em `docs/`, como `teste_carga_mapa.md`).
- **Roteiro manual:** `roteiro_teste_exportacao.md` (abrir o .xlsx no Excel e no LibreOffice, o CSV no Excel com acentos, conferir que fórmula não executa).

## 10. Riscos

| Risco | Mitigação |
|---|---|
| Exportação grande pesa na VPS (CPU curta, como na geocodificação) | Fila com concorrência 1, leitura em lotes, streaming; limite de 3 completas por dia |
| Vendedor levar a carteira | `empresas.exportar` desligada para o Vendedor por padrão; auditoria de pedido e download |
| Lista e exportação divergirem | Mesma função de condição + teste que compara os ids |
| Tabela nova esquecida na base inteira | Teste de cobertura do schema |
| Arquivo esquecido no Garage | Expira em 7 dias pela `manutencao` |
| Excel abrir CSV com acento errado ou número como data | UTF-8 com BOM, `;`, documento como texto; o .xlsx é o formato recomendado na tela |

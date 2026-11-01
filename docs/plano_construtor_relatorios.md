# Plano do construtor de relatórios

*Proposta de 01/11/2026, **aprovada pelo Ale em 01/11/2026** (as decisões da seção 3 como recomendado e as telas do Claude Design em `docs/prototipo-relatorios/`). **A implementação só começa por ordem do Ale.** Entrega o item "relatórios avançados" da linha **Futuro** de `funcionalidades.md` (seção de fases) e absorve as exportações que ficaram no `backlog_pos_mvp.md` (lista de Empresas, lista de Oportunidades, relatório da importação em Excel, Dashboard). Nada aqui está implementado. Na implementação, `funcionalidades.md`, `modelagem_banco.md` e `escopo_mvp.md` são atualizados nos commits de cada fase.*

## 1. Objetivo

1. **Montar relatórios de forma visual**, sem SQL, cruzando dados das tabelas do CRM: escolher o que se quer ver (ex.: Empresas), juntar o que se relaciona (contatos, oportunidades, atividades, visitas, tags…), escolher colunas, filtrar, agrupar, totalizar e ordenar, com **prévia na hora**.
2. **Exportar para Excel** (`.xlsx`), com tipos certos nas células (número, moeda, data), cabeçalho, filtros e totais, pronto para abrir no Excel e no LibreOffice.
3. **Guardar e compartilhar** relatórios, para reabrir e reexportar com os dados do dia.

**Princípio que rege tudo:** o construtor **não** expõe as tabelas do banco. Ele expõe um **catálogo de dados** (camada semântica) definido no código: fontes com nome de negócio ("Empresas", "Oportunidades"), campos com rótulo, tipo e formato, e **só as ligações que existem de verdade** entre elas. A pessoa vê o que já vê nas telas, com as mesmas regras de carteira e permissão; nunca uma coluna técnica (`tenant_id`, `criado_por` cru, hashes, tokens) nem uma tabela de sistema.

## 2. O que se reaproveita

| Peça | Onde está | Uso aqui |
|---|---|---|
| Transação por requisição com `app.tenant_id` (RLS forçado) | `apps/api/src/acesso/tenant.interceptor.ts` | Toda consulta do relatório roda dentro dela: o RLS é a primeira barreira |
| Regra de carteira por tipo | `escopoDaCarteira` e as condições de visibilidade (`lista.service.ts`, `regras-de-contato.ts`, `lista-oportunidades.service.ts`, `lista-atividades.service.ts`) | **Cada fonte** do relatório aplica a **sua** condição, inclusive as que entram por junção |
| Catálogo de permissões versionado (v11) | `packages/shared/src/permissoes.ts` | Ganha `relatorios.*` (seção 3, decisão 9) na versão 12 |
| `exceljs` (já dependência da API; leitura da importação) | `apps/api/src/importacao/planilha.ts` | Escrita em *streaming* (`stream.xlsx.WorkbookWriter`) |
| Proteção contra fórmula no CSV (`=`, `+`, `-`, `@`) | importação (`problemas.csv`) e chamados (`metricas.service.ts`) | Mesma regra para células de texto do `.xlsx` |
| Worker BullMQ (mesma imagem da API) | `apps/api/src/worker.ts`, `worker.module.ts` | Exportações grandes em segundo plano |
| Garage (S3) com limites explícitos | `apps/api/src/infra/s3.ts` | Guarda o `.xlsx` gerado; download por URL assinada curta |
| Gráficos interativos do Dashboard (Recharts) | `apps/web` (Módulo 7) e `design_system.md`, "Gráficos" | Gráfico opcional do relatório (fase R4) |
| `@leadtogo/ui` (`TextField`, `Button`, `Tag`, `Alert`, `EmptyState`…) e `@dnd-kit` | `packages/ui`, `apps/web` | Telas do construtor; arrastar colunas para reordenar |
| Avisos e central de notificações | `apps/api/src/notificacoes` | "Sua exportação está pronta" |
| Auditoria | `apps/api/src/auditoria` | Registro de cada exportação (LGPD) |
| Teste "toda rota declara decisão" | `rotas-com-decisao.test.ts` | As rotas novas declaram `@Permissao` |

## 3. Decisões (aprovadas pelo Ale em 01/11/2026)

1. **Catálogo de dados no código, não tabelas cruas.** Fontes e ligações declaradas em `packages/shared/src/relatorios/catalogo.ts` (Zod), revisadas a cada fase. *Recomendado.* (A alternativa, ler o `information_schema`, exporia colunas técnicas e furaria a regra de carteira.)
2. **Fontes da primeira entrega (R1):** Empresas, Contatos, Oportunidades e Atividades, com os cadastros que dão nome a elas (tags, vendedor, funil e fase, origem, motivo de perda, tipo de atividade, município/UF, CNAE principal, vertical). **Depois:** Visitas (com as respostas por campo dos modelos), Rotas e paradas, Chamados, histórico de tags (conversão Lead → Cliente) e histórico de fases.
3. **Uma fonte principal por relatório**, mais as **ligadas** a ela, escolhidas numa árvore ("Empresa → Oportunidades → Fase"). A fonte principal define **o que é uma linha**. Ligação "um para muitos" (Empresa → Oportunidades) tem duas formas, que a tela explica com um exemplo:
   - **Totalizar** (padrão): uma linha por empresa, com "Quantidade de oportunidades", "Soma do valor total", "Data da última atividade" etc.
   - **Detalhar**: uma linha por empresa **e** oportunidade (a empresa se repete). Só **uma** ligação detalhada por relatório, para não multiplicar linhas sem querer.
4. **Agrupar e totalizar**: até **3 níveis** de agrupamento (ex.: Vendedor → Status → Mês da criação), com contagem, soma, média, mínimo e máximo por campo numérico ou moeda, e "contar distintos". Datas agrupam por dia, semana, mês, trimestre ou ano, **no fuso da empresa**.
5. **Filtros** por qualquer campo do catálogo, com operadores pelo tipo (texto: contém, começa com, é, está vazio; número e moeda: =, ≠, >, <, entre; data: períodos relativos como "mês atual", "últimos N dias", "trimestre anterior", e intervalo fixo; listas e tags: é um de, não é nenhum de; sim/não). Filtros combinados por **E**, com um nível de grupo **OU**. Filtros podem ser marcados como **perguntados ao abrir** (ex.: "Período", "Vendedor"), para o mesmo relatório servir a meses diferentes.
6. **Prévia na tela:** até **500 linhas** (ou 200 grupos), com o total de linhas que a exportação teria. **Exportação `.xlsx`:** até **100.000 linhas**; até 5.000 sai na hora (download direto), acima disso vai para o worker e avisa quando estiver pronta. O arquivo fica no Garage por **24 horas** (o protótipo diz 7 dias; vale este plano).
7. **Formato do arquivo:** `.xlsx` (o "XLS" moderno; o `.xls` binário de 1997 está obsoleto e limita a 65 mil linhas). Planilha 1 com os dados (cabeçalho congelado, filtro automático, larguras ajustadas, moeda `R$ #.##0,00`, datas como data de verdade no fuso da empresa, linha de totais quando houver); planilha 2 **"Sobre"** com nome do relatório, quem gerou, quando, filtros aplicados e a observação "dados conforme a carteira de quem gerou". Com agrupamento, uma planilha resumida por grupo e, opcionalmente, a planilha de detalhe. **CSV** (`;`, UTF-8 com BOM) como alternativa no mesmo botão.
8. **Relatórios salvos e compartilhamento:** cada relatório tem dono e é **Privado** (padrão), **Equipe** (todos os membros da empresa veem e executam) ou **por perfil de acesso**. Quem abre um relatório compartilhado **vê só os dados da própria carteira**: compartilha-se a **definição**, nunca os dados. Só o dono (ou quem tem `relatorios.gerir`) edita; os outros podem "Duplicar".
9. **Permissões novas (catálogo v12):** `relatorios.ver` (abrir e executar relatórios compartilhados), `relatorios.criar` (montar e salvar os seus), `relatorios.exportar` (baixar `.xlsx`/CSV) e `relatorios.gerir` (editar e excluir os de todos, compartilhar com a equipe). Padrões: **Admin** todas; **Gestor** todas; **Vendedor** `ver`, `criar` e `exportar`. Os dados continuam limitados pelo alcance de `empresas.ver`, `contatos.ver`, `oportunidades.ver`, `atividades.ver` etc.; quem não vê uma fonte não a encontra no construtor. Campos sensíveis exigem a permissão própria (posição do check-in: `visitas.ver_localizacao`). **Não** entra nas permissões de chave de API nesta fase.
10. **Relatórios prontos de fábrica** (somente leitura, duplicáveis): "Carteira por vendedor e status", "Empresas sem contato há 60 dias", "Oportunidades ganhas no mês com MRR", "Funil por fase", "Motivos de perda no trimestre", "Atividades realizadas por vendedor e tipo", "Novos leads por origem". Servem de exemplo e de atalho.
11. **Fora desta proposta** (vão para `backlog_pos_mvp.md`): envio agendado por e-mail (ex.: toda segunda às 8h), SQL livre, fórmulas calculadas pela pessoa, junção entre relatórios, tabela dinâmica com colunas variáveis (pivô), relatório no portal do cliente, exportação em PDF e edição dos dados pela grade do relatório.

## 4. Catálogo de dados (camada semântica)

### 4.1 Forma

```ts
// packages/shared/src/relatorios/catalogo.ts (esboço)
type TipoDeCampo = 'texto' | 'numero' | 'moeda' | 'percentual' | 'data' | 'data_hora' | 'sim_nao' | 'lista' | 'tags'

interface CampoDoCatalogo {
  chave: string            // estável: 'empresa.cidade', 'oportunidade.valor_total'
  rotulo: string           // 'Cidade', 'Valor total'
  tipo: TipoDeCampo
  agregacoes?: Agregacao[] // as que fazem sentido para o tipo
  opcoes?: 'tags_status' | 'membros' | 'fases' | ...  // de onde vêm os valores do filtro
  permissao?: string       // exigência extra (ex.: 'visitas.ver_localizacao')
}

interface LigacaoDoCatalogo {
  para: ChaveDeFonte       // 'oportunidades'
  rotulo: string           // 'Oportunidades da empresa'
  cardinalidade: 'um' | 'muitos'
}

interface FonteDoCatalogo {
  chave: ChaveDeFonte      // 'empresas'
  rotulo: string           // 'Empresas'
  permissaoDeLeitura: string  // 'empresas.ver'
  campos: CampoDoCatalogo[]
  ligacoes: LigacaoDoCatalogo[]
}
```

O **lado SQL** de cada campo e ligação (expressão Drizzle, junção, condição de carteira) vive **só na API** (`apps/api/src/relatorios/catalogo-sql.ts`), indexado pelas mesmas chaves. Um teste garante que cada chave do catálogo compartilhado tem a sua expressão na API e vice-versa.

### 4.2 Fontes e ligações da R1

| Fonte | Campos principais | Ligações |
|---|---|---|
| **Empresas** | nome fantasia, razão social, CNPJ, situação na Receita, matriz/filial, porte, CNAE principal (código e descrição), vertical, faixa de funcionários e de faturamento, município, UF, bairro, vendedor, Status e demais tags (uma coluna por grupo), última visita, último contato, próxima atividade, criada em, origem (importação/prospecção/manual) | Contatos (muitos), Oportunidades (muitos), Atividades (muitos), Matriz (um), Vendedor (um) |
| **Contatos** | nome, cargo, e-mails, telefones, aniversário, papel na decisão, tags do contato, "não quer contato" | Empresas vinculadas (muitos, vínculo ativo) |
| **Oportunidades** | título, funil, fase, status, valor único, mensal, meses, total, ponderado, probabilidade, previsão de fechamento, data de fechamento, origem, motivo de perda, tags, criada em, dias na fase | Empresa (um), Atividades (muitos) |
| **Atividades** | tipo, título, situação, data e hora, dia inteiro, resultado, responsável, origem, realizada em, conta como visita | Empresa (um), Contato (um), Oportunidade (um) |
| **Membros** (só como ligação "Vendedor"/"Responsável") | nome, e-mail, perfil, ativo | — |

Campos de texto livre longos (observações, descrição) entram como opção, desligados por padrão. Valores de tags aparecem pelo **nome que a empresa deu**; o histórico (nome antigo) fica para o relatório de histórico.

### 4.3 Regras de visibilidade por fonte

A consulta é montada a partir da fonte principal; **cada fonte que entra** (principal ou ligada) recebe:

1. o RLS (automático, pela transação);
2. `excluido_em IS NULL`;
3. a **condição de carteira da sua permissão de leitura**, com o alcance do perfil efetivo de quem executa (a mesma função usada pela lista daquela tela);
4. sem a permissão de leitura da fonte ligada, a ligação **não aparece** no construtor e, num relatório compartilhado que a usa, as colunas dela saem em branco com o aviso "Você não tem acesso a Oportunidades".

Assim, um vendedor que abre "Funil por fase" vê o funil **da carteira dele**; o gestor, o da equipe.

## 5. Definição do relatório (JSON validado por Zod)

```ts
// packages/shared/src/relatorios/definicao.ts (esboço)
const definicaoDeRelatorioSchema = z.object({
  versao: z.literal(1),
  fonte: chaveDeFonteSchema,
  ligacoes: z.array(z.object({ caminho: z.array(z.string()).max(3), modo: z.enum(['totalizar', 'detalhar']) })).max(6),
  colunas: z.array(z.object({
    campo: z.string(),                       // 'oportunidades.valor_total'
    agregacao: agregacaoSchema.optional(),   // obrigatória se o campo vem de ligação "totalizar"
    rotulo: z.string().max(80).optional(),   // renomear a coluna
    agruparDataPor: z.enum(['dia', 'semana', 'mes', 'trimestre', 'ano']).optional(),
  })).min(1).max(60),
  agrupar: z.array(z.string()).max(3),
  filtros: grupoDeFiltrosSchema,            // E de condições, com um nível de OU
  ordenar: z.array(z.object({ coluna: z.number().int(), direcao: z.enum(['asc', 'desc']) })).max(3),
  perguntarAoAbrir: z.array(z.string()),    // ids de filtros
  grafico: graficoSchema.optional(),        // R4
})
```

A **mesma** validação roda na tela (feedback imediato) e na API (autoridade). Campos e ligações são **chaves do catálogo**, nunca nomes de tabela ou SQL.

## 6. Execução na API

### 6.1 Compilador

`apps/api/src/relatorios/compilador.ts` transforma a definição validada numa consulta do Drizzle:

- **Nenhum SQL concatenado**: identificadores vêm só do mapa `catalogo-sql.ts`; todo valor de filtro entra como parâmetro (`sql\`${valor}\``). Chave desconhecida = erro 400 `campo_invalido`.
- Ligação **totalizar**: subconsulta agregada (`LEFT JOIN LATERAL (SELECT count(*), sum(...) ... ) ON true`), com a condição de carteira **dentro** da subconsulta; não multiplica linhas.
- Ligação **detalhar**: `LEFT JOIN` com a condição de carteira na junção.
- Tags: uma coluna por grupo (`string_agg` dos nomes, ordenados); filtro "tem a tag" por `EXISTS`.
- Datas: `date_trunc` com `AT TIME ZONE` do fuso da empresa (`tenants`/configurações).
- Ordenação estável (acrescenta a PK da fonte principal) e paginação por *keyset* na prévia.

### 6.2 Limites e proteção do banco

- `SET LOCAL statement_timeout = '15s'` na prévia e `'120s'` no worker; `SET LOCAL transaction_read_only = on` (a execução nunca grava).
- Máximo de 60 colunas, 6 ligações, profundidade 3, 3 agrupamentos.
- Limite de requisições (`apps/api/src/rate-limit`) nas rotas de prévia e exportação; no máximo **2 exportações em andamento por pessoa** e fila do worker com concorrência 2.
- `EXPLAIN` dos relatórios de fábrica num banco com volume (seed de carga), registrado no PR; índices novos só se o `EXPLAIN` pedir (seção 7).

### 6.3 Rotas

| Rota | Permissão | O que faz |
|---|---|---|
| `GET /v1/relatorios/catalogo` | `relatorios.ver` | Fontes, campos e ligações **que a pessoa pode usar** (já filtrados por permissão) |
| `GET /v1/relatorios/opcoes/:campo?busca=` | `relatorios.ver` | Valores para filtros de lista (tags, vendedores, fases, municípios) |
| `POST /v1/relatorios/previa` | `relatorios.criar` (ou `ver` para um salvo) | Executa uma definição (salva ou não) e devolve até 500 linhas + total |
| `GET/POST/PATCH/DELETE /v1/relatorios` | `ver` / `criar` / dono ou `gerir` | Lista, cria, altera e exclui (soft delete) relatórios salvos |
| `POST /v1/relatorios/:id/duplicar` | `relatorios.criar` | Cópia privada |
| `POST /v1/relatorios/exportar` | `relatorios.exportar` | Até 5.000 linhas: devolve o arquivo; acima: cria a exportação e responde 202 com o id |
| `GET /v1/relatorios/exportacoes` e `/:id` | `relatorios.exportar` | Minhas exportações, situação e progresso |
| `POST /v1/relatorios/exportacoes/:id/tentar-de-novo` | `relatorios.exportar`, só o dono | Exportação com erro: cria uma nova com a mesma definição |
| `GET /v1/relatorios/exportacoes/:id/arquivo` | `relatorios.exportar`, só o dono | Redireciona para a URL assinada do Garage (5 min) |

Contratos no OpenAPI (`apps/api/openapi.json`) e no `packages/api-client` gerado.

### 6.4 Geração do `.xlsx`

`apps/api/src/relatorios/xlsx.ts`, com `exceljs` em *streaming* (memória constante, linha a linha a partir de um cursor do Postgres):

- tipos nativos: número e moeda como número (formato `R$ #,##0.00`, que o Excel mostra no idioma do usuário), percentual, data e data e hora como data (no fuso da empresa), sim/não como "Sim"/"Não";
- texto que começa com `=`, `+`, `-`, `@`, tab ou CR é gravado como texto (sem virar fórmula);
- cabeçalho em negrito, congelado, com filtro automático; larguras pelo conteúdo das primeiras 200 linhas;
- linha de totais quando o relatório tem somas;
- planilha **"Sobre"** (seção 3, decisão 7);
- nome do arquivo: `<nome-do-relatorio>-AAAA-MM-DD.xlsx`, sem acento nem espaço.

No worker, o arquivo vai para o Garage em `relatorios/<tenant_id>/<exportacao_id>.xlsx`, o progresso é gravado a cada 5.000 linhas e, ao terminar, sai o aviso "Exportação pronta". Uma rotina diária apaga os arquivos vencidos (24 h) e marca a exportação como `expirada`.

## 7. Modelo de dados (migração 0045, **só expansão**)

### `relatorios` 🏢

| Coluna | Tipo | Observação |
|---|---|---|
| id | uuid v7 PK | |
| tenant_id | uuid FK NOT NULL | RLS habilitado e forçado |
| nome | varchar(120) NOT NULL | único por tenant entre os não excluídos (índice parcial) |
| descricao | varchar(500) | |
| definicao | jsonb NOT NULL | validada por `definicaoDeRelatorioSchema`; `versao` dentro do JSON |
| visibilidade | enum `visibilidade_relatorio` (`privado` · `equipe` · `perfis`) NOT NULL default `privado` | |
| perfis_ids | uuid[] | só com `perfis` |
| dono_id | uuid FK NOT NULL → `membros` | |
| fabrica_chave | varchar(60) | relatórios de fábrica (somente leitura); único por tenant |
| ultima_execucao_em | timestamptz | para ordenar "usados recentemente" |
| criado_em, atualizado_em, criado_por, atualizado_por, excluido_em | padrão | |

### `relatorio_exportacoes` 🏢

| Coluna | Tipo | Observação |
|---|---|---|
| id | uuid v7 PK | |
| tenant_id | uuid FK NOT NULL | RLS |
| relatorio_id | uuid FK → `relatorios` (nulo se exportou sem salvar) | |
| definicao | jsonb NOT NULL | retrato do que foi exportado (com os filtros respondidos) |
| formato | enum (`xlsx` · `csv`) | |
| situacao | enum `situacao_exportacao` (`na_fila` · `gerando` · `pronta` · `erro` · `expirada`) | |
| linhas_total, linhas_feitas | int | progresso |
| arquivo_chave | varchar(300) | chave no Garage |
| tamanho_bytes | bigint | |
| erro | varchar(500) | mensagem em português, sem dado pessoal |
| solicitada_por | uuid FK NOT NULL → `membros` | só ela baixa |
| solicitada_em, concluida_em, expira_em | timestamptz | |
| criado_em, atualizado_em, criado_por, atualizado_por, excluido_em | padrão | |

Índices: `relatorios (tenant_id, dono_id) WHERE excluido_em IS NULL`; `relatorio_exportacoes (tenant_id, solicitada_por, solicitada_em desc)`; `relatorio_exportacoes (expira_em) WHERE situacao = 'pronta'` (limpeza). Índices de consulta nas tabelas de negócio só se o `EXPLAIN` dos relatórios de fábrica pedir, cada um justificado no PR.

Padrões: `criarRelatoriosDeFabricaDoTenant` em `packages/db/src/padroes.ts`, com o mesmo backfill das migrações 0016/0026/0027/0028.

## 8. Telas (`apps/web/src/telas/relatorios/`)

**Referência visual:** as telas do Claude Design enviadas pelo Ale em 01/11/2026, em `docs/prototipo-relatorios/` (com a tabela de divergências no `README.md` de lá). Recriar em React + Tailwind com o `@leadtogo/ui` e os tokens de `docs/design-system/`; o protótipo não é código de produção. Onde a imagem e este plano divergirem, vale o plano.

### 8.1 Menu

- **"Relatórios"** na navegação principal (ícone Lucide `bar-chart-3`), visível com `relatorios.ver`.
- O atual "Relatórios de visita" passa a se chamar **"Visitas pendentes"** (aprovado em 01/11/2026; ajuste em `apps/web/src/casca/navegacao.ts` e no `funcionalidades.md`, seção 3C, no commit da R2).

### 8.2 `/relatorios` (lista; `01-lista-relatorios.png`)

- **Cabeçalho:** título "Relatórios", subtítulo "Monte tabelas com os dados do CRM, salve e exporte para Excel ou CSV" e o botão primário **"+ Novo relatório"** (só com `relatorios.criar`).
- **Abas com contagem:** **Meus** (os que a pessoa é dona) · **Compartilhados** (de outras pessoas, visíveis a ela pela equipe ou pelo perfil) · **Prontos** (os de fábrica). Busca **"Buscar pelo nome"** abaixo das abas, valendo para a aba aberta.
- **Cartões** em grade (3 por linha no desktop, 2 no tablet, 1 no celular): ícone da fonte principal (`building-2` Empresas, `handshake` Oportunidades, `calendar` Atividades, `users` Contatos), nome, "Fonte · dono" ("Seu" quando é da pessoa; o nome do dono nos compartilhados), última execução com `clock` (data relativa como no resto do sistema, ou "Nunca executado") e o selo de visibilidade: **"Só você"** (neutro), **"Equipe toda pode ver"** (sucesso) ou **"Perfis: Gestor, …"** (neutro). Rodapé: **Abrir** (secundário com `arrow-right`), **Editar** (só dono ou `relatorios.gerir`; nos Prontos não aparece) e **Duplicar** (com `relatorios.criar`).
- **"Minhas exportações"** (com `relatorios.exportar`), em bloco abaixo dos cartões, com o texto à direita **"Ficam disponíveis por 24 horas"**. Cada linha: ícone de planilha (verde; vermelho no erro), nome do arquivo, "quando · N linhas · disponível por mais N horas" e a situação:
  - **Na fila** / **Gerando** (selo informativo com `hourglass`; com o progresso "3.000 de 8.701 linhas" quando houver);
  - **Pronto** (selo de sucesso) com o botão **Baixar** (`download`);
  - **Erro** (selo de erro) com **Tentar de novo** (`repeat`), que cria uma exportação nova com a mesma definição;
  - **Expirada** (neutro, sem botão), que some da lista depois de 7 dias.
  Mostra as 10 mais recentes; a situação se atualiza sozinha enquanto houver alguma em fila ou gerando (consulta a cada 3 s, parando quando todas terminam).
- **Estados:** sem relatórios em "Meus" → EmptyState "Você ainda não montou nenhum relatório" com "Novo relatório" e "Ver os prontos"; busca sem resultado → "Nenhum relatório com 'x'"; sem exportações → o bloco não aparece.

### 8.3 Construtor (`/relatorios/novo` e `/relatorios/:id/editar`; `02-construtor-vazio.png`)

- **Barra do topo:** voltar (`chevron-left`; pergunta antes de sair com alterações não salvas), **nome editável** ("Relatório sem nome" até a pessoa dar um), **Compartilhar** (`users`; janela com Privado · Equipe toda · Perfis), **Exportar ▾** (`download`; Excel `.xlsx` · CSV) e **Salvar** (primário, `check`; desligado enquanto não houver coluna ou nada mudou). Exportar funciona sem salvar.
- **Painel Dados** (esquerda, largura fixa):
  - **Fonte principal** (seleção) com a ajuda "Cada linha da tabela é um registro desta fonte". Trocar a fonte com colunas escolhidas pede confirmação (as colunas saem).
  - **"Buscar campo"**, que filtra a árvore inteira.
  - **Árvore:** a fonte principal aberta com o selo **principal** e os seus campos; abaixo, as ligações recolhidas com o selo **um** (neutro) ou **muitos** (alerta). Cada campo tem o ícone do tipo (`type` texto, `tag` lista/tags, `calendar` data, `circle-dollar-sign` moeda, `hash` número, `toggle-left` sim/não). Campo já na tabela fica marcado.
  - Rodapé de ajuda: "Clique ou arraste um campo para a tabela. "muitos" pergunta se você quer totalizar ou detalhar."
  - Ao pôr um campo de ligação **muitos**, uma janela pergunta **Totalizar** (com a agregação: quantidade, soma, média, mínimo, máximo, mais recente, mais antiga) ou **Detalhar**, com o exemplo da decisão 3. Detalhar fica desligado se outra ligação já estiver detalhada ("Só uma ligação pode ser detalhada por relatório").
- **Centro (prévia):**
  - **Vazio:** área tracejada com "Escolha os campos" e "Clique ou arraste campos de Dados para montar a tabela" (é também onde se solta o campo arrastado).
  - **Com colunas:** a tabela (padrão das listas do protótipo: cabeçalho `--surface-sunken`, números tabulares e alinhados à direita, moeda `R$`), atualizada 400 ms depois de cada mudança; menu no cabeçalho de cada coluna (renomear, agregação, agrupar por, ordenar, mover para a esquerda/direita, remover); arrastar o cabeçalho reordena (`@dnd-kit`). Com agrupamento, linhas de grupo com subtotal, recolhíveis.
  - **Rodapé:** "Nenhuma coluna ainda" · "Mostrando 500 de 12.430 linhas" · "12 linhas".
- **Painel Ajustes** (direita, recolhível pela seta do título):
  - **Filtros** + **Adicionar**: um abaixo do outro, cada um com campo, operador e valor, e a opção "Perguntar ao abrir". Sem filtros: "Sem filtros: entram todos os registros que você pode ver".
  - **Agrupar:** seleção "Sem agrupamento" ou até 3 níveis (R3; na R2 a seleção aparece com "Em breve").
  - **Ordenar** + **Adicionar** (desligado sem colunas): até 3 critérios. Sem critério: "Na ordem em que os registros foram criados".
  - **Gráfico:** marcado **R4**, com "Barras, linhas e pizza a partir do agrupamento chegam numa próxima versão" até a R4.
- **Estados da prévia** (a barra "Simular" do protótipo mostra cada um; ela **não** vai para a produção): carregando (esqueleto da tabela), vazio ("Nenhuma linha com esses filtros"), erro com "Tentar de novo", tempo esgotado ("Relatório pesado demais: filtre um período menor ou exporte") e sem acesso a uma fonte (Alert "Você não tem acesso a Oportunidades; essas colunas ficam em branco").

### 8.4 Execução de um salvo (`/relatorios/:id`)

Sem imagem no protótipo; segue o construtor sem os painéis Dados e Ajustes: barra do topo com o nome, **Exportar ▾** e, para quem pode, **Editar** e **Duplicar**; os filtros "perguntar ao abrir" em linha acima da tabela; a prévia e o aviso fixo "Os dados seguem a sua carteira". Os Prontos abrem aqui (somente leitura).

### 8.5 Tablet, celular e acessibilidade

- **Tablet:** Dados e Ajustes viram gavetas (botões "Dados" e "Ajustes" na barra do topo).
- **Celular:** sem construtor (Novo relatório e Editar não aparecem); a lista e a execução de salvos funcionam, com a prévia em cartões e Exportar.
- **Acessibilidade:** a árvore é `role="tree"` com `aria-expanded`; a tabela tem cabeçalhos reais; tudo operável pelo teclado (o arrastar tem a alternativa "Mover para a esquerda/direita" e "Adicionar à tabela" pelo Enter no campo).

## 9. Segurança e LGPD

- **Isolamento**: RLS forçado nas duas tabelas novas + teste de isolamento (tenant A não lê nem grava relatórios e exportações do B; uma definição do A executada no B só traz dados do B).
- **Carteira**: testes que montam o mesmo relatório como vendedor, gestor e admin e conferem as linhas, **inclusive pelas ligações** (o vendedor não vê, por uma ligação "Empresa → Oportunidades", oportunidades de empresa fora da carteira dele).
- **Injeção**: teste com chaves e valores maliciosos na definição (`'; DROP`, nomes de tabela, `tenant_id`) esperando 400 sem tocar o banco.
- **Arquivo**: só quem solicitou baixa; URL assinada de 5 min; o arquivo some em 24 h; nenhum dado pessoal no nome do arquivo nem nos logs.
- **Auditoria**: cada exportação registra quem, quando, qual relatório, filtros e quantidade de linhas (não os dados). Entra em `lgpd.md` como tratamento novo (seção de registros) e na tabela de dados por tabela.
- Erros do worker passam pelo `limparEvento` antes do GlitchTip.

## 10. Fases e commits

Cada fase termina com roteiro de teste (`roteiro_teste_relatorios_rN.md`) e o aceite do Ale. Commits pequenos, Conventional Commits, `pnpm lint && pnpm typecheck && pnpm test` antes de cada um.

| Fase | Entrega | Commits previstos |
|---|---|---|
| **R0: Fundação** | catálogo compartilhado (Empresas, Contatos, Oportunidades, Atividades), schema da definição, compilador com testes unitários e de banco | `feat(shared): catálogo e definição de relatórios` · `feat(api): compilador de relatórios com regra de carteira` · `test(api): isolamento, carteira e injeção no compilador` |
| **R1: Executar e exportar** | migração 0045, permissões v12, rotas de catálogo, prévia, salvar e exportar `.xlsx`/CSV síncrono (até 5.000), relatórios de fábrica | `feat(db): tabelas de relatórios e exportações` · `feat(shared): permissões de relatórios (catálogo v12)` · `feat(api): prévia e relatórios salvos` · `feat(api): exportação xlsx e csv` · `feat(db): relatórios de fábrica` |
| **R2: Construtor visual** | telas `/relatorios`, construtor (dados, prévia, filtros, ordenar), execução de salvo, celular só leitura | `feat(web): lista de relatórios` · `feat(web): construtor de relatórios` · `feat(web): filtros perguntados ao abrir` · E2E: montar, salvar, exportar e abrir o `.xlsx` |
| **R3: Agrupamento e exportação grande** | agrupar e totalizar (3 níveis, datas por período), compartilhamento, exportação no worker até 100.000 com aviso, limpeza diária | `feat(api): agrupamento e totais` · `feat(worker): exportação de relatórios em segundo plano` · `feat(web): compartilhar relatório` · `feat(web): minhas exportações` |
| **R4: Mais fontes e gráfico** | Visitas (respostas por campo, com índice GIN em `relatorios_visita.respostas`), Rotas, Chamados, histórico de tags e de fases; gráfico de barras, linhas ou pizza na tela (não no `.xlsx`) | um commit por fonte, com testes de carteira de cada uma |
| **R5 (opcional)** | envio agendado por e-mail e substituição dos botões "Exportar" que faltam nas listas (Empresas, Oportunidades) por "Abrir como relatório" | a decidir |

**Estimativa grosseira:** R0+R1 ≈ 1,5 semana; R2 ≈ 1,5 semana; R3 ≈ 1 semana; R4 ≈ 1 semana.

## 11. Testes

- **Unitários (`packages/shared`)**: schema da definição (limites, combinações inválidas: campo de ligação "totalizar" sem agregação, duas ligações detalhadas, agrupamento sem agregação), operadores por tipo, períodos relativos no fuso.
- **Compilador (`apps/api`, banco de teste)**: cada fonte e ligação; totalizar não multiplica linhas; detalhar multiplica como esperado; filtros de cada tipo; tags por grupo; datas no fuso; ordenação estável.
- **Segurança**: isolamento entre tenants, carteira por papel (inclusive pelas ligações), campo com permissão própria, injeção, somente leitura (tentativa de escrita falha), tempo esgotado devolve 408 tratado.
- **Exportação**: abrir o `.xlsx` gerado com `exceljs` e conferir tipos das células, formato de moeda, datas no fuso, proteção contra fórmula, planilha "Sobre"; CSV com BOM e `;`; arquivo só para o dono; expiração.
- **Tela (Vitest + Testing Library)**: árvore de dados, escolha totalizar/detalhar, filtros, renomear e reordenar colunas, estados de erro e vazio, permissões escondendo menu e botões.
- **E2E (Playwright)**: montar "Oportunidades ganhas por vendedor no mês", salvar, reabrir, exportar e conferir o arquivo baixado.
- **Carga**: seed com 50 mil empresas e 200 mil atividades; prévia dos relatórios de fábrica abaixo de 2 s e exportação de 100 mil linhas abaixo de 2 min, com memória do worker estável.

## 12. Riscos e cuidados

| Risco | Cuidado |
|---|---|
| Consulta pesada derrubar o banco de produção | `statement_timeout`, limites da definição, fila com concorrência 2, `EXPLAIN` dos de fábrica; se preciso, réplica de leitura no futuro |
| Pessoa achar que um relatório compartilhado mostra os mesmos números para todos | Aviso fixo "Os dados seguem a sua carteira" na execução e na planilha "Sobre" |
| Multiplicação de linhas por junção | "Totalizar" como padrão, uma ligação detalhada por relatório, explicação com exemplo |
| Catálogo desatualizado quando surgir coluna nova | Teste que compara catálogo compartilhado × mapa SQL; item no checklist de PR: "a coluna nova entra no catálogo de relatórios?" |
| Campos personalizados (seção 8 de `funcionalidades.md`) ainda não existem | Quando existirem, entram no catálogo pelo `campos_extras` com a chave do campo; o desenho do catálogo já prevê campos dinâmicos por tenant |
| Vulnerabilidade conhecida do `exceljs` (`uuid`, ver `seguranca_dependencias.md`) | Já avaliada sem risco alcançável; reavaliar ao subir a versão |

## 13. Documentos que mudam (na implementação)

- `funcionalidades.md`: seção nova **"9H. Relatórios"** com as regras acima e a linha "Futuro" das fases atualizada; permissões do catálogo v12.
- `modelagem_banco.md`: seção da migração 0045.
- `lgpd.md`: exportações de relatório como tratamento, retenção de 24 h do arquivo.
- `backlog_pos_mvp.md`: retirar as exportações absorvidas e incluir o que ficou fora (seção 3, decisão 11).
- `docs/README.md`: este plano, as telas e os roteiros.
- `docs/prototipo-relatorios/README.md`: atualizar se o Claude Design enviar telas novas (execução de salvo, janela Totalizar/Detalhar, compartilhar).

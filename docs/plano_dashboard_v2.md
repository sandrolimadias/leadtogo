# Plano: Dashboard v2 (abas, períodos, novos indicadores e mapas)

*Proposta de 01/11/2026, **aprovada pelo Ale em 01/11/2026** (as nove decisões da seção 12 como recomendado). **Implementado em 01/11/2026** (ver seção 13, "Como ficou"). Dezoito pedidos sobre o Dashboard. Mexe em `packages/shared`, `apps/api`, `apps/web`, `packages/db` (uma tabela de referência nova, só expansão) e nos docs. Nenhuma variável de ambiente nova. Cada etapa da seção 11 vira commits pequenos, cada um com os seus testes.*

## 1. Resumo dos pedidos

| # | Pedido | Como fica | Onde mexe |
|---|---|---|---|
| 1 | Duas abas | **Minhas atividades** (o dia a dia) e **Resultados** (indicadores, gráficos e mapas). Aba na URL (`?aba=resultados`); padrão "Minhas atividades" | `telas/dashboard/pagina.tsx` (vira casca + 2 abas) |
| 2 | Ano, Semestre, Trimestre, Mês atual, Mês anterior e anos anteriores | Novos períodos `ano`, `semestre` e `ano_anterior` (com o ano escolhido num seletor) | `packages/shared/src/dashboard.ts`, API, tela |
| 3 | Período específico | Período `personalizado` com **De** e **Até** | idem |
| 4 | Previsão pela fase mais avançada, somando todos os funis | Oportunidades **ativas** na **última fase ativa de cada funil ativo**, com data prevista no período | `dashboard.service.ts` |
| 5 | Valor total de vendas | Card **Vendas no período**: soma do `valor_total` das conquistadas (data de fechamento no período) | idem (o número já é calculado em `resultado.conquistadas.total`) |
| 6 | MRR conquistado | Card que já existe, nos novos períodos (série de meses ajustada ao período) | idem |
| 7 | Visitas realizadas | Card: atividades **Realizadas** do tipo de sistema `visita` no período | idem |
| 8 | Atividades realizadas (sem as visitas) | Card: Realizadas no período de **todos os outros tipos** | idem |
| 9 | Quantidade de associados | Card: empresas com o Status `chave_sistema = 'cliente'` no **fim do período** | idem, lendo `empresa_tags_historico` |
| 10 | Churn | Card: **desassociados no período ÷ associados no início do período** | idem |
| 11 | Funil de vendas como é hoje | Mantém o gráfico do funil por fase (as ativas de hoje, funil selecionável) | sem mudança de regra |
| 12 | Lista de novos associados | Bloco com os que **viraram associados** no período | endpoint novo `associados` |
| 13 | Lista de desassociados | Bloco com os que **deixaram de ser** associados no período | idem |
| 14 | Tirar "Sem contato há 60 dias" | Sai o card e a lista do Dashboard (o filtro de Empresas e a configuração continuam) | tela, API, schema |
| 15 | Novo quadro "Carteira": mapa azul de associados | Mapa do **estado da empresa que usa o CRM**, municípios pintados por **densidade de associados** (azul) e legenda lateral (cidade, quantidade, cor) | tabela de contornos + endpoint + componente de mapa |
| 16 | Segundo mapa, vermelho, com o total de empresas | Mesmo mapa, densidade (vermelho) pelo **total de empresas do cadastro** | idem |
| 17 | Cards dos chamados | Quatro indicadores das **Métricas dos chamados** no período, na aba Resultados (com "Ver métricas") | reaproveita `GET /v1/chamados/metricas` |
| 18 | Cards do portal do cliente | Os quatro indicadores do hub do Portal, na aba Resultados | reaproveita `GET /v1/portal-hub/indicadores` (ganha `de`/`ate`) |

## 2. Como está hoje (levantamento)

- **Tela:** `apps/web/src/telas/dashboard/pagina.tsx`, uma página só, com período `Mês atual | Mês anterior | Trimestre` (`SegmentedControl`), os cards Rota de hoje, Relatórios de visita pendentes e Chamados pendentes, 4 indicadores (Previsão do período, MRR conquistado, Taxa de conversão, Sem contato há N dias), Minhas atividades, Funil e previsão (funil, conquistadas × perdidas, motivos de perda) e Carteira (barra por Status, empresas novas, lista "Sem contato").
- **API:** `GET /v1/carteira/dashboard` (`apps/api/src/carteira/dashboard.service.ts`), visão **"Minha"**: oportunidades e atividades de que o usuário é o responsável e as empresas da carteira dele (`vendedor_id`). Tudo num endpoint só.
- **Período:** `packages/shared/src/dashboard.ts` (`PERIODOS_DO_DASHBOARD`, `periodoDoDashboard`, `instantesDoIntervalo`), no fuso da empresa; o "anterior" é o período inteiro de mesmo tipo logo antes.
- **Associado:** é o Status de empresa com `chave_sistema = 'cliente'` (na empresa do Ale o nome da tag é "Associado"). Toda aplicação e remoção de tag passa por `apps/api/src/carteira/empresa-tags.ts` e grava `empresa_tags_historico` (`adicionada`/`removida`, `em`, `por`). **É essa tabela que permite contar associados em qualquer data, novos associados e desassociados.**
- **Estado da empresa que usa o CRM:** `tenants.municipio_codigo` → `municipios.uf`.
- **Mapa:** `municipios` tem só o **ponto** (`localizacao`), não o contorno. O mapa da tela Mapa é MapLibre + PMTiles do ES (mapa de ruas), pesado demais e sem divisa municipal para pintar. **Falta o contorno dos municípios** (ver seção 7).
- **Chamados:** `GET /v1/chamados/metricas?de&ate` (exige `chamados.ver_metricas`, com alcance própria/equipe/todas). **Portal:** `GET /v1/portal-hub/indicadores?dias` (exige `portal.ver`; Em aberto, Prazo estourando, 1ª resposta no prazo, Nota média).
- **Gráficos:** Recharts, carregado só na rota do Dashboard (`design_system.md`, "Gráficos").

## 3. Aba "Minhas atividades"

O que é trabalho do dia, **sem período** (as janelas são sempre hoje / atrasadas / próximos 7 dias):

1. Saudação e data (como hoje).
2. **Rota de hoje** (`CardDaRotaDeHoje`), **Relatórios de visita pendentes** (`CardDePendentes`) e **Chamados pendentes** (`CardDeChamadosPendentes`): os três que já existem, na mesma ordem.
3. **Minhas atividades** (`MinhasAtividades`) com as abas Hoje · Atrasadas · Próximos 7 dias e a conclusão rápida, agora em **largura total** (hoje divide a linha com o funil).

O seletor de período **não aparece** nesta aba. Os contadores das abas de atividades continuam vindo da API (ver 9.1).

## 4. Aba "Resultados"

### 4.1 Barra de período

- **Desktop/tablet:** `SegmentedControl` com **Mês atual · Mês anterior · Trimestre · Semestre · Ano**, seguido de um `Select` **"Anos anteriores"** (2025, 2024, … até o ano de criação da empresa no CRM, `tenants.criado_em`, ou o ano da oportunidade/empresa mais antiga, o que for menor; no máximo 10 anos) e do botão **"Período…"**, que abre um popover com **De** e **Até** (`TextField type="date"`, como em Métricas dos chamados) e "Aplicar".
- **Celular:** um único `Select` "Período" com todas as opções (Mês atual, Mês anterior, Trimestre, Semestre, Ano, cada ano anterior, Personalizado…) e, em Personalizado, os dois campos de data abaixo.
- Abaixo da barra, o rótulo do período em palavras ("1º semestre de 2026 · 01/01 a 30/06") e a visão (ver 4.6).
- **Regras do período** (todas no fuso da empresa):
  - `mes`, `mes_anterior`, `trimestre`: como hoje (do calendário).
  - `semestre`: o semestre do calendário atual (jan–jun ou jul–dez).
  - `ano`: o ano atual inteiro (1º/01 a 31/12).
  - `ano_anterior` + `ano=AAAA`: o ano escolhido, inteiro.
  - `personalizado` + `de` e `ate` (datas, ambos inclusivos): `de ≤ ate`, no máximo **3 anos** (proteção das consultas; 400 `periodo_invalido` com mensagem clara).
  - **Período anterior** (para as variações): o intervalo de **mesmo tamanho** logo antes (mês → mês, semestre → semestre, ano → ano; personalizado de N dias → os N dias anteriores).
  - Períodos que terminam no futuro (mês, trimestre, semestre e ano correntes) contam **até agora** nos números realizados; a previsão olha o período inteiro.
- Tudo na URL (`?aba=resultados&periodo=semestre`, `?periodo=personalizado&de=2026-03-01&ate=2026-04-15`, `?periodo=ano_anterior&ano=2024`), só o que não é padrão, como hoje (`busca.ts`).

### 4.2 Indicadores (duas linhas de quatro)

**Linha 1 — Vendas**

| Card | Valor | Dica | Clique |
|---|---|---|---|
| **Previsão (fase final)** | Soma do **valor total** das oportunidades ativas que estão na **última fase ativa de cada funil ativo**, com data prevista no período (decisão D2) | "N oportunidades · R$ X ponderado · M sem data prevista" | Oportunidades ativas filtradas pela fase final (por funil) |
| **Vendas no período** *(novo)* | Soma do `valor_total` das **conquistadas** com data de fechamento no período | "N vendas · +X% sobre o período anterior" | Oportunidades conquistadas no período (`linkDeConquistadas`) |
| **MRR conquistado** | Como hoje (soma de `valor_mensal` das conquistadas), com variação e mini-gráfico | série: os meses do período (mês/trimestre: últimos 6 meses; semestre: 6; ano: 12; personalizado: os meses do intervalo, até 36) | Conquistadas no mês (já existe) |
| **Taxa de conversão** | Como hoje (conquistadas ÷ (conquistadas + perdidas)) | "N conquistadas × M perdidas" | — |

**Linha 2 — Carteira e esforço**

| Card | Valor | Dica | Clique |
|---|---|---|---|
| **Associados** *(novo)* | Empresas com o Status Cliente (pela chave do sistema) **no fim do período** (períodos correntes: agora) | "+N novos · −M desassociados no período" | Empresas com o Status Cliente |
| **Churn** *(novo)* | **desassociados no período ÷ associados no início do período × 100**, uma casa decimal | "M de N associados saíram"; sem base: "—" e "sem associados no início do período" | Rola até a lista de desassociados |
| **Visitas realizadas** *(novo)* | Atividades **Realizadas** do tipo de sistema `visita`, com `realizada_em` no período | "+X% sobre o período anterior" | Atividades → Realizadas, tipo Visita, no período |
| **Atividades realizadas** *(novo)* | Atividades **Realizadas** de todos os outros tipos, no período | "+X% sobre o período anterior" | Atividades → Realizadas, no período, sem Visita |

Notas:
- Visita **"não localizada"** é Realizada e **conta** (regra do Ale de 22/10/2026: `conta_visita = false` nunca tira a atividade das contagens). Canceladas não contam.
- O card **"Sem contato há N dias" sai** (pedido 14). A configuração `dias_sem_contato_alerta` e o filtro "Sem contato há N dias" da lista de Empresas **continuam** (são usados fora do Dashboard).
- As Tarefas (tipo de sistema `tarefa`) entram em "Atividades realizadas": **sim** (decisão D4: é esforço registrado).

### 4.3 Funil e resultado

O cartão "Funil e previsão" de hoje, sem mudança de regra (pedido 11): funil por fase das **ativas de hoje** (não do período), com o seletor de funil; Conquistadas × Perdidas e canceladas no período; Principais motivos de perda no período. Fica em largura total (desktop: funil à esquerda, resultado e motivos à direita).

### 4.4 Associados: novos e desassociados (pedidos 12 e 13)

Um cartão com duas abas, **Novos associados (N)** e **Desassociados (M)**, cada uma com até 8 linhas e "Ver todos (N)":

- **Linha:** nome da empresa (link para a ficha), cidade/UF, **data** (em que virou ou deixou de ser associada), vendedor responsável e, nos novos, o **MRR** da oportunidade conquistada que a tornou associada (se houver, conquistada no mesmo dia); nos desassociados, o **Status atual** (tag) e quem tirou (ou "Sistema").
- **"Ver todos"** abre um painel lateral (`Sheet`) com a lista paginada (50 por página). **Sem exportar CSV nesta versão:** não existe permissão de exportar empresas, e criar uma fica no backlog.
- Vazio: "Nenhum associado novo neste período" / "Ninguém deixou de ser associado neste período".

**Regras (todas pela tag com `chave_sistema = 'cliente'`, nunca pelo nome):**
- **Associado em um instante T:** a última linha de `empresa_tags_historico` dessa tag para a empresa, com `em < T`, é `adicionada`, e a empresa não estava excluída em T.
- **Novo associado no período:** não era associado no início e **é** no fim. (Quem entrou e saiu dentro do período não aparece em nenhuma das listas; quem saiu e voltou também não.) Decisão D5.
- **Desassociado no período:** era associado no início e **não é** no fim.
- **Empresa excluída** (soft delete) que era associada: **não** conta como desassociada (exclusão é limpeza de cadastro, não perda de cliente). Decisão D6.
- **Churn** = desassociados ÷ associados no início, do mesmo jeito.

### 4.5 Carteira: dois mapas do estado (pedidos 15 e 16)

Cartão **Carteira** com dois mapas lado a lado (desktop ≥ `lg`); um embaixo do outro no tablet e no celular:

| Mapa | Medida por município | Cor | Título |
|---|---|---|---|
| Associados | Associados no fim do período, pelo **município do cadastro** da empresa (`empresas.municipio_codigo`) | escala **azul** | "Associados por município" |
| Empresas no cadastro | Empresas do cadastro (não excluídas, criadas até o fim do período), qualquer Status | escala **vermelha** | "Empresas no cadastro por município" |

- **Estado:** o da empresa que usa o CRM (`tenants.municipio_codigo → municipios.uf`). Sem endereço cadastrado: estado vazio com "Cadastre o endereço da sua empresa em Configurações → Empresa para ver o mapa" (link para quem pode editar).
- **Desenho:** SVG com os contornos dos municípios do estado (seção 7), sem mapa de ruas, sem zoom (cabe no cartão). Municípios sem nenhuma empresa ficam no tom neutro (`--surface-sunken`, borda `--border`).
- **Densidade:** **5 classes** por quantis dos municípios com valor > 0 (com valores pequenos, as classes se juntam; ex.: só 1 a 3 → 3 classes). As cores vêm dos tokens, por mistura: `color-mix(in oklch, var(--tag-blue-fg) P%, var(--surface))` com P = 20, 40, 60, 80, 100 (e o mesmo com `--tag-red-fg`). Sem hexadecimal; acompanha o tema escuro. A regra entra em `design_system.md` ("Mapa de densidade").
- **Legenda lateral** (à direita do mapa no desktop; abaixo no celular): as faixas das classes (quadrado de cor + "1–2", "3–5"…) e a **lista de cidades** em ordem decrescente: quadrado com a cor do município, nome da cidade e quantidade (`tabular-nums`). Mostra as 10 primeiras e "Ver todas (N)", que expande a lista com rolagem. Rodapé: "N fora do ES" (empresas de outros estados) e "N sem cidade".
- **Interação:** passar o mouse, tocar ou focar (teclado) num município ou numa linha da legenda **destaca** os dois (contorno `--accent`) e mostra o tooltip "Vitória: 42 associados (12% do total)". Clique leva à lista de **Empresas filtrada pela cidade** (e, no mapa azul, pelo Status Cliente), filtros que já existem (`cidade`, `status`). A legenda é a alternativa acessível (lista de links); o SVG tem `role="img"` e um `aria-label` com o resumo ("Associados em 23 dos 78 municípios do ES; mais em Vitória, 42").
- **Fonte dos limites:** "Limites municipais: IBGE" no rodapé do cartão (mesma linha de crédito do Mapa).

### 4.6 Chamados e Portal do cliente (pedidos 17 e 18)

Duas faixas de quatro cards no fim da aba, **cada uma só para quem tem a permissão** (e o Portal só com o módulo do Portal ligado):

- **Chamados** (`chamados.ver_metricas`, alcance da permissão): **Chamados no período**, **Ainda abertos**, **Tempo até a 1ª resposta**, **Resolução no prazo**. Link "Ver métricas" → `/chamados/metricas?de&ate` do mesmo período. Reaproveita o componente `Indicador` de `telas/chamados/metricas.tsx` (extrair para um componente comum).
- **Portal do cliente** (`portal.ver`): **Em aberto**, **Prazo estourando**, **1ª resposta no prazo**, **Nota média** (os de `IndicadoresDoPortal`). "Em aberto" e "Prazo estourando" são do momento; os outros dois passam a seguir o período selecionado (a API ganha `de`/`ate`, ver 9.3). Link "Abrir o Portal".

### 4.7 Visão (de quem são os números)

Hoje o Dashboard é só "Minha". Pedidos como "Quantidade de associados", "Churn" e os mapas do "total de empresas do cadastro" pedem a visão da **empresa** para o gestor e o admin. Decidido (D1):

- Seletor **Visão: Minha | Equipe | Empresa** na barra de período da aba Resultados, mostrando só as opções que o **alcance de `empresas.ver`** do perfil permite (alcance `propria` → nem aparece; `equipe` → Minha | Equipe; `todas` → as três). Padrão: **Minha**.
- "Minha": como hoje (responsável da oportunidade/atividade; `vendedor_id` da empresa). "Equipe": os membros da equipe do gestor. "Empresa": todos.
- A aba Minhas atividades continua sempre "Minha".
- A API **nunca** confia no parâmetro: o serviço recorta pelo alcance (`escopoDaCarteira`) e devolve 403 `acesso_negado` se pedirem uma visão maior que a permitida.

## 5. Mudanças no contrato (`packages/shared`)

- `PERIODOS_DO_DASHBOARD = ['mes', 'mes_anterior', 'trimestre', 'semestre', 'ano', 'ano_anterior', 'personalizado']`.
- `consultaDoDashboardSchema` ganha `ano` (inteiro, obrigatório com `ano_anterior`, entre 2000 e o ano atual − 1), `de`/`ate` (`YYYY-MM-DD`, obrigatórios com `personalizado`, máx. 3 anos) e `visao` (`minha` | `equipe` | `empresa`, padrão `minha`), com `superRefine` para as combinações.
- `periodoDoDashboard()` e `instantesDoIntervalo()` cobrem os novos tipos; `anterior` passa a ser "o intervalo de mesmo tamanho logo antes" para semestre, ano e personalizado. `ROTULO_DO_PERIODO` e um `rotuloDoIntervalo()` ("1º semestre de 2026", "2024", "01/03/2026 a 15/04/2026").
- Respostas novas: `resultadosDoDashboardSchema`, `associadosDoDashboardSchema` (com paginação) e `mapaDoDashboardSchema` (seção 9). O `dashboardSchema` atual **perde** `semContato` e `carteira` só depois que a tela parar de usá-los (expandir e contrair, seção 11).

## 6. Banco

### 6.1 Tabela de referência nova: `municipio_contornos`

| Coluna | Tipo | Observação |
|---|---|---|
| `municipio_codigo` | integer PK, FK `municipios.codigo_ibge` | |
| `uf` | char(2), FK `estados.uf` | índice `(uf)` |
| `contorno` | `geometry(MultiPolygon, 4326)` | já **simplificado** na carga (`ST_SimplifyPreserveTopology`, tolerância ~0,002°) |
| `fonte` | text | ex.: "IBGE malha municipal 2024" |
| `atualizado_em` | timestamptz | |

- É **referência nacional**, como `municipios` e `estados`: **sem `tenant_id` e sem RLS** (igual às outras de referência; leitura liberada ao papel da aplicação, escrita só pelo owner/seed). Registrar em `modelagem_banco.md` na seção das tabelas de referência.
- Migração **só de expansão** (`0054_dashboard_v2.sql`), sem tocar em nada existente.
- **Carga:** script `pnpm db:seed-contornos -- --uf ES` (em `apps/api/src/seed-referencias.ts` ou ao lado), que baixa a malha do IBGE (API de malhas `servicodados.ibge.gov.br/api/v3/malhas/estados/{UF}?intrarregiao=municipio&formato=application/vnd.geo+json`, com `qualidade=intermediaria`), simplifica e grava em lote, idempotente (`ON CONFLICT DO UPDATE`). Roda **no ambiente do Ale** e na produção uma vez por UF usada (hoje só o ES), como as outras cargas geo; passo a passo no roteiro de produção. Tamanho esperado do ES: 78 municípios, ~150–300 KB de GeoJSON simplificado.
- Testes da API usam um **contorno de teste** (dois quadrados) inserido pela fábrica, sem depender da internet.

### 6.2 Índices para os novos números

- `empresa_tags_historico` já tem `(tenant_id, tag_id)` e `(tenant_id, empresa_id, em)`. Para "associado em T" por tag e data, acrescentar `(tenant_id, tag_id, empresa_id, em DESC)` **se** o `EXPLAIN` no volume da produção mostrar necessidade (medir antes; entra na mesma migração).
- Atividades realizadas no período: conferir se há índice por `(tenant_id, situacao, realizada_em)`; se não houver, criar (`CREATE INDEX CONCURRENTLY` não roda em transação: seguir o padrão das migrações de índice do projeto).

### 6.3 Passo 0: conferir o histórico em produção (antes de contar churn)

O churn só é confiável se **todo associado atual tiver a linha `adicionada`** no histórico. Rodar em produção (só leitura):

```sql
SELECT count(*) FROM empresa_tags et
JOIN tags t ON t.id = et.tag_id AND t.chave_sistema = 'cliente'
WHERE NOT EXISTS (SELECT 1 FROM empresa_tags_historico h
                  WHERE h.empresa_id = et.empresa_id AND h.tag_id = et.tag_id AND h.acao = 'adicionada');
```

Se der > 0 (ex.: carga inicial feita por fora do serviço), a etapa 1 inclui uma **migração de dados** (só acréscimo, não destrutiva) que grava a linha `adicionada` com `em = empresa_tags.aplicada_em` e `por = NULL`, marcada `automatica = true`. Os números de associados antes dessa data ficam aproximados; o card mostra a nota "histórico desde DD/MM/AAAA" quando o período começa antes da primeira linha do histórico.

## 7. Contorno dos municípios: por que SVG e não MapLibre

- O mapa pedido é um **mapa de densidade** (coroplético) de um estado inteiro, sem ruas e sem zoom. Um SVG com 78 polígonos simplificados desenha em milissegundos, cabe no cartão, imprime bem, troca de tema pelos tokens e é fácil de testar (Vitest consulta os `path`).
- O MapLibre + PMTiles (tela Mapa) traria o mapa de ruas inteiro (~227 MB de tiles por faixas), WebGL e o peso da biblioteca para a rota do Dashboard, sem ganho para este uso.
- **Projeção:** própria e pequena (equirretangular com correção por `cos(latitude média)`, ajustada à caixa do SVG), sem dependência nova. Para um estado, a distorção é desprezível. Se um dia o mapa for do Brasil inteiro, troca-se por `d3-geo` (registrar no backlog, não agora).
- Componente novo `apps/web/src/components/mapa/mapa-de-densidade.tsx` (props: `contornos`, `valores por município`, `tom: 'azul' | 'vermelho'`, `onClicar`), com a legenda em `legenda-de-densidade.tsx` e as classes (quantis) numa função pura testada em `lib/densidade.ts`. Carregado com `lazy`, como os gráficos.

## 8. Permissões e alcance

- Aba **Minhas atividades** e aba **Resultados** (vendas, associados, esforço, funil, mapas): seguem `empresas.ver` (como o Dashboard hoje) e o alcance dele, conforme a visão escolhida (4.7).
- Faixa **Chamados**: `chamados.ver_metricas`, com o alcance dela (o endpoint já aplica).
- Faixa **Portal**: `portal.ver` e módulo do Portal ativo.
- Nenhuma permissão nova. Se o Ale quiser esconder a aba Resultados de algum perfil, uma permissão `dashboard.resultados` pode entrar depois (fora deste plano).

## 9. API

O endpoint único de hoje faz ~10 consultas. Com os blocos novos, ele seria lento e tudo esperaria o mais pesado. Proposta: **um endpoint por bloco**, todos com a mesma consulta de período e visão, e a tela carregando cada bloco em paralelo (cada um com o seu esqueleto e o seu erro).

### 9.1 `GET /v1/carteira/dashboard` (fica, encolhe)

Passa a servir só a aba **Minhas atividades**: `membro` e `atividades` (hoje/atrasadas/próximos 7). Expandir e contrair: na etapa 2 a tela para de usar os campos de resultado; na etapa 6 o schema perde `previsao`, `mrr`, `conversao`, `resultado`, `motivosDePerda`, `funil`, `carteira` e `semContato` (o cliente gerado `packages/api-client` é regenerado; é rota interna, sem uso na API aberta).

### 9.2 Novos (`apps/api/src/carteira/dashboard-*.service.ts`, controller `dashboard.controller.ts`)

| Rota | Devolve |
|---|---|
| `GET /v1/carteira/dashboard/resultados` | `periodo` (chave, rótulo, início, fim, anterior), `visao`, `previsaoFaseFinal` (valor, ponderado, quantidade, semPrevisao, por funil: funil, fase, valor, quantidade), `vendas` (total, quantidade, anterior, variacao), `mrr` (como hoje, série ajustada), `conversao`, `resultado`, `motivosDePerda`, `funil` (por `funilId`), `associados` (atual, inicio, novos, desassociados, churn, historicoDesde), `visitas` (realizadas, anterior, variacao), `atividadesRealizadas` (idem) |
| `GET /v1/carteira/dashboard/associados?tipo=novos\|desassociados&pagina&porPagina` | lista paginada (4.4) + total; `tipo` e período obrigatórios |
| `GET /v1/carteira/dashboard/mapa` | `uf`, `municipios` ({ codigo, nome, associados, empresas }), `foraDaUf` ({ associados, empresas }), `semCidade` ({ associados, empresas }) |
| `GET /v1/referencias/contornos?uf=ES` | FeatureCollection GeoJSON (código e nome em `properties`). Igual para todo tenant: `Cache-Control: private, max-age=86400` + `ETag` pelo `atualizado_em`; o front guarda com `staleTime: Infinity` |

Todas: `@Documenta` (OpenAPI), `ZodPipe` com os schemas do shared, consultas em SQL parametrizado (nada concatenado), recorte pelo alcance, RLS do tenant.

### 9.3 Ajuste em rota existente

- `GET /v1/portal-hub/indicadores`: aceita `de`/`ate` (opcionais) **além** de `dias` (que continua, para não quebrar o hub). Com `de`/`ate`, "1ª resposta no prazo" e "Nota média" usam o intervalo.
- `GET /v1/chamados/metricas`: sem mudança (já aceita `de`/`ate`).

## 10. Testes

- **Shared (Vitest):** cada período novo em datas de borda (virada de semestre e de ano, 31/12 no fuso de São Paulo e de Manaus, ano bissexto), "anterior" de mesmo tamanho, validação do personalizado (de > ate, mais de 3 anos, ano futuro) e rótulos.
- **API (Vitest + banco):**
  - Previsão da fase final: dois funis, a última fase de cada; fase inativa e funil inativo fora; oportunidade em fase anterior fora; sem data prevista em `semPrevisao`.
  - Vendas, MRR e conversão nos novos períodos; série do MRR com 6, 12 e N meses.
  - Visitas × atividades realizadas: visita não localizada conta; cancelada não; tarefa conforme D4; tipo achado pela **chave** (renomear o tipo não muda nada).
  - Associados/churn pelo histórico: entrou no período, saiu no período, entrou e saiu no mesmo período (fora das duas listas), saiu e voltou, empresa excluída (D6), tag "Cliente" renomeada para "Associado" (achada pela chave), churn sem base (`null`).
  - Mapa: contagem por município, fora da UF, sem cidade; tenant sem endereço (`uf: null`); contornos da UF.
  - Visão e alcance: vendedor pedindo `empresa` → 403; gestor vê só a equipe; admin vê tudo.
  - **Isolamento** (tenant A não lê B) para os quatro endpoints novos, com a fábrica do teste de isolamento (inclui `municipio_contornos` na lista das de referência sem RLS, para o teste de "toda tabela de negócio tem RLS" não reclamar).
  - Portal `indicadores` com `de`/`ate`.
- **Web (Vitest + Testing Library):** abas (troca e URL), barra de período (cada opção, anos anteriores, personalizado com validação, versão celular), cada card com valor/dica/link, estados vazio/erro/carregando por bloco, listas de associados e o painel "Ver todos", mapa (classes e cores, destaque cruzado mapa ↔ legenda, clique → link de Empresas com `cidade` e `status`, aviso sem endereço), faixas de Chamados e Portal só com a permissão, ausência do "Sem contato".
- **E2E (Playwright):** `dashboard.spec.ts` atualizado (as duas abas, troca de período, clique num município) e captura de layout em desktop 1280×800, tablet 820×1180 e celular 390×844 (como `mapa-layout.spec.ts`).
- Antes de cada commit: `pnpm lint && pnpm typecheck && pnpm test`.

## 11. Etapas e commits (ordem)

Cada linha é um commit (ou poucos), com os seus testes; a `main` continua deployável a cada passo.

**Etapa 0 — preparo (sem código de produção)**
1. Rodar a consulta do 6.3 em produção e medir o `EXPLAIN` das consultas de histórico e de atividades com o volume real. Ajustar o plano se precisar.

**Etapa 1 — períodos e contrato**
2. `feat(shared): períodos semestre, ano, anos anteriores e personalizado no Dashboard` (+ testes de data).
3. `feat(shared): schemas dos blocos de resultados, associados e mapa do Dashboard`.
4. (se o passo 1 pedir) `feat(db): histórico das tags de Status para os associados antigos` (migração de dados, só acréscimo).

**Etapa 2 — abas (só front, sem mudar números)**
5. `feat(web): Dashboard com as abas Minhas atividades e Resultados` (move os blocos atuais; período só na aba Resultados).
6. `feat(web): Dashboard sem o card e a lista "Sem contato"` (pedido 14) e sem o quadro Carteira antigo (pedido 15, a barra por Status sai; o mapa entra na etapa 5).

**Etapa 3 — resultados**
7. `feat(api): resultados do Dashboard por período (previsão da fase final e vendas)` (pedidos 4, 5, 6).
8. `feat(api): visitas e atividades realizadas no Dashboard` (7, 8).
9. `feat(api): associados e churn do Dashboard pelo histórico de Status` (9, 10).
10. `feat(api): listas de novos associados e desassociados` (12, 13).
11. `feat(web): aba Resultados com a barra de período e os oito indicadores` (2, 3 e os cards).
12. `feat(web): novos associados e desassociados no Dashboard`.

**Etapa 4 — visão Equipe/Empresa (D1)**
13. `feat(api): visão Minha, Equipe e Empresa nos resultados do Dashboard` + `feat(web): seletor de visão`.

**Etapa 5 — mapas**
14. `feat(db): contornos dos municípios (referência do IBGE)` (migração 0054 + script de carga + fábrica de teste).
15. `feat(api): contornos por UF e contagem por município para o Dashboard`.
16. `feat(web): mapa de densidade com legenda lateral` (componente + `lib/densidade.ts`).
17. `feat(web): quadro Carteira com os mapas de associados e de empresas` (15, 16).

**Etapa 6 — chamados, portal e limpeza**
18. `feat(api): indicadores do portal por intervalo de datas`.
19. `feat(web): cards dos chamados e do portal no Dashboard` (17, 18).
20. `refactor(api)!: Dashboard sem os campos que foram para os blocos novos` (contrair o `dashboardSchema`, regenerar `api-client`).
21. `docs: Dashboard v2` (ver abaixo) e `docs: roteiro de teste do Dashboard v2`.

**Docs a atualizar (no mesmo commit da mudança correspondente):** `docs/funcionalidades.md` §9 (nova seção "Dashboard v2", substituindo os blocos "Carteira" e "Sem contato"), `docs/modelagem_banco.md` (`municipio_contornos` e índices), `docs/design_system.md` ("Mapa de densidade" e cores por `color-mix`), `docs/backlog_pos_mvp.md` (tirar "período personalizado" e "alternância Equipe" se entrarem; acrescentar "mapa do Brasil com d3-geo"), `docs/roteiro_carga_geo_producao.md` (carga dos contornos), novo `docs/roteiro_teste_dashboard_v2.md`. A descrição do `@Documenta` de cada rota.

**Para o Ale cadastrar/rodar em produção:** nenhuma variável nova. Depois do deploy da etapa 5: rodar `pnpm db:seed-contornos -- --uf ES` uma vez (passo no roteiro).

**Estimativa:** etapas 1–3 ≈ 3 a 4 dias; etapa 4 ≈ 1 dia; etapa 5 ≈ 2 dias; etapa 6 ≈ 1 dia. Total ≈ 7 a 8 dias de trabalho.

## 12. Decisões do Ale

Todas respondidas em 01/11/2026: **as nove como recomendado**.

| # | Pergunta | Decisão (01/11/2026) |
|---|---|---|
| **D1** | Os Resultados ficam só na visão **"Minha"** (como hoje) ou ganham **Minha · Equipe · Empresa** (limitado pelo perfil)? | **Ganhar a visão** (4.7). Associados, churn e "total de empresas do cadastro" fazem mais sentido para a empresa inteira; o vendedor continua vendo só a dele. |
| **D2** | Previsão: soma o **valor total** ou o **ponderado** das oportunidades na fase final? E só as com **data prevista no período** ou todas que estão na fase final hoje? | **Valor total**, só as com data prevista no período (as sem data aparecem na dica como "M sem data prevista"; o ponderado também vai na dica). |
| **D3** | "Fase mais avançada" = a **última fase ativa** (maior ordem) de cada funil? | **Sim.** Se algum funil tiver uma fase final que não é "quase fechado", dá para, no futuro, marcar a fase de previsão no cadastro do funil. |
| **D4** | "Atividades realizadas" inclui as **Tarefas** (tipo de sistema `tarefa`)? | **Incluir** (é esforço registrado). |
| **D5** | Empresa que **virou e deixou de ser** associada dentro do mesmo período aparece em alguma lista? | **Não** (conta o saldo do período: estava no início × está no fim). |
| **D6** | Excluir uma empresa associada conta como **desassociação** (churn)? | **Não** (exclusão é limpeza de cadastro). |
| **D7** | Os mapas usam a cidade do **cadastro** (endereço da Receita) ou a posição **geocodificada**? | **Cidade do cadastro** (toda empresa tem; a geocodificação não cobre todas). |
| **D8** | O mapa vermelho mostra **todas** as empresas do cadastro (Lead, Prospect, Cliente, Inativo) ou tira os Inativos? | **Todas**, com um filtro rápido por Status no cartão numa evolução futura, se precisar. |
| **D9** | Os cards de Chamados/Portal ficam no **fim da aba Resultados** ou numa **terceira aba** "Atendimento"? | **Fim da aba Resultados** (o pedido é de duas abas). |

## 13. Como ficou (implementação de 01/11/2026)

Commits na ordem: banco e shared (migração 0054, períodos e schemas), API dos resultados, indicadores do portal por intervalo, a tela em duas abas, a contração do `GET /v1/carteira/dashboard` e os docs. Roteiro de teste em `roteiro_teste_dashboard_v2.md`.

**Diferenças em relação à proposta acima:**
- **Configurações → Empresa (01/11/2026, depois do deploy):** o plano supunha que a tela já existia; não existia. Entrou a tela com os dados e o endereço da empresa (Estado e Cidade escolhidos na lista de municípios), a rota `GET/PATCH /v1/configuracoes/empresa` (+ `/municipios?uf=`) e a permissão **`empresa.configurar`** (catálogo v14, Admin recebe sozinho). O aviso do mapa no Dashboard ganhou o link para ela.
- **Número da migração:** `0054_dashboard_v2.sql` (a `main` já tinha 0045 a 0053, da Fase 4 do portal).
- **Rota dos contornos:** `GET /v1/carteira/dashboard/contornos?uf=ES` (e não `/v1/referencias/contornos`), junto das outras rotas do Dashboard, com `Cache-Control: private, max-age=86400`. Devolve os polígonos de cada município (MultiPolygon do GeoJSON, 4 casas), não uma FeatureCollection.
- **Carga dos contornos:** a malha fica **versionada** em `packages/db/seeds/dados/municipio_contornos.json` (só o ES, 78 municípios, ~150 KB) e entra com as outras referências a **cada start da API**, só reescrevendo o que mudou. Não há o comando `db:seed-contornos` nem passo manual em produção. O gerador (`seeds/gerar-dados.mjs contornos`, `CONTORNOS_UFS`) baixa da API de Malhas do IBGE; **esta versão** foi gerada a partir de uma cópia derivada da malha do IBGE (projeto geodata-br), porque a API do IBGE não estava acessível no ambiente da geração. O gerador separa as ilhas gravadas como "buracos" (Vitória, Vila Velha, Guarapari e Ibiraçu), para nenhum contorno ficar inválido. Para trocar pela malha oficial mais recente: rodar o gerador com internet e conferir o diff.
- **Passo 0 (histórico):** em vez de conferir antes, a migração 0054 **sempre** grava, só onde falta, a linha `adicionada` do Status Cliente das empresas sem histórico (com a data de `aplicada_em`, automática). É idempotente e só acrescenta. Para listar as empresas sob o RLS forçado, cria e apaga uma política de leitura de `tenants` só para o owner dentro do mesmo bloco.
- **Índices:** criados na própria 0054 (sem medir antes): histórico `(tenant_id, tag_id, empresa_id, em)` e atividades realizadas `(tenant_id, realizada_em) WHERE situacao = 'realizada'`.
- **Escopo das contagens:** as empresas **excluídas** saem de tudo (inclusive dos números de períodos passados), e a carteira é a de **hoje** (`vendedor_id` atual): uma empresa transferida conta para o vendedor atual também nos períodos passados.
- **Anos anteriores:** os 10 anos antes do atual (sem olhar a data de criação da empresa).
- **Cards Visitas e Atividades realizadas:** sem clique (a tela Atividades não filtra por período nem por "todos menos visita").
- **Lista de novos associados:** o MRR é o das oportunidades da empresa **conquistadas no período** (e não "no mesmo dia").
- **Listas sem exportar CSV** (não existe permissão de exportar empresas; ficou no backlog).
- **Período específico:** os campos De/Até abrem logo abaixo da barra (não num popover).
- **Classes do mapa:** quantis dos valores **distintos** (as muitas cidades com 1 ou 2 não engolem as faixas).
- **`GET /v1/carteira/dashboard`:** passou a devolver só `membro` e `atividades`; os parâmetros antigos (`periodo`, `funilId`) são aceitos e ignorados, para telas abertas antes da atualização (PWA) não quebrarem.
- **Testes:** o E2E `apps/web/e2e/dashboard.spec.ts` foi atualizado para as duas abas, mas **não foi executado** no ambiente da implementação (sem Garage e Mailpit); os testes de unidade e integração (shared, banco, API e web) rodaram.

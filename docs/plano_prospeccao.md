# Plano — Prospecção (busca por CNAE e município na base da Receita)

> Módulo pós-MVP, **o próximo depois do G4 (rotas)**. É a "fase própria logo após o MVP" de `escopo_mvp.md` (seção 3) e `backlog_pos_mvp.md`. Regras de negócio em `funcionalidades.md`, seção 3A; tabelas previstas em `modelagem_banco.md`, seção 10; tela de referência em `docs/prototipo/prototipo/Prospeccao.dc.html`.
> **Status: plano guardado para a próxima fase (decisão do Ale, 23/10/2026).** Não será implantado agora; antes de começar, o Ale responde a seção 9 e se faz a medição do passo P0. Nada de código até lá.

## 1. O que já existe (não refazer)

| Peça | Onde | Como a Prospecção usa |
|---|---|---|
| Consulta de CNPJ com cache de 30 dias, Minha Receita + BrasilAPI | `apps/api/src/receita/` | Preenche os dados completos de cada empresa importada |
| Importação em lote (fila, relatório, desfazer em 7 dias, bloqueio de empresa não ativa, perfis de regras) | `apps/api/src/importacao/`, tabelas `importacoes`, `importacao_linhas`, `importacao_perfis` | **A importação da Prospecção é um lote de importação** (tipo novo): herda fila, retomada, relatório, desfazer e o perfil de regras |
| Lote → pins no mapa (leads só aparecem por lote, até 500) | `apps/api/src/mapa/` (`importacao_id`) | Leads prospectados aparecem no mapa pelo lote, sem mudar o mapa |
| Geocodificação automática de empresa nova | G1 | A empresa importada entra na fila de geocodificação sozinha |
| "Adicionar à rota" a partir do mapa/lista | G4 | Fecha o ciclo: prospectar → ver no mapa → montar rota |
| Tabelas de referência `cnaes` (1.332), `municipios`, `portes`, `naturezas` | `packages/db/src/schema/referencias.ts` | Autocomplete de CNAE, filtro de município e natureza |
| Origem de cadastro `prospeccao` | enum `origem_cadastro` | Já prevista; falta usar |
| Rota `/prospeccao` e item de menu | `apps/web/src/routes/_autenticado.prospeccao.tsx` | Hoje é `PaginaVazia` ("Em breve") |

## 2. O ponto crítico: de onde vem a base

A API pública da Minha Receita **só consulta um CNPJ**; não filtra por CNAE e município. Buscar por CNAE exige a **base completa** de estabelecimentos (dados abertos da Receita). Os documentos hoje se contradizem:

- `funcionalidades.md` 3A e `escopo_mvp.md`: o caminho é uma **instância própria da Minha Receita**.
- `modelagem_banco.md` 12.4: "hospedar a Minha Receita na VPS **não é viável** (centenas de GB)".
- A VPS tem ~157 GB livres e CPU já em ~50% (G0).

Por isso o **primeiro passo é medir** (P0, como foi o G0 e o passo 10.0 do G4), com duas opções:

| | Opção A — Minha Receita própria | Opção B — recorte da base num schema próprio (recomendada) |
|---|---|---|
| O quê | Subir a Minha Receita com a base nacional | Carregar os **estabelecimentos dos dados abertos** só das UFs que o Ale usa (`GEO_UF`, hoje ES) no Postgres, em `referencia_receita` |
| Onde roda o preparo pesado | WSL do Ale, mas o resultado final é grande | WSL do Ale; sobe só o recorte já pronto, como o CNEFE |
| Disco/RAM na VPS | A medir; pode não caber | Pequeno por UF (a medir) |
| Busca | Depende dos endpoints dela (a confirmar no P0) | **SQL próprio**: CNAE principal/secundário, município, natureza, porte, situação, data de abertura, com índices |
| Dados completos de cada empresa | Mesma fonte | **Continua a consulta atual** (`ReceitaService`) só para quem for importado; a busca usa o resumo da base |
| Multi-UF depois | Já vem | Recarga por UF (mesmo gatilho da geolocalização multi-UF) |

**Recomendação: Opção B**, no mesmo padrão do CNEFE (schema de referência sem RLS, preparo fora da VPS, script em `scripts/receita/`, atualização mensal sob demanda). `MINHA_RECEITA_URL` continua apontando para a pública (ou para uma própria no futuro) para os dados completos. O P0 confirma tamanho, tempo de carga e se o recorte de ES responde a uma busca em menos de 1 s na VPS ARM; se a medição falhar, volta-se à decisão com o Ale.

> LGPD: a base é pública (art. 7º, § 4º). **Não** carregar CPF de sócio (a Receita já mascara) nem e-mail/telefone de **empresário individual/MEI** sem decisão do Ale (ver pergunta 3).

## 3. Escopo

### 3.1 P1 — Base e busca (migração 0031, só expansão)

- **Schema `referencia_receita`** (sem RLS, dentro do backup, igual a `referencia_geo`): `estabelecimentos` (CNPJ, razão/fantasia, matriz/filial, situação cadastral e data, data de abertura, CNAE principal, CNAEs secundários em array, natureza, porte, município IBGE, CEP, UF) com índices por `(cnae_principal, municipio)`, GIN nos secundários e `pg_trgm` no nome.
- **Carregador** `scripts/receita/` (WSL): baixa os arquivos mensais, filtra pela UF, grava em lote, registra a data de referência da base e o tamanho. Idempotente, com recarga completa.
- **Tabelas de negócio (tenant, RLS forçado, teste de isolamento):** `prospeccoes` (buscas salvas: nome, filtros jsonb, só ativas, última execução, total e novas) e `prospeccao_resultados` (resumo da lista de revisão, `empresa_id` se já está no CRM, selecionado, importado_em). Colunas padrão do `CLAUDE.md`.
- **Catálogo de permissões v4:** `prospeccao.ver`, `prospeccao.buscar`, `prospeccao.importar`. Padrão: Administrador e Gestor tudo; Vendedor **não** vê (pergunta 4). O menu e a rota passam a decidir pelo perfil; o teste `rotas-com-decisao` cobre as rotas novas.
- **API** `/v1/prospeccao`: busca de CNAE (autocomplete), buscas salvas (CRUD), executar (paginada por cursor, em segundo plano se passar de N resultados, mesmo desenho do lote), lista de resultados com "já está no CRM", **repetir busca** (marca "nova" o que não existia na execução anterior) e limite de resultados por busca (sugestão: 5.000).
- Regras de busca: CNAE **principal ou secundário** ("onde procurar": principal, secundário ou ambos, como no protótipo); UF e município (IBGE); natureza jurídica; porte; **somente ativas** (padrão ligado); sem filtro de data de abertura no primeiro corte.

### 3.2 P2 — Importar como Lead

- **Importar selecionadas:** vendedor (obrigatório), vertical, tag de Status (padrão Lead), **tag da campanha** (cria se não existir, mede a conversão da busca) e "Converter sócios em contatos" (nome e qualificação, sem CPF), exatamente como o diálogo do protótipo.
- Cria **um lote de importação** `tipo = prospeccao`, `origem = Prospecção`, `origem_cadastro = prospeccao`, ligado à busca (`prospeccao_id`). A fila existente consulta a Receita (cache), aplica o bloqueio de empresa não ativa, o perfil de regras opcional e grava a empresa; geocodificação automática segue sozinha.
- **Reaproveita:** relatório do lote, "importar mesmo assim", **desfazer em 7 dias**, e o filtro por lote no mapa (leads prospectados aparecem lá).
- **Duplicado por CNPJ** pula e marca "já está no CRM" (regra da importação; sem mesclar).
- Aviso de lote grande e limite por importação (sugestão: 500 por vez, para respeitar a Minha Receita pública; configurável).

### 3.3 P3 — Telas

Seguem `Prospeccao.dc.html` (README do protótipo, seção do menu "Carteira"):
- **Buscas salvas** em cards (nome, resumo dos filtros, última execução, selo "N novas", "Repetir busca").
- **Filtros** (CNAE com autocomplete e chips, "onde procurar o CNAE", UF/município, natureza, porte, "somente ativas", Buscar, "Salvar esta busca"); no celular, filtros recolhíveis.
- **Resultados:** progresso quando roda em segundo plano (com Cancelar), tabela (Empresa/razão/CNPJ, CNAE principal, cidade, abertura, **No CRM** com "Abrir ficha"), "Só as novas desde a última busca", seleção em massa com "Importar como Lead", celular em cards.
- **Estado vazio** ("Escolha os filtros e busque"), erro e base desatualizada (mostra a data de referência da base).
- **Mapa e rota:** depois de importar, link "Ver no mapa" (abre o mapa já filtrado pelo lote) e "Adicionar à rota".
- **Dashboard:** o bloco "Novos leads" passa a mostrar "N vindos da prospecção" (hoje omitido; item do backlog).

### 3.4 P4 — Acabamento

- E2E: buscar → salvar → selecionar → importar → ver no mapa → desfazer; repetir busca mostra só as novas.
- Roteiro de teste `docs/roteiro_teste_prospeccao.md`, relatório de medição (P0) e atualização de `funcionalidades.md` (3A), `modelagem_banco.md` (seção 10 e 12), `lgpd.md`, `configuracao_tecnologia.md` (seção 11.4 e 17), `escopo_mvp.md` e `backlog_pos_mvp.md` (mover para "Feito").

## 4. Dados e infraestrutura

| Item | Onde | Observação |
|---|---|---|
| Base de estabelecimentos do recorte (ES) | schema `referencia_receita` no Postgres | sem RLS; dentro do backup; tamanho a medir no P0 (e o dump antes/depois, como no CNEFE) |
| Preparo da base | WSL do Ale (`scripts/receita/`) | nunca na VPS; mensal e sob demanda; `docs/geo_atualizacao.md` ganha a seção da Receita |
| Tabelas novas (RLS forçado e isolamento) | Postgres | `prospeccoes`, `prospeccao_resultados`; coluna `importacoes.prospeccao_id` e valor `prospeccao` em `tipo_importacao` |
| Variáveis novas (`.env.example`, sem valor) | Coolify | `PROSPECCAO_MAX_RESULTADOS`, `PROSPECCAO_MAX_IMPORTAR`; `GEO_UF` já existe e define o recorte. **Avisar o Ale para cadastrar** |
| Migração | 0031, só expansão | Um único Backup Now antes do push |

## 5. Sequência

**P0 — Medir (com o Ale), antes do código:** confirmar a fonte e o layout dos arquivos mensais; carregar o recorte do ES no WSL; medir tempo, tamanho (tabela e dump), RAM e tempo de busca por CNAE+município na VPS ARM; confirmar os endpoints reais da Minha Receita (se houver busca) e decidir A ou B. Relatório em `docs/prospeccao_p0_relatorio.md`.

1. Documentação (este plano aprovado, funcionalidades, modelagem, LGPD).
2. Migração 0031 + schema Drizzle + catálogo v4 + testes de isolamento. **PARA antes do push, para o Backup Now.**
3. Carregador `scripts/receita/` e carga em produção (com o Ale).
4. API de busca, buscas salvas e repetir busca (com testes).
5. Importação como Lead (tipo de lote novo, tag da campanha, sócios como contatos).
6. Telas (lista de buscas, filtros, resultados, diálogo de importação, celular).
7. Mapa/rota/Dashboard (links e o bloco "vindos da prospecção").
8. E2E, roteiro de teste, relatório e documentação final.

Pushes: (1) commits 1–2; (2) 3–4; (3) 5–6; (4) 7–8. Cada commit com `pnpm lint && pnpm typecheck && pnpm test` verdes.

## 6. Fora deste módulo

| Item | Motivo |
|---|---|
| Instância própria da Minha Receita com a base nacional | Só se o P0 mostrar que cabe, ou com o primeiro cliente fora do ES (mesmo gatilho do multi-UF) |
| Enriquecimento além do que a Receita dá (site, redes, e-mail da empresa por terceiros) | Sem pedido; outra base legal |
| Prospecção por CPF/MEI com telefone pessoal | LGPD: pergunta 3 |
| Pontuação/ranking de leads, listas frias automáticas, disparo de campanha | WhatsApp e e-mail são fases futuras |
| Busca por sócio, por capital social ou por data de abertura | Sem pedido; a base permite depois |
| Mesclar/atualizar empresa já na carteira com dados da busca | Decisão do Módulo 4: deduplica só por CNPJ |
| Notificação de "busca concluída" | A central de notificações está fora (a tela mostra o progresso) |

## 7. Riscos

| Risco | Mitigação |
|---|---|
| A base não cabe/não responde bem na VPS | P0 mede antes do código; plano B é carregar menos colunas ou só os CNAEs de interesse |
| Minha Receita pública limita as consultas na importação de 500 leads | Fila já tem intervalo configurável e retomada; limite por importação configurável |
| Base desatualizada (mensal) mostra empresa baixada como ativa | A consulta completa na importação confere a situação e o bloqueio de empresa não ativa vale |
| Dado pessoal de empresário individual | Pergunta 3; não carregar telefone/e-mail de MEI por padrão |
| Vendedor vê a lista de toda a base | Permissão `prospeccao.*`; pergunta 4 |

## 8. Testes

- Isolamento de `prospeccoes` e `prospeccao_resultados` (tenant A não lê nem grava no B).
- Busca: CNAE principal × secundário × ambos, município, ativas, paginação por cursor, limite.
- "Já está no CRM" respeita a carteira (vendedor não vê dono de empresa que não enxerga, igual ao duplicado do Módulo 2).
- Repetir busca marca só as novas; importação idempotente (duplo clique não cria duas vezes); desfazer; bloqueio de não ativa.
- Permissões: perfil sem `prospeccao.*` recebe 403 e não vê o menu.
- E2E conforme P4.

## 9. Perguntas ao Ale

1. **Base:** seguir a **Opção B** (recorte da UF no nosso Postgres, preparado no WSL) em vez de subir a Minha Receita nacional? Recomendação: **sim**, sujeita à medição do P0.
2. **UF inicial:** só o **ES** (`GEO_UF`), como o resto da geolocalização? Recomendação: **sim**.
3. **MEI e empresário individual:** carregar e mostrar telefone/e-mail deles? Recomendação: **não** na busca (entram só pelo cadastro completo, como hoje), e o Ale decide depois.
4. **Quem acessa:** Administrador e Gestor por padrão; o Vendedor só com perfil que conceda. Recomendação: **sim**.
5. **Limites:** até **5.000 resultados** por busca e **500 empresas** por importação. Recomendação: **sim**, configuráveis.
6. **A importação cria um lote** (desfazível em 7 dias, filtrável no mapa) com a **tag da campanha** obrigatória? Recomendação: **sim**.
7. **Perfil de regras** (os 126 CNAEs do Ale) opcional na importação da Prospecção, como na planilha? Recomendação: **sim**, opcional.
8. **Atualização da base:** mensal e **sob demanda**, rodando você o script no WSL (sem agendamento automático)? Recomendação: **sim**.

## 10. Decisões

| Data | Decisão | Quem |
|---|---|---|
| 23/10/2026 | Plano guardado: a Prospecção fica para a próxima fase; a seção 9 segue sem resposta | Ale |

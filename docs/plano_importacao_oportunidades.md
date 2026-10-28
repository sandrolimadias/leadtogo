# Plano da importação de oportunidades por planilha

*Proposta de 28/10/2026, **a aprovar pelo Ale**. Estende a importação do Módulo 4 e a de contatos e atividades (16/10/2026) com um quarto tipo: **oportunidades**. Regras do cadastro manual em `funcionalidades.md` (seções 6 e 7) e tabela em `modelagem_banco.md` (seção 9.1).*

## 1. Objetivo

Trazer para o Leadtogo a carteira de negócios que o cliente já tem em outro CRM ou em planilha: as oportunidades **em andamento** (que entram no Kanban, na fase certa) e o **histórico fechado** (conquistadas, perdidas, canceladas e suspensas, que alimentam a análise de onde se perde e a previsão). A oportunidade importada tem de ficar **igual à cadastrada à mão**: mesmas validações, mesmo histórico, mesmos efeitos.

## 2. O que se reaproveita (nada de fluxo novo)

| Peça | Onde está | Uso aqui |
|---|---|---|
| Assistente com alternância de tipo e 5 passos (Enviar · Mapear · Prévia · Importar · Relatório) | `apps/web/src/telas/importacao` | Ganha o tipo **Oportunidades** |
| Upload para o Garage, leitura de XLSX/CSV, limites de 10.000 linhas e 10 MB | `planilha.ts`, `LIMITE_*_DA_IMPORTACAO` | Sem mudança |
| `ExecutorBase` (blocos curtos, idempotência por linha com `FOR UPDATE SKIP LOCKED`, varredura de lote parado) | `executor-base.ts`, `varredura.ts` | Novo `ExecutorDeOportunidades` |
| Mapeamento de **valores** da coluna (valor da planilha → cadastro, ou "pular") | `previa-novos-tipos.ts`, `mapeamento.tipos` | Generalizado para fase, origem, solução e motivo |
| Leitura de sim/não, data, `paraComparar` | `packages/shared/src/importacao-leitura.ts` | + `lerDinheiro` e `lerPercentual` |
| Relatório filtrável, CSV do que não entrou, "Baixar modelo", lista de importações | `relatorio.service.ts`, `lotes.*` | Colunas e rótulos do tipo novo |
| Desfazer em 7 dias (`DIAS_PARA_DESFAZER`), só o que o lote criou e ninguém alterou | `desfazer-novos-tipos.ts` | + `desfazerOportunidades` |
| Regras do cadastro manual (funil padrão, primeira fase ativa, responsável = vendedor da empresa, 12 meses, probabilidade da fase) | `carteira/oportunidades.service.ts` | Extraídas para funções reutilizadas pelo executor (ver 6.1) |

**Sem consulta à Receita**, como contatos e atividades.

## 3. Decisões propostas (o Ale confirma ou muda)

1. **Empresa pelo CNPJ**, obrigatório e já na carteira (com ou sem pontuação). CNPJ fora da carteira pula (`pulada_empresa_inexistente`). Ordem recomendada na dica do primeiro passo: empresas → contatos → **oportunidades** → atividades (a atividade importada passa a poder apontar a oportunidade, ver 9).
2. **Um funil por lote**, escolhido no passo Mapear (padrão: o funil padrão). A fase vem da coluna **Fase**, com o mapeamento de valores para as fases **ativas** daquele funil; coluna sem valor ou sem coluna = primeira fase ativa. Motivo: o limite de 6 fases e "mover de funil" (fora do MVP) tornam o funil por linha confuso. *Alternativa:* coluna Funil + Fase; fica no backlog.
3. **Status** pela coluna (Ativo, Conquistado/Ganho, Perdido, Cancelado, Suspenso; sem coluna ou em branco = Ativo). Fechada importada:
   - grava `fase_parou_em_id` = a fase da linha e `data_fechamento` = coluna **Data de fechamento** (sem ela, o instante da importação, com aviso);
   - **Perdido, Cancelado e Suspenso exigem o Motivo** (mapeamento de valores para os motivos que valem para aquele status); sem motivo válido, a linha **pula** (`pulada_invalida`), como no cadastro manual;
   - **Suspenso exige "Retomar em"** e cria a atividade de retomada, como o fechamento manual; "Retomar em" no passado pula a linha.
4. **Conquistado não muda a empresa para Cliente sozinho.** Chave no passo Mapear: *"Conquistadas mudam o Status da empresa para Cliente"*, **desligada por padrão** (histórico antigo não deve mexer na carteira sem a pessoa pedir). *Recomendação do Claude; o Ale pode preferir seguir a configuração da empresa.*
5. **Valores** como no Módulo 6: Valor único, Valor mensal e Meses (inteiro ≥ 0; vazio com mensal > 0 = 12). O total e o ponderado **nunca** vêm da planilha (colunas geradas). Aceita `R$`, ponto de milhar e vírgula decimal ("1.234,56") e também "1234.56"; negativo ou acima de `VALOR_MAXIMO` pula a linha.
6. **Probabilidade** opcional (0 a 100, aceita "40%"). Vazia = a da fase; diferente da fase = marcada como editada à mão (`probabilidade_manual`), igual ao `criar` manual.
7. **Responsável** pelo e-mail de um membro ativo com alcance na empresa; vazio ou desconhecido = **vendedor da empresa** (com aviso quando veio e não casou). Diferente da atividade (lá vale quem importa), porque na oportunidade a regra do cadastro é o vendedor da empresa.
8. **Contato principal** pelo e-mail, só com vínculo ativo na empresa; não encontrado = entra sem contato, com aviso.
9. **Origem e Solução** pelo mapeamento de valores (casa pelo nome sem acento e maiúsculas; o resto a pessoa aponta ou deixa "sem"); valor sem correspondência = entra sem o campo, com aviso. **Nunca cria cadastro** novo (os cadastros são do administrador).
10. **Duplicada:** mesma empresa + mesmo título (`paraComparar`) + mesmo funil, não excluída, já existe → **pulada** (`pulada_duplicada`, apontando a existente). A importação **nunca atualiza** oportunidade existente (mesma regra de 16/10/2026 para contatos e atividades).
11. **Título** obrigatório? **Não:** vazio vira a sugestão do cadastro, "Empresa – Solução" (ou só o nome da empresa).
12. Quem importa: **administrador e gestor** (permissão `importacao.executar`); vendedor não vê o tipo e a API recusa com 403.
13. Blocos de **200 linhas** (`LIMITES_DO_BLOCO_DE_OPORTUNIDADES`), sem espera de Receita.
14. **Eventos:** nenhum `oportunidade.criada` por linha; o lote sai como **um** `importacao.concluida` (regra de `plano_api_aberta.md` §6.1). A auditoria registra a criação de cada oportunidade com o id do lote (`importacaoId` nas alterações).

## 4. Colunas do modelo ("Baixar modelo")

| Campo | Obrigatório | Leitura |
|---|---|---|
| CNPJ da empresa | sim | normalizado (máscara, zeros à esquerda, alfanumérico) |
| Título | não | até 200 caracteres; vazio = sugestão |
| Fase | não | mapeamento de valores → fase ativa do funil escolhido |
| Status | não | Ativo · Conquistado · Perdido · Cancelado · Suspenso (sinônimos: ganho, ganha, vendida; perdida; cancelada; suspensa, pausada) |
| Motivo | se Perdido/Cancelado/Suspenso | mapeamento de valores → motivo que vale para o status |
| Detalhe do motivo | não | até 2.000 |
| Retomar em | se Suspenso | dd/mm/aaaa, hoje ou depois |
| Data de fechamento | não | dd/mm/aaaa (ignorada com aviso em Ativo) |
| Valor único | não | dinheiro |
| Valor mensal | não | dinheiro |
| Meses | não | inteiro 0 a 600 |
| Probabilidade (%) | não | 0 a 100 |
| Data prevista de fechamento | não | dd/mm/aaaa |
| Origem | não | mapeamento de valores |
| Solução | não | mapeamento de valores |
| E-mail do contato | não | contato com vínculo ativo |
| E-mail do responsável | não | membro ativo |
| Observações | não | até 5.000 |

## 5. Modelo de dados (migração 0041, **só expansão**)

- `tipo_importacao` ganha `oportunidades`.
- `oportunidades.importacao_id` (uuid nulo, **sem FK**, como nas outras tabelas; índice `(tenant_id, importacao_id)`).
- `importacao_linhas.oportunidade_id` (FK → `oportunidades`).
- `importacoes.mapeamento` (jsonb, sem coluna nova) ganha: `funilId`, `clienteAoConquistar` (boolean) e `valores` = `{ fase: {…}, motivo: {…}, origem: {…}, solucao: {…} }`, cada um `{ valor normalizado: id | null }`. O `tipos` das atividades continua lido como está (compatível).
- `oportunidade_historico`: a linha `criada` leva a fase; para a fechada, uma segunda linha `status` (ativo → status) com o motivo, para a análise de perda contar a importada como a manual.
- **Nenhum** valor novo em `resultado_da_linha`: `criada`, `pulada_duplicada`, `pulada_empresa_inexistente`, `pulada_invalida` (com o motivo em português) e `erro` cobrem tudo.
- Sem tabela nova, então o teste de isolamento só ganha os casos do tipo novo (ver 8). A migração não usa os valores novos, e o código atual funciona com o banco novo (expandir e depois contrair).

## 6. Back-end (`apps/api`)

### 6.1 Regras compartilhadas com o cadastro manual
Extrair de `OportunidadesService.criar` e `fechar`, sem mudar o comportamento, funções que recebem a transação: `resolverFase`, `resolverResponsavel`, `calcularMeses`/probabilidade, `inserirOportunidade` (insere + histórico `criada`) e `registrarFechamento` (status, `fase_parou_em_id`, data, histórico, retomada, empresa vira Cliente). O serviço manual e o executor passam a usar as mesmas; os testes de `oportunidades.test.ts` garantem que nada mudou.

### 6.2 Funções puras (`packages/shared/src/importacao-oportunidades.ts`)
`CAMPOS_DA_OPORTUNIDADE_NA_IMPORTACAO`, `lerStatus`, `lerDinheiro`, `lerPercentual`, `lerOportunidadeDaLinha` (devolve a oportunidade lida, os avisos ou o motivo de pular) e `decidirOportunidade` (aplica as regras da seção 3 com os cadastros já resolvidos). São elas que a prévia e o executor chamam, como em atividades.

### 6.3 Executor (`executor-oportunidades.ts`)
`preparar`: confere CNPJ no mapeamento e o funil (ativo), normaliza os documentos, carrega fases ativas, motivos, origens, soluções e membros uma vez. Por linha: empresa no alcance → duplicada? → lê e decide → insere com `importacao_id` → fecha se for o caso → grava `resultado`, `oportunidade_id` e `avisos`. Trava por `(empresa, título, funil)` para dois executores no mesmo lote não duplicarem. No fim do bloco, `recalcularOportunidade` só para as que ganharam atividade de retomada.

### 6.4 API (rotas existentes, tipo novo)
- Prévia: contagem do que entra, pula e entra com aviso, com os 20 primeiros problemas.
- `GET .../valores?campo=fase|motivo|origem|solucao` (generaliza o de "valores da coluna Tipo"), até `MAX_VALORES_DE_TIPO`.
- Modelo (`.xlsx` com as colunas da seção 4 e duas linhas de exemplo: uma ativa e uma perdida).
- Relatório e CSV com Título, Empresa, Fase e Status.
- **Desfazer** (`desfazerOportunidades`): exclusão lógica das oportunidades do lote **que ninguém alterou depois** (sem auditoria além de `criar`, sem histórico além do da importação, sem atividade ligada além da retomada criada pelo lote); a retomada sai junto; a empresa que virou Cliente pela importação **não volta** sozinha (conta em "mantidas", com aviso no relatório). Recalcula a carteira das empresas afetadas.

## 7. Telas (`apps/web`)

- **Enviar:** a alternância ganha *Oportunidades*; dica da ordem recomendada.
- **Mapear:** seletor de **funil** (ativos; padrão marcado), as colunas da seção 4, a chave *"Conquistadas mudam a empresa para Cliente"* e, para cada coluna de cadastro mapeada (Fase, Motivo, Origem, Solução), a tabela de valores → cadastro com "pular"/"sem", igual à de Tipo das atividades. Motivo mostra só os motivos do status que aparece na linha.
- **Prévia, Importar, Relatório:** os componentes atuais, com os rótulos do tipo. No Relatório, o link de cada linha abre a oportunidade.
- **Botão "Importar planilha"** na tela Oportunidades (Kanban e Lista), só com `importacao.executar`, abrindo o assistente já no tipo.
- Tudo com os tokens e componentes do design system; sem layout novo.

## 8. Testes

- **Puros (shared):** `lerDinheiro` (formatos BR, US, R$, negativos, texto), `lerPercentual`, `lerStatus` (sinônimos, acento, inválido) e `decidirOportunidade` (cada regra da seção 3, inclusive motivo de outro status, suspenso sem "retomar em", probabilidade igual à da fase).
- **API:** lote misto (ativas em várias fases, conquistada, perdida, suspensa) comparado com a **mesma oportunidade criada pela rota manual** (campos, histórico, retomada, ponderado); duplicada; CNPJ fora da carteira; vendedor recebe 403; **isolamento** (lote do tenant A não enxerga empresa, funil, motivo nem membro do tenant B; `oportunidades.importacao_id` não vaza); dois executores no mesmo lote; desfazer (remove a intacta, mantém a editada, a movida de fase e a que ganhou atividade).
- **Regressão:** `oportunidades.test.ts` inteiro verde depois da extração da 6.1.
- **Tela:** mapeamento de valores por campo e o seletor de funil; **E2E**: importar 3 oportunidades e vê-las no Kanban, depois desfazer.
- **Carga:** 10.000 linhas em 1.000 empresas na máquina de desenvolvimento, medindo o lote e o desfazer (referência: 270 s e 5 s das atividades).

## 9. Fora deste plano (backlog)

- Atualizar oportunidade existente (*upsert*) e **ID externo** para reimportar do CRM antigo sem duplicar.
- Coluna Funil (vários funis no mesmo lote) e importação de **histórico de fases** (datas de cada mudança).
- **Atividade importada apontando a oportunidade** (coluna "Título da oportunidade" na importação de atividades): pequena, mas é mudança na outra importação; sugiro logo depois.
- Itens/produtos e mais de um contato (dependem de `oportunidade_itens` e `oportunidade_contatos`, fora do MVP).
- Criar origem, solução ou motivo que não existe a partir da planilha.

## 10. Perguntas em aberto (com a recomendação)

| # | Pergunta | Recomendação |
|---|---|---|
| 1 | Conquistada importada muda a empresa para Cliente? | Chave no passo Mapear, **desligada** por padrão |
| 2 | Um funil por lote ou coluna Funil? | **Um por lote** |
| 3 | Perdida sem motivo: pula ou entra com um motivo genérico ("Importação sem motivo")? | **Pula**, como o cadastro manual; a pessoa corrige e reimporta o CSV do que não entrou |
| 4 | Responsável vazio: vendedor da empresa ou quem importa? | **Vendedor da empresa** (regra do cadastro) |
| 5 | Duplicada por empresa + título + funil basta? | Sim no MVP; o ID externo resolve de vez (backlog) |

## 11. Execução (commits pequenos, cada um com os testes e `pnpm lint && pnpm typecheck && pnpm test` verde)

1. `refactor(api): regras de criar e fechar oportunidade reutilizáveis` (6.1, sem mudança de comportamento).
2. `feat(db): importação de oportunidades, migração 0041` (seção 5) + `modelagem_banco.md`.
3. `feat(shared): leitura e regras da importação de oportunidades` (6.2).
4. `feat(api): executor, prévia, valores e modelo da importação de oportunidades` (6.3 e 6.4, menos o desfazer).
5. `feat(api): desfazer lote de oportunidades`.
6. `feat(web): tipo Oportunidades no assistente de importação` (seção 7).
7. `test(web): E2E da importação de oportunidades` + `docs/roteiro_teste_importacao_oportunidades.md`, `funcionalidades.md` (seção 3, "Importação por planilha") e `escopo_mvp.md`.

Nenhuma variável de ambiente nova. Migração só de acréscimo, sem `BREAKING-DB`.

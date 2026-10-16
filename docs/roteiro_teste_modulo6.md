# Roteiro de teste: Módulo 6 (Oportunidades)

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Cada passo diz o que fazer e o que deve acontecer. O que não bater, anote a tela, o passo e o que apareceu.
> Use a empresa de teste e **2 ou 3 empresas** da carteira (de preferência uma com contato cadastrado). Para o item 14, um usuário **vendedor** e um **gestor**. Nada de dado de cliente real no repositório.

## Resumo dos roteiros
1. Menu e tela Oportunidades (Kanban e Lista)
2. Nova oportunidade e os valores (único, mensal, meses; total calculado)
3. Probabilidade: da fase, editada à mão e o aviso ao mover
4. Data prevista opcional ("sem previsão")
5. Arrastar e soltar entre fases (mouse, toque e teclado) e o menu do card
6. Fechar: Conquistada ("empresa vira Cliente" pela tag, mesmo renomeada)
7. Fechar: Perdida e Cancelada (motivo e fase em que parou)
8. Fechar: Suspensa (retomar em, atividade de retomada) e a janela "Suspensas"
9. Reabrir (não desfaz o Cliente)
10. Editar e excluir (só admin e gestor excluem)
11. Alerta de parada e próxima atividade no card
12. Oportunidade dentro da atividade
13. Ficha da oportunidade, aba na empresa e "Em aberto" na lista de Empresas
14. Quem vê e quem altera (vendedor, gestor, administrador)
15. Funis e fases: inativar, reativar e a regra de fase e funil
16. Celular
17. Layout (a página não rola; o quadro rola na horizontal por dentro)

## 1. Tela Oportunidades
1. No menu lateral, **Oportunidades** (no celular, **Funil**) abre o Kanban do **funil padrão**, com uma coluna por fase ativa (Qualificação, Diagnóstico, Proposta, Negociação), cada uma com a **contagem** e a **soma do total**.
2. Acima, o resumo: **N ativas · Total · Mensal · Ponderado**. À direita, o alternador **Kanban | Lista** e **Nova oportunidade**.
3. A **Lista** mostra qualquer status, com busca, filtro de Status e Responsável (some com um membro só), ordenação e a **paginação de 25, 50 ou 100** (a escolha é lembrada só nesta tabela). O cabeçalho das colunas **gruda no topo** e a tabela não rola por dentro.

## 2. Nova oportunidade e valores
1. **Nova oportunidade**: a empresa se escolhe pelo **campo de pesquisa** (nome ou CNPJ), sem lista aberta antes de digitar.
2. O **nome** vem sugerido como **Empresa – Solução** (ao escolher a solução) e você pode trocar.
3. Digite **Valor único R$ 2.000** e **Valor mensal R$ 500**, sem duração: aparece **Total do contrato R$ 8.000,00** (2.000 + 500 × **12 meses**, o padrão) e o **Ponderado**.
4. Digite **6** em Duração: o total vira R$ 5.000,00. **O total nunca é digitado.**
5. Valor negativo ou com mais de 2 casas é recusado. Salve: o card aparece na **primeira fase** com **R$ 8.000,00** e **R$ 500,00/mês**.
6. Abra a oportunidade (ficha) e confira: Total do contrato, Valor mensal × duração e Ponderado batem com o formulário.

## 3. Probabilidade
1. A dica diz "**Sugerida pela fase: 10%**". Salve sem digitar: o card mostra 10%.
2. Mova para **Proposta** (arrastando ou pelo menu): a probabilidade vira a da fase (**50%**), com o aviso "Movida para Proposta · Probabilidade 50%".
3. Edite a oportunidade e digite **90%** (a dica passa a "Editada à mão"). Mova para **Diagnóstico**: a probabilidade **continua em 90%** e o aviso diz "(editada por você). A sugerida desta fase é 25%".
4. Edite de novo e digite **25%** (igual à fase): volta a acompanhar a fase; ao mover, assume a da nova fase.

## 4. Data prevista
1. Crie uma oportunidade **sem data prevista**: o card diz **Sem previsão**. Com data futura: "Previsão dd/mm/aaaa"; **vencida**: em vermelho com "(vencida)"; **hoje**: em âmbar.
2. Na Lista, a coluna Previsão diz o mesmo. (As sem data ficam fora da previsão do mês, no Módulo 7.)

## 5. Arrastar e soltar
1. No computador, cada card tem a **alça** (seis pontinhos). **Arraste pela alça** até outra coluna: a coluna alvo ganha contorno tracejado, o card muda de fase e aparece o aviso.
2. Com o **teclado**: Tab até a alça, **Espaço** levanta, **setas** movem, **Espaço** solta, **Esc** cancela.
3. **Menu ⋯ do card** → "Mover para…" lista as fases (a atual marcada); funciona também no celular, onde não há arrastar.
4. Clicar no nome do card abre a ficha; a alça e o menu não abrem a ficha.
5. Cada fase tem o **+** (nova oportunidade já naquela fase).

## 6. Conquistada
1. Arraste um card até a zona **Conquistada** (aparece no rodapé enquanto você arrasta) ou use ⋯ → **Conquistada**.
2. O diálogo mostra o **valor total e o mensal** e o interruptor **"Mudar o Status da empresa para Cliente"**, já como a empresa configurou (ligado).
3. Confirme: o card sai do Kanban; a ficha da empresa passa de **Lead** para **Cliente**.
4. **Importante:** em Configurações → Tags, renomeie a tag **Cliente** para **Associado**. Conquiste outra oportunidade de um Lead: a empresa vira **Associado** (o sistema acha a tag pela chave interna, não pelo nome).
5. Com o interruptor **desligado**, o Status da empresa não muda.

## 7. Perdida e Cancelada
1. **Perdida** e **Cancelada** exigem o **motivo**, da lista do status (só os motivos que valem para ele). Sem motivo: "Escolha o motivo." e nada é gravado. Detalhe é opcional.
2. O diálogo avisa "Fica registrado que a oportunidade parou na fase X". Na ficha e na Lista, a oportunidade mostra **Parou em X**, o motivo e a data de fechamento.

## 8. Suspensa
1. **Suspensa** pede motivo e **Retomar em** (data de hoje para a frente; no passado é recusada).
2. Confirme: o botão **Suspensas · N** mostra a contagem; ao clicar, a janela lista cada suspensa com o **Retomar em** e o botão **Reabrir**.
3. Em **Atividades → Agendadas**, aparece **"Retomar: <nome da oportunidade>"**, tarefa de **dia inteiro na data escolhida**, com a **mesma empresa e o mesmo responsável**; ela também aparece como **próxima atividade** da empresa.

## 9. Reabrir
1. Na Lista (⋯ → **Reabrir**), na janela das suspensas ou na ficha: a oportunidade volta a **Ativa**, na mesma fase, sem motivo nem data de fechamento, e aparece "Reaberta" no histórico.
2. Reabrir uma **suspensa** cancela a tarefa de retomada que estava aberta.
3. Reabrir uma **conquistada não desfaz o Cliente**: a empresa continua Cliente (fica só o registro no histórico).

## 10. Editar e excluir
1. **Editar** (⋯ → Editar): muda título, contato, solução, origem, valores, probabilidade, data e responsável. Fase e status mudam só por mover e fechar.
2. **Excluir** (⋯ → Excluir, com confirmação) só aparece para **administrador e gestor**; é exclusão lógica. Excluir uma suspensa cancela a tarefa de retomada dela.

## 11. Alerta de parada e próxima atividade
1. Um card sem atividade há mais dias que o "dias para alerta" da fase (Configurações → Funis) ganha **contorno de alerta** e a frase **"Parada há N dias nesta fase"** (nunca só a cor).
2. Registrar uma atividade **realizada** ligada à oportunidade zera a contagem.
3. O card mostra a **próxima atividade** (ícone do tipo, título e data) ou **"Sem próxima atividade"** em destaque.

## 12. Oportunidade na atividade
1. No formulário **Registrar atividade → Mais opções**, o campo **Oportunidade** lista só as **ativas da empresa escolhida**. Trocar de empresa limpa a oportunidade.
2. A atividade aparece na aba **Atividades** da ficha da oportunidade e alimenta a próxima atividade e o alerta de parada.

## 13. Ficha, aba na empresa e "Em aberto"
1. A **ficha** (clicar no card) tem Resumo (dados e valores), **Atividades** e **Histórico** (criada, cada mudança de fase e cada fechamento, com quem fez e quando).
2. Na ficha da **empresa**: aba **Oportunidades** (abertas, conquistadas e perdidas, com status, valores e "Motivo: …" nas perdidas) e o botão **Nova oportunidade**.
3. Na lista de **Empresas**, a coluna **Em aberto** soma o total das oportunidades **ativas** da empresa (as fechadas e as excluídas não entram); sem oportunidade, "—".

## 14. Quem vê e altera
1. **Vendedor**: vê e altera só as oportunidades das empresas da **própria carteira**; não vê as dos outros; não atribui oportunidade a outra pessoa; não vê Excluir.
2. Com "Vendedores podem ver todas as empresas" ligado, o vendedor **vê** as dos colegas, mas sem alça de arrastar nem menu de ações.
3. **Gestor e administrador**: veem e alteram todas e podem atribuir o responsável.

## 15. Funis e fases
1. Em **Configurações → Funis e fases**, cada fase tem **Inativar / Reativar**. Fase inativa some do Kanban e das escolhas.
2. Fase com **oportunidades ativas**: nem inativa nem exclui ("mova antes").
3. Fase que **já teve** oportunidade (mesmo só fechada): **só se inativa**; excluir é recusado e o nome continua no histórico e em "parou em".
4. O funil precisa de **ao menos uma fase ativa**. Funil com oportunidades ativas não se inativa; funil que já teve oportunidade **só se inativa**.

## 16. Celular
1. A barra inferior diz **Funil**. O Kanban mostra **uma coluna por vez**, com deslize lateral; não há arrastar: **⋯ do card** move de fase e fecha.
2. O formulário e o diálogo de fechamento abrem como **folha que sobe do rodapé**.

## 17. Layout
1. A **página não rola**; só a área central rola, com o menu e a barra do topo parados. O **quadro do Kanban rola na horizontal por dentro** quando as colunas não cabem (nunca a página), e as colunas crescem com os cards (sem barra de rolagem em cada coluna).

---

## O que ficou de fora e por quê
| Item | Motivo |
|---|---|
| Itens da oportunidade e catálogo de produtos/serviços | Decisão do Ale: o MVP usa valores digitados (único, mensal e meses) |
| Campos personalizados da oportunidade | Decisão do Ale: fora do MVP |
| Filtros salvos (por usuário) | Decisão do Ale: fora do MVP |
| Exportação da lista | Fora do MVP (exportação em geral) |
| Mudar uma oportunidade de funil | Só se move de fase dentro do mesmo funil; trocar de funil fica para depois |
| Vários contatos na oportunidade | Só o contato principal (como o desenho da modelagem); os outros ficam para depois |
| Previsão do mês, conquistadas × perdidas e motivos de perda | Dashboard (Módulo 7) |
| E-mail e WhatsApp na oportunidade; comentários | Fases de integração |
| Notificação de oportunidade parada ou com previsão vencida | Central de notificações fora do MVP |
| "Retomar em" a partir do Kanban com a Tarefa já concluída | Reabrir cancela a retomada aberta; o caminho de volta é a janela "Suspensas" |
| Mais de 100 cards por coluna do Kanban | O quadro traz 100 por fase e avisa "e mais N"; a busca e a Lista alcançam o resto |
| Probabilidade padrão da fase ao conquistar (100%) | Não pedido: a conquistada guarda a probabilidade que tinha |
| Reativar a "fase em que parou" ao reabrir uma fase inativa | A reaberta volta para a primeira fase ativa do funil |

## Decisões
**Do Ale (16/10/2026):** arrastar e soltar com `@dnd-kit` (teclado e toque) e o menu do card no celular; itens, catálogo, campos personalizados e filtros salvos fora do MVP; valor único, valor mensal e **meses** digitados e **total calculado** (único + mensal × meses; ponderado = total × probabilidade) no banco; "Em aberto" = soma do total das ativas; probabilidade da fase, assumida ao mover **a menos que editada à mão** (com a marca e o aviso); data prevista opcional ("sem previsão", fora da previsão do mês); vendedor só nas empresas dele; reabrir não desfaz o Cliente; "empresa vira Cliente" pela **chave do sistema** (nunca pelo nome); exclusão só lógica e só de admin e gestor; retomada na data "retomar em", mesma empresa e responsável; Kanban rola na horizontal por dentro; a regra de fase e funil do Módulo 1 entra com teste.

**Do Claude (dentro do plano):**
- **Fase em que parou** = a fase atual ao fechar (também no Suspenso); só Ativa muda de fase ou fecha; para trocar de um fechamento para outro, reabre antes.
- **Retomar em** é obrigatório no Suspenso e não pode ser no passado (fuso da empresa); a retomada é uma **Tarefa de dia inteiro** ligada à oportunidade.
- **Fases têm `ativo`** (inativar e reativar em Configurações) para a regra "já teve oportunidade só se inativa".
- **Mover só dentro do mesmo funil.**
- **Alerta de parada:** conta a partir do maior entre a entrada na fase e a última atividade realizada ligada à oportunidade.
- **Kanban:** até 100 cards por coluna; ordem por data prevista (sem previsão por último) e depois a mais nova; as zonas de fechamento só aparecem enquanto se arrasta.
- **Arrastar pela alça** (não pelo card inteiro), para o card continuar clicável e o toque não brigar com a rolagem.
- A configuração "empresa vira Cliente ao conquistar" vem na oportunidade (`empresaViraClientePadrao`) para o fechamento abrir como a empresa configurou.
- A **atividade** ganhou o campo Oportunidade (da mesma empresa); "Mais opções" passou a existir para todos (Responsável só para admin e gestor).

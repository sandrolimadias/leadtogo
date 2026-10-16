# Roteiro de teste: Módulo 5 (Atividades)

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Cada passo diz o que fazer e o que deve acontecer. O que não bater, anote a tela, o passo e o que apareceu.
> Use a empresa de teste e **2 ou 3 empresas** da carteira (de preferência uma com contato cadastrado). Nada de dado de cliente real no repositório.

## Resumo dos roteiros
1. Menu: "Tarefas" virou "Atividades"
2. Registrar uma visita já realizada (e o efeito na carteira)
3. Visita conta como contato (e a tag Contactada vem das outras atividades)
4. Registrar e agendar próxima
5. Agendar uma atividade e a próxima atividade da empresa
6. Concluir uma atividade agendada
7. Data no futuro (tolerância de 5 minutos)
8. Editar, cancelar e excluir uma atividade realizada (recalcula)
9. Tarefa (sem empresa) e atividade de dia inteiro
10. Atrasadas e o fuso de São Paulo (22h e 00h30)
11. Tela Atividades: abas, filtros e paginação
12. Abas Atividades nas fichas da empresa e do contato
13. Responsável (admin, gestor e vendedor)
14. Desfazer importação não remove empresa com atividade
15. Celular
16. Layout (a página não rola)

## 1. Menu
1. No menu lateral, o item que era **Tarefas** agora é **Atividades** (mesma posição). No celular, a barra inferior diz **Atividades**.
2. Clique nele: abre a lista com as abas **Agendadas, Atrasadas e Realizadas**, cada uma com a contagem.

## 2. Registrar uma visita já realizada
1. Abra a ficha de uma empresa que **nunca foi visitada** (Última visita: "Nunca"). Clique **Nova atividade**.
2. O formulário abre com **Visita** escolhida, a **empresa já preenchida** (sem empresa, o campo **Buscar empresa** **não mostra nada até você digitar**; ao digitar, os resultados abrem como uma camada sobre os campos de baixo, **sem mudar o tamanho da janela**, achando por **nome ou CNPJ/CPF**, com ou sem máscara; **Trocar empresa** volta à busca), a situação **Realizada**, "Quando aconteceu" com a data e a hora de agora e o responsável padrão (você).
3. Clique em **Registrar atividade** sem preencher: aparecem "Informe o título.", e "Informe o resultado.". Nada é gravado.
4. Preencha **Título** e **Resultado** (a dica do Resultado diz que a visita atualiza a última visita e o último contato e aplica **Visitada**). Registre.
5. Na ficha: **Última visita: Hoje**, **Último contato: Hoje** e a tag **Visitada** aparece (e a lista de Empresas mostra a data).
6. O **Histórico** da empresa mostra "Tags alteradas" (Visitada, feita pelo sistema).

## 3. Visita conta como contato
1. No passo anterior o **Último contato** foi atualizado junto, mas a tag **Contactada não** apareceu (a visita aplica só a Visitada).
2. Registre uma **Ligação** realizada na mesma empresa: aparece a tag **Contactada** e o Último contato passa para a data da ligação. A Última visita **não muda**.

## 4. Registrar e agendar próxima
1. Em **Nova atividade**, preencha uma **Ligação** realizada (empresa, contato, título e resultado) e clique **Registrar e agendar próxima**.
2. A atividade é registrada e o formulário **reabre** com a **mesma empresa, o mesmo tipo e o mesmo contato**, situação **Pendente** e **data vazia**, e sem o campo Resultado.
3. Sem escolher a data, o botão avisa "Informe a data."; com a data, **Agendar atividade** grava.

## 5. Agendar e a próxima atividade
1. Agende duas atividades pendentes na mesma empresa, uma para daqui a 2 dias e outra para daqui a 20.
2. Na ficha, **Próxima atividade** mostra a de 2 dias. Na lista de Empresas, a coluna **Próxima atividade** também, e a empresa sai do chip **Sem próxima atividade**.

## 6. Concluir
1. Em **Atividades → Agendadas**, abra o menu de ações (⋯) da atividade de 2 dias e escolha **Concluir**.
2. O **Resultado é obrigatório**; "Quando aconteceu" começa em agora. Conclua.
3. A atividade vai para **Realizadas**; na empresa, a **Próxima atividade** passa a ser a de 20 dias e o Último contato (ou a Última visita, conforme o tipo) é atualizado.
4. Tente concluir de novo a mesma pelo menu: ela já não oferece "Concluir".

## 7. Data no futuro
1. Registre uma atividade **Realizada** com a hora **3 minutos à frente** da atual: é aceita (tolerância de 5 minutos, para celular com relógio adiantado).
2. Tente **1 hora à frente** (ou amanhã): recusa com "Uma atividade realizada não pode ter data no futuro", no campo da data, e o formulário fica aberto.
3. Uma atividade **Pendente** pode ter data futura.

## 8. Editar, cancelar e excluir uma realizada
Use uma empresa com **uma única visita realizada** (a de 2 dias atrás, por exemplo) e a tag Visitada.
1. **Editar** (⋯ → Editar): mude a data da visita para 40 dias atrás. A **Última visita** da empresa passa para essa data.
2. Registre uma segunda visita (há 5 dias) e **exclua** a mais antiga: a Última visita volta a 5 dias e a tag **Visitada continua**.
3. **Cancele** a que sobrou (⋯ → Cancelar atividade, confirmando): a **tag Visitada sai**, a Última visita volta a "Nunca" e a atividade aparece como **Cancelada** na linha do tempo (o resultado fica guardado).
4. Uma atividade **cancelada não oferece Editar nem Concluir**.
5. A tag **Contactada** continua enquanto houver uma Ligação realizada, mesmo cancelando a visita.
6. Trocar o **tipo** de uma visita realizada para **Tarefa** (Editar) tira a visita da empresa.

## 9. Tarefa e dia inteiro
1. Registre uma **Tarefa** sem empresa: o campo diz "opcional" e grava. Ela aparece em **Atividades** (e só para você, o gestor e o administrador).
2. Registre uma atividade **Pendente** com **Dia inteiro** ligado: o campo vira só a data, e a lista mostra "dia inteiro".
3. Uma Tarefa **realizada** não altera a visita nem o contato da empresa.

## 10. Atrasadas e o fuso
1. Agende uma atividade para uma hora que **já passou** (use a edição): ela aparece em **Atrasadas**, em vermelho, com a palavra **Atrasada**.
2. Uma de **dia inteiro de hoje** **não** está atrasada; a de **ontem**, sim.
3. O fuso da empresa é **America/Sao_Paulo**: uma atividade de dia inteiro registrada às **22h** de um dia e outra às **00h30** do dia seguinte ficam em **dias diferentes** (e não no mesmo dia, como ficariam em UTC).

## 11. Tela Atividades
1. Abas: **Agendadas** (abertas que ainda não passaram), **Atrasadas** e **Realizadas** (a mais recente primeiro); a contagem de cada aba acompanha o que você faz.
2. Filtros: **busca** (título, empresa ou contato, sem acento), **Tipo** e **Só as minhas**; **Limpar filtros**.
3. A **paginação** é a mesma das outras tabelas (25, 50 ou 100) e **lembra a escolha** só para esta tabela.
4. A tabela **não rola por dentro**: quem rola é a área central, e o cabeçalho das colunas **gruda no topo**.
5. Clique no nome da empresa ou do contato: abre a ficha.

## 12. Abas Atividades nas fichas
1. Na ficha da **empresa**: aba **Atividades** com a linha do tempo (as agendadas e atrasadas no topo, o histórico embaixo) e **Nova atividade**.
2. Na ficha do **contato**: aba **Atividades** com as atividades dele (e a empresa de cada uma). **Nova atividade** vem com o contato e a empresa principal dele.
3. A paginação dessas abas lembra a escolha à parte da tela Atividades.

## 13. Responsável
1. **Administrador e gestor** veem **Mais opções → Responsável** no formulário e escolhem outro vendedor.
2. O **vendedor** não vê essa opção: registra sempre para si mesmo. Ele só registra atividade em empresa da própria carteira e vê só as atividades das empresas que vê.
3. Com "Vendedores podem ver todas as empresas" ligado, o vendedor **vê** a atividade da colega, mas sem as ações (⋯).

## 14. Desfazer importação
1. Importe 2 empresas por planilha. Registre uma atividade em uma delas.
2. **Desfazer** a importação: a empresa **com atividade fica na carteira** ("Ficou na carteira" no relatório) e a outra sai.

## 15. Celular
1. No cabeçalho aparece o botão **+** (Registrar atividade); o formulário abre como **folha que sobe do rodapé**.
2. Na ficha da empresa, o botão **Atividade** fica ao lado de Ligar, WhatsApp e Rota.
3. A lista de Atividades vira cartões, com o menu ⋯ em cada um.

## 16. Layout
1. Em **Atividades** e nas fichas: a **página não tem barra de rolagem**, menu e topo ficam parados, só a área central rola, e o conteúdo fica centralizado em até 1440 px.

---

## O que ficou de fora e por quê (fica para depois do MVP; a lista completa está em `backlog_pos_mvp.md`)
| Item | Motivo |
|---|---|
| Oportunidade dentro da atividade | A tabela `oportunidades` só nasce no Módulo 6; a coluna entra lá |
| Vários contatos por atividade (N:N) | Decisão do Ale: um contato por atividade; a tabela N:N fica para depois |
| Lembretes ("Notificar em") | Dependem da central de notificações e do worker (fora do MVP) |
| Recorrência ("Repetir") | Idem; fora do MVP (`backlog_pos_mvp.md`) |
| Checklist, etiquetas e anexos | Servem ao Kanban de Tarefas e ao WhatsApp, fora do MVP |
| `id_externo` e check-in com GPS | Adiados pelo Ale; `origem` entra agora com o padrão "manual" |
| Situação "Em execução" na tela | Existe na API e no banco; a tela usa Realizada, Pendente e Cancelada (o Ale registra o que fez ou agenda) |
| Reabrir uma atividade cancelada ou realizada | Não pedido; para refazer, registra-se outra atividade |
| Validade da tag de visita (`dias_validade_tag_visita`) | Opcional na regra e sem tela de configuração; a tag só sai pelas atividades |
| Fuso da empresa editável pela tela | O fuso é `America/Sao_Paulo` (configuração da empresa no banco); a tela de escolha fica para quando houver outra empresa em outro fuso |
| Conclusão rápida no Dashboard e "Minhas atividades" | Módulo 7 (Dashboard) |
| Kanban de Tarefas | Fora do MVP (o menu "Atividades" cobre o dia a dia) |
| Notificação de atividade atrasada | Fora do MVP (central de notificações) |
| "Mais opções" do formulário: Oportunidade, Lembrete e Repetir | Oportunidade vem com o Módulo 6; Lembrete e Repetir dependem de notificações e worker (a tela só tem o Responsável em "Mais opções") |
| Datas nas listas no fuso da empresa | Hoje as telas usam o fuso do aparelho; só o cálculo de "hoje" e "atrasada" é do servidor, no fuso da empresa |
| "Próxima atividade" em vermelho nas listas de Empresas e fichas | A API informa a data; só a tela Atividades destaca a atrasada |
| Ações em massa na tela Atividades | Não pedido |
| Atividades no Histórico da empresa | O Histórico mostra as tags aplicadas pelo sistema; cada atividade tem a própria linha do tempo na aba Atividades |

## Decisões
**Do Ale (15/10/2026):** um contato por atividade; realizada sem data no futuro, com tolerância de 5 minutos; editar, cancelar ou excluir uma realizada recalcula tudo, e a tag só sai quando não resta nenhuma realizada do tipo; "Tarefas" vira "Atividades" com as abas Agendadas, Atrasadas e Realizadas; "Registrar e agendar próxima" reabre com a mesma empresa, tipo e contato, Pendente e data vazia; coluna `origem` agora; situação padrão Realizada e responsável padrão o usuário logado; fuso America/Sao_Paulo (nunca UTC); a visita também conta como contato.

**Do Claude (dentro do plano):**
- A data de uma atividade realizada é **quando aconteceu** (`realizada_em`); concluir uma agendada grava agora e mantém a data planejada.
- **Próxima atividade** = a aberta de menor data (inclusive uma atrasada); a Tarefa com empresa também conta.
- **Tags seguem o tipo**: Visita → Visitada; Ligação, WhatsApp, E-mail e Reunião → Contactada (a visita sozinha não aplica Contactada).
- **Cancelar** vale também para a realizada; a cancelada não se edita; excluir é lógico.
- **Quem vê e edita**: regra de carteira; o vendedor atribui só a si; a Tarefa sem empresa só o responsável, o gestor e o administrador veem.
- Empresa com atividade (mesmo excluída) **não sai** no desfazer da importação.
- A tela mostra as datas no fuso do aparelho; os cálculos de "hoje" e "atrasada" são do servidor, no fuso da empresa. Dia inteiro vai como meio-dia do dia escolhido para não depender do fuso do aparelho.
- A empresa do formulário é um **campo de pesquisa** (resultados só depois de digitar, como camada, sem mudar a janela), decisão do Ale em 16/10/2026 depois do primeiro teste.
- No celular o "+" fica no cabeçalho (e não flutuante), para não cobrir as linhas e a paginação.

# Roteiro de teste: Módulo 7 (Dashboard) ✅ aprovado pelo Ale em 16/10/2026

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Cada passo diz o que fazer e o que deve acontecer. O que não bater, anote a tela, o passo e o que apareceu.
> Para ver números de verdade, use a empresa de teste com **algumas oportunidades** (uma em cada fase, uma conquistada, uma perdida e uma cancelada, com valores mensais) e **atividades de hoje, atrasadas e dos próximos dias**. Para o item 9, **dois temas** (claro e escuro) e o celular. Nada de dado de cliente real no repositório.

## Resumo dos roteiros
1. Abrir o Dashboard (saudação, data e período)
2. Os quatro indicadores
3. Troca de período (Mês atual, Mês anterior, Trimestre)
4. Minhas atividades (Hoje, Atrasadas, Próximos 7 dias)
5. Conclusão rápida
6. Funil e previsão (gráfico, tooltip e clique)
7. Conquistadas × Perdidas e canceladas e Principais motivos de perda
8. Carteira (Status, novas e sem contato)
9. Tema escuro, teclado, leitor de tela e menos movimento
10. Os números batem com as telas
11. Quem vê o quê (vendedor)
12. Celular
13. Layout (a página não rola)

## 1. Abrir
1. **Dashboard** é a primeira tela depois do login (no celular, **Início**). Mostra a **data** de hoje, **"Bom dia / Boa tarde / Boa noite, <seu nome>"** e, à direita, o seletor de período.
2. Enquanto carrega aparecem esqueletos; se a API falhar, aparece o aviso vermelho com **Tentar de novo**.

## 2. Indicadores
1. **Previsão do período**: soma do **valor ponderado** das oportunidades **ativas** com **data prevista dentro do período**. A dica diz quantas são e **"N sem previsão"** (as sem data ficam de fora da soma).
2. **MRR conquistado**: soma do **valor mensal** das oportunidades **conquistadas no período** (pela data de fechamento), com a variação **sobre o período anterior** ("+18%", ou "sem base no período anterior" quando o anterior foi zero) e um **mini-gráfico dos últimos 6 meses**.
3. **Taxa de conversão** = conquistadas ÷ (conquistadas + perdidas); as **canceladas ficam fora**. Dica: "4 conquistadas × 2 perdidas". Sem fechamentos, mostra "—".
4. **Sem contato há 60 dias**: quantas empresas **Cliente e Prospect** estão sem contato há mais que o prazo da empresa (60 por padrão; vale o configurado em Configurações), **incluindo as que nunca tiveram contato**. **Ver as N** abre a lista de Empresas já filtrada.

## 3. Período
1. Escolha **Mês atual**, **Mês anterior** ou **Trimestre** (no celular, "Mês | Anterior | Trimestre"). O endereço guarda a escolha; recarregar mantém.
2. **Trimestre** é o do **calendário** (jan–mar, abr–jun, jul–set, out–dez). O **período anterior** do trimestre é o trimestre anterior; o do mês, o mês anterior (inteiro).
3. Os números mudam com uma **animação curta** nos gráficos (sem animação se o seu aparelho pede "reduzir movimento").
4. **Virada de mês no fuso da empresa** (America/Sao_Paulo): uma conquista fechada às **22h do último dia** conta no mês que acaba, e às **00h30 do primeiro dia**, no mês que começa, mesmo que em UTC já fosse o dia seguinte.

## 4. Minhas atividades
1. Abas **Hoje · Atrasadas · Próximos 7 dias**, cada uma com a **contagem**; só as **suas** (você como responsável).
2. As abas **não se sobrepõem**: **Hoje** = abertas de hoje que ainda não venceram (mais as de dia inteiro de hoje); **Atrasadas** = as vencidas; **Próximos 7 dias** = de amanhã até daqui a 7 dias.
3. Cada linha: ícone do tipo, título, marcas de importante e urgente, quando (em vermelho se atrasada), empresa (abre a ficha) e contato, e o botão de **Concluir**.
4. **Ver agenda** e **Ver todas as atividades** abrem a tela Atividades. Mais de 8 numa aba: "Mostrando 8 de N".

## 5. Conclusão rápida
1. Clique no ✓ de uma atividade: a linha **expande** com **Resultado** (obrigatório), **Cancelar**, **Concluir e agendar próxima** e **Concluir atividade**.
2. Sem resultado: "Informe o resultado." e nada é gravado.
3. **Concluir atividade**: a atividade sai da aba, o aviso "Atividade concluída" aparece e **os números do Dashboard se atualizam** (último contato, "sem contato", etc.).
4. **Concluir e agendar próxima** conclui e abre o formulário **com a mesma empresa, tipo, contato e oportunidade**, em Pendente e com data vazia.

## 6. Funil e previsão
1. **Seletor de funil** (só aparece se houver mais de um funil ativo). Barras horizontais por fase, **na cor da fase**, com a **quantidade** no tooltip e o **total** ao lado de cada barra. Só as oportunidades **ativas de hoje** (não dependem do período).
2. **Tooltip**: passe o mouse (ou toque, no celular) numa barra: título da fase, **Oportunidades**, **Total em R$** e **Do funil (%)**, mais "Clique para ver a lista". O cursor vira mãozinha.
3. **Clique** numa barra: abre **Oportunidades** em **Lista**, daquele **funil**, na **fase**, só as ativas, com o aviso "Filtrando por fase X". "Limpar filtros" volta à lista toda.
4. Fase sem oportunidade fica com barra mínima; funil sem nenhuma oportunidade ativa diz "Nenhuma oportunidade ativa neste funil.".

## 7. Conquistadas × Perdidas e canceladas e motivos de perda
1. **Conquistadas** e **Perdidas e canceladas** (no período): valor, quantidade e, nas conquistadas, o **MRR**. O gráfico de duas barras tem o tooltip (quantidade, valor, MRR; nas perdidas, quantas perdidas e quantas canceladas) e **clique** que abre a lista de Oportunidades (Conquistadas, ou Perdidas e canceladas) **fechadas no período**.
2. **Principais motivos de perda**: até 5 motivos, em barras horizontais, com a quantidade ao lado; o tooltip traz quantidade, valor e **percentual das perdas**; o **clique** abre as Oportunidades **perdidas e canceladas com aquele motivo, no período**.
3. **Mês do gráfico de MRR** (mini-gráfico do indicador): o clique abre as **conquistadas daquele mês**.
4. Sem fechamentos no período: "Nenhuma oportunidade fechada neste período." e "Nenhuma perda neste período.".

## 8. Carteira
1. **Barra empilhada** com o **Status das empresas da sua carteira**, nas **cores das tags**, com as contagens; os quatro botões de tag (com o **nome que a sua empresa deu**, como "Associado") levam à lista de Empresas **filtrada pelo Status**. O tooltip traz a quantidade e o percentual da carteira; o clique faz o mesmo.
2. **"N empresas novas no período"**: empresas cadastradas ou importadas no período (sem o texto de prospecção, que não existe no MVP).
3. **Sem contato há 60 dias**: lista (até 8) com nome, cidade, Status e **"N dias"** (ou **"Nunca"**), as nunca contatadas primeiro; **Ver as N** leva a Empresas com o filtro "Sem contato há 60 dias" (um botão mostra o filtro e o tira). Só **Cliente e Prospect**: Lead e Inativo não entram, e a **tag é achada pela chave do sistema** (renomear "Cliente" para "Associado" não muda nada).

## 9. Tema escuro, teclado, leitor de tela e menos movimento
1. Troque o tema (Claro, Escuro): **os gráficos acompanham** (as cores vêm dos tokens, sem nenhum valor fixo) e continuam legíveis.
2. **Teclado**: Tab passa pelos links e botões; os gráficos clicáveis têm, logo abaixo, uma lista de **links equivalentes** (escondida até receber o foco: "Oportunidades por fase", "Oportunidades perdidas por motivo", "Empresas por status"). Cada gráfico tem um resumo em palavras para o leitor de tela.
3. No sistema operacional, ligue **reduzir movimento**: os gráficos não animam ao trocar de período.

## 10. Os números batem com as telas
1. **Previsão**: some o ponderado das ativas com data prevista no mês na lista de Oportunidades.
2. **MRR conquistado**: some o valor mensal das conquistadas do mês (clique no mês do mini-gráfico).
3. **Perdidas e canceladas / motivos**: o clique abre exatamente as oportunidades contadas.
4. **Funil**: a contagem de cada fase é a do Kanban.
5. **Sem contato**: o "Ver as N" abre N empresas.

## 11. Quem vê o quê
1. O Dashboard é **"Minha visão"**: as oportunidades e atividades de que **você** é responsável e as empresas da **sua** carteira. Não há alternância Equipe.
2. Um vendedor vê só o que é dele; os números de outro vendedor não aparecem.

## 12. Celular
1. Indicadores em **2 × 2**; abas de atividades com os nomes curtos ("7 dias"); o período como "Mês | Anterior | Trimestre"; os blocos empilhados.
2. O **tooltip** abre ao **tocar** numa barra; tocar de novo (ou no cartão) leva à lista.

## 13. Layout
1. A **página não rola** (nem na horizontal); só a **área central** rola, com menu e barra do topo parados e o conteúdo centralizado em até 1440 px.

---

## O que ficou de fora e por quê
| Item | Motivo |
|---|---|
| Visão **Equipe** e por usuário específico | Só a visão "Minha" no MVP (um usuário) |
| **Período personalizado** (datas escolhidas) | Só Mês atual, Mês anterior e Trimestre |
| Resumo do **quadro de Tarefas** no rodapé de "Minhas atividades" | O Kanban de Tarefas está fora do MVP; entrou o atalho "Ver todas as atividades" |
| "Novos leads" por **origem** (quantos vieram da Prospecção) | A Prospecção não está no MVP; o bloco mostra só as empresas novas |
| **Comparativos** além da variação do MRR sobre o período anterior | Não pedido |
| Previsão que **inclui** as oportunidades sem data | Decisão: as sem data ficam fora da soma e aparecem como "N sem previsão" |
| **Exportar ou imprimir** o Dashboard | Fora do MVP |
| **Tempo médio por fase** e **conversão por fase** | O histórico de fases guarda os dados; não há tela |
| Clique no indicador de **Previsão** levando às oportunidades do mês | Não pedido (os cliques pedidos são os de fase, status, motivo e mês) |
| Gráfico em **tela cheia** e **legenda** configurável | Fora do MVP |

## Decisões
**Do Ale (16/10/2026):** taxa de conversão = conquistadas ÷ (conquistadas + perdidas), com as canceladas fora da taxa e dentro de "Perdidas e canceladas"; MRR conquistado = valor mensal das conquistadas no período, pela data de fechamento, com variação sobre o período anterior do mesmo tipo e os últimos 6 meses no mini-gráfico; trimestre do calendário (e o anterior é o trimestre anterior); previsão = ponderado das ativas com data prevista no período, sem data fora ("N sem previsão"); abas de atividades sem sobreposição; "sem contato" só Cliente e Prospect pelas chaves de sistema, com as nunca contatadas e o prazo da empresa; "novos no período" = cadastradas ou importadas, sem prospecção; o rodapé "Quadro de tarefas" sai e entra "Ver todas as atividades"; sem índice novo e sem migração; todos os números no fuso da empresa; **gráficos interativos com Recharts no padrão shadcn/ui Charts**, cores dos tokens, carregados só na rota do Dashboard, com tooltip (mouse, toque e foco), clique levando à lista filtrada (fase, status, motivo, mês) e animação que respeita "reduzir movimento".

**Do Claude (dentro do plano):**
- **Período anterior = o período inteiro anterior** (o mês anterior completo, o trimestre anterior completo), mesmo quando o atual ainda está no meio; por isso a variação do mês corrente costuma ser negativa até o fim do mês.
- **O funil mostra o retrato de hoje** (as ativas agora, por fase ativa), não o do período; o seletor de funil só aparece com mais de um funil ativo.
- A lista **"Sem contato"** mostra até 8, as **nunca contatadas primeiro** e depois as mais antigas; o botão "Ver as N" abre a lista de Empresas com o novo filtro `semContato` (mesma regra: Cliente e Prospect, salvo "Incluir leads").
- **Clique** em "Perdidas e canceladas" abre as perdidas **e** canceladas; em "Conquistadas", as conquistadas, sempre **fechadas no período**; a lista de Oportunidades ganhou os filtros fase, motivo, perdas e período de fechamento (com o aviso "Filtrando por …").
- Para o **teclado**, cada gráfico clicável tem uma **lista de links equivalente**, escondida até receber o foco (o Recharts não ativa o clique com o teclado).
- O **título da página** (`Dashboard`) fica só para o leitor de tela; o que se vê é a saudação.
- **Peso:** a biblioteca de gráficos vai num pedaço à parte (cerca de 382 KB, **108 KB comprimidos**), baixado só na rota do Dashboard; o pacote de entrada do app (198 KB comprimidos) não carrega o Recharts. Como o Dashboard é a primeira tela depois do login, na prática é o primeiro acesso que paga esse pedaço, uma vez só (depois fica no cache do navegador).
- **Correções que vieram junto, pedidas por você:** o executor da importação deixa de devolver "cancelada" quando o outro executor acabou de concluir o lote (era a causa de um teste intermitente), e tipos de atividade, motivos, origens e soluções **usados só se inativam** (a verificação que faltou nos Módulos 5 e 6).

# Roteiro de teste: Dashboard v2 (abas, períodos, associados e mapas)

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Plano em `plano_dashboard_v2.md`. Cada passo diz o que fazer e o que deve acontecer. O que não bater, anote a tela, o passo e o que apareceu.
> Para ver números de verdade, use a empresa de teste com **endereço cadastrado** (Configurações → Empresa, com a cidade), algumas **empresas em cidades diferentes do ES**, algumas com o Status **Associado**, **oportunidades** em fases diferentes (inclusive na **última fase** de cada funil, com data prevista neste mês), conquistadas e perdidas, e **atividades realizadas** (visitas e outras). Nada de dado de cliente real no repositório.

## Resumo dos roteiros
1. As duas abas
2. Minhas atividades
3. Período (Mês, Mês anterior, Trimestre, Semestre, Ano, anos anteriores e período específico)
4. Visão (Minha, Equipe, Empresa)
5. Previsão (fase final), vendas, MRR e conversão
6. Associados e churn
7. Visitas e atividades realizadas
8. Funil e resultado
9. Entradas e saídas de associados (listas)
10. Carteira: os dois mapas
11. Chamados e Portal do cliente
12. O que saiu
13. Celular, tema escuro e teclado
14. Os números batem com as telas

## 0. Endereço da empresa (antes de tudo)
1. Em **Configurações → Empresa** (só para o administrador), preencha o endereço e escolha o **Estado** e a **Cidade**; **Salvar** mostra "Dados da empresa salvos".
2. O CNPJ aparece, mas não muda por aqui. Quem não tem a permissão vê os dados só para leitura.
3. Volte ao Dashboard → **Resultados**: o quadro **Carteira** passa a mostrar os mapas do estado escolhido.

## 1. As duas abas
1. O Dashboard abre na aba **Minhas atividades**. A outra aba é **Resultados**.
2. A aba escolhida fica no endereço (`?aba=resultados`): recarregar mantém.

## 2. Minhas atividades
1. Mostra, nesta ordem: **Rota de hoje**, **Relatórios de visita pendentes**, **Chamados pendentes** (cada um só quando há o que mostrar) e **Minhas atividades** (Hoje · Atrasadas · Próximos 7 dias, com a conclusão rápida), agora na largura toda.
2. Esta aba **não tem** seletor de período.

## 3. Período (aba Resultados)
1. **Mês atual · Mês anterior · Trimestre · Semestre · Ano**: Trimestre e Semestre são os do calendário em que hoje cai; Ano é o ano atual inteiro. Abaixo da barra aparece o período em palavras ("2º semestre de 2026 · 01/07/2026 a 31/12/2026").
2. **Anos anteriores**: escolha um ano (os 10 anteriores) e os números passam a ser do ano inteiro.
3. **Período específico**: abre **De** e **Até**; **Aplicar**. Fim antes do início: "O fim vem antes do início."; mais de 3 anos: "O período tem no máximo 3 anos.".
4. As **variações** ("+15% sobre o período anterior") comparam com o intervalo **do mesmo tamanho logo antes** (mês → mês anterior, semestre → semestre anterior, ano → ano anterior, 10 dias → os 10 dias antes).
5. No celular, um seletor só **Período** com todas as opções (e "Personalizado…").

## 4. Visão
1. Admin e gestor (que veem todas as empresas) têm **Minha · Equipe · Empresa**; quem vê a equipe tem **Minha · Equipe**; o vendedor não vê o seletor (só os números dele).
2. **Minha**: as oportunidades e atividades de que você é responsável e as empresas da sua carteira. **Equipe**: você e quem está abaixo de você (pelo gestor no cadastro do usuário). **Empresa**: todos.
3. A visão vale para os cards, o funil, as listas e os mapas; a aba Minhas atividades é sempre a sua.

## 5. Previsão, vendas, MRR e conversão
1. **Previsão (fase final)**: soma do **valor total** das oportunidades **ativas** que estão na **última fase ativa de cada funil ativo** (somando todos os funis), com **data prevista no período**. A dica traz quantas são, o valor **ponderado** e quantas estão nessa fase **sem data prevista** (fora da soma).
2. **Vendas no período**: soma do **valor total** (único + mensal × meses) das **conquistadas** com data de fechamento no período, com a quantidade e a variação.
3. **MRR conquistado**: como antes; o mini-gráfico mostra 6 meses nos períodos curtos, os 6 do semestre, os 12 do ano e os meses do período específico.
4. **Taxa de conversão**: conquistadas ÷ (conquistadas + perdidas); as canceladas ficam fora.

## 6. Associados e churn
1. O card leva o **nome que sua empresa deu** ao Status Cliente (ex.: "**Associados**"). Valor: quantas empresas são associadas **no fim do período** (no período atual, agora). Dica: "+N novos · −M saíram" e **Ver empresas** (lista de Empresas com o Status).
2. **Churn** = quem **deixou de ser associado** no período ÷ associados **no início** do período. Sem associados no início: "—".
3. Conta pelo **histórico de Status** (quando a tag entrou e saiu), não pelo nome da tag. Quem entrou e saiu **dentro** do mesmo período não conta como novo nem como saída. Empresa **excluída** não conta como saída (exclusão é limpeza de cadastro).
4. Se o período começa antes do histórico, aparece o aviso "O histórico de associados começa em DD/MM/AAAA: antes disso, os números … são aproximados".

## 7. Visitas e atividades realizadas
1. **Visitas realizadas**: atividades **Realizadas** do tipo **Visita** no período (inclusive as "não localizadas"; canceladas e pendentes não contam).
2. **Atividades realizadas**: as Realizadas de **todos os outros tipos** (inclusive Tarefas), sem as visitas.

## 8. Funil e resultado
1. **Funil hoje**: as oportunidades ativas de hoje por fase (não depende do período), com o seletor de funil quando há mais de um. Tooltip e clique como antes.
2. **Conquistadas × Perdidas e canceladas** e **Principais motivos de perda**, no período, com os cliques para as listas.

## 9. Entradas e saídas de associados
1. Abas **Novos** e **Desassociados**, com as contagens.
2. **Novos**: nome (abre a ficha), cidade, vendedor, o **MRR** conquistado no período (se houver) e a data em que virou associada.
3. **Desassociados**: nome, cidade, vendedor, **quem tirou** (ou "Sistema"), o **Status de agora** e a data.
4. Mais de 8: **Ver todos (N)** abre o painel com a lista inteira, 50 por página.

## 10. Carteira: os dois mapas
1. O mapa é do **estado da sua empresa** (pelo endereço em Configurações → Empresa). Sem endereço: "Cadastre a cidade da sua empresa em Configurações → Empresa…" e, para o administrador, o link **Cadastrar o endereço**.
2. **Associados por município** (azul) e **Empresas no cadastro por município** (vermelho), lado a lado no computador e um embaixo do outro no celular. Quanto mais, mais escuro (até 5 faixas); município sem nenhuma, cinza claro.
3. **Legenda lateral**: as faixas (ex.: "3–4") e a lista de cidades da maior para a menor, com a **cor do mapa** e a quantidade; 10 de início e **Ver todas**. Rodapé: quantas estão **fora do ES**, quantas **sem cidade** e "Limites municipais: IBGE".
4. Passe o mouse num município (ou numa cidade da legenda): o contorno destaca e aparece "Vitória: 42 associados (12% do total)". **Clique** abre Empresas filtrada pela cidade (no azul, também pelo Status Associado; na visão Minha, só a sua carteira). No celular, o primeiro toque mostra o número e o segundo abre a lista.
5. A cidade usada é a do **cadastro** da empresa (não a posição do mapa de geolocalização). As empresas do mapa vermelho são as cadastradas **até o fim do período**, de qualquer Status.

## 11. Chamados e Portal do cliente
1. **Chamados** (só para quem vê as métricas): Chamados no período, Ainda abertos, Tempo até a 1ª resposta e Resolução no prazo, e **Ver métricas**.
2. **Portal do cliente** (só para quem vê o Portal): Em aberto e Prazo estourando (de agora), **1ª resposta no prazo** e **Nota média** (do período escolhido), e **Abrir o Portal**.

## 12. O que saiu
1. O card e a lista **"Sem contato há 60 dias"** não aparecem mais no Dashboard (o filtro "Sem contato" continua na lista de Empresas).
2. A barra **Carteira por Status** e "empresas novas no período" deram lugar aos mapas.

## 13. Celular, tema escuro e teclado
1. Celular: abas dividindo a largura, cards 2 × 2 (valores grandes não vazam), mapas e legendas empilhados; a página não rola na horizontal.
2. Tema escuro: as cores dos mapas e gráficos acompanham (vêm dos tokens).
3. Teclado: Tab passa pelas abas, pelos botões do período e pelas cidades da legenda (que destacam o município no mapa).

## 14. Os números batem com as telas
1. **Vendas**: o clique em Conquistadas abre as oportunidades somadas.
2. **Associados**: "Ver empresas" abre as empresas com o Status (na visão Minha, as suas).
3. **Mapa**: o clique numa cidade abre exatamente as empresas contadas nela.
4. **Chamados**: os números batem com Chamados → Métricas no mesmo intervalo.

---

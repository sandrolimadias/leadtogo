# Roteiro de teste: importação de oportunidades por planilha

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Use **planilhas inventadas** (nunca dados de clientes reais). Antes, tenha 2 ou 3 empresas **na carteira com CNPJ**. Plano e regras em `plano_importacao_oportunidades.md`. Anote a tela, o passo e o que apareceu em qualquer diferença.

## Resumo dos roteiros
1. Primeiro passo: tipo Oportunidades, botão na tela Oportunidades e "Baixar modelo"
2. Mapear colunas: funil, chave "vira Cliente" e os valores de Fase, Motivo, Origem e Solução
3. Prévia, importar e relatório
4. Oportunidades fechadas (conquistada, perdida, cancelada, suspensa)
5. Duplicadas, avisos e linhas puladas
6. Desfazer
7. Permissões e celular

## 1. Primeiro passo
1. **Oportunidades → Importar planilha** (ao lado de "Nova oportunidade") abre o assistente **já em Oportunidades**. O botão só aparece para administrador e gestor (no celular, não aparece, como em Contatos).
2. A alternância do envio tem **Empresas · Contatos · Atividades · Oportunidades**, e a dica fixa diz a ordem: **empresas → contatos → oportunidades → atividades**.
3. **Baixar modelo** em Oportunidades traz as colunas (só o CNPJ é obrigatório), **duas linhas de exemplo** (uma ativa e uma perdida; apague antes de importar) e a aba "Como preencher".
4. Oportunidades têm **5 passos** (Enviar · Mapear · Prévia · Importar · Relatório).

## 2. Mapear colunas
1. As colunas vêm ligadas pelos títulos (Título, Fase ou Etapa, Status, Motivo, Valor único, Valor mensal, Meses, Probabilidade, Data prevista, Origem, Solução, E-mails, Observações, Data de fechamento, Retomar em). Só o **CNPJ** é obrigatório.
2. **Funil e fechamento:** o funil padrão vem marcado. Trocar o funil **vale na hora** e esquece as fases que você apontou (elas eram do outro funil). Todas as linhas entram no mesmo funil.
3. **"Conquistadas mudam o Status da empresa para Cliente"** vem **desligada**. Ligue só se quiser que as conquistadas da planilha mudem o Status das empresas.
4. Para cada coluna de **Fase, Motivo, Origem e Solução** que você mapear aparece a lista dos valores da planilha, com quantas linhas cada um tem:
   - o valor com o **mesmo nome** de um cadastro (sem diferença de acento e maiúsculas) já vem escolhido;
   - aponte os outros (por exemplo, "Em proposta" → Proposta; "caro" → Preço);
   - Fase e Motivo sem escolha (ou "Pular essas linhas") **pulam** a linha; Origem e Solução sem escolha entram **vazias, com aviso** ("Deixar sem origem" não avisa).
   - O motivo mostra para quais status vale, por exemplo "Preço (Perdida)".

## 3. Prévia, importar e relatório
1. **Prévia:** quantas serão criadas, quantas pulam e por quê (as primeiras linhas com problema aparecem com o motivo), quantas entram com aviso e **quantas entram já fechadas**. Nada foi gravado.
2. **Importar N oportunidades** mostra o progresso e, no fim, o relatório (Oportunidades criadas, Já existiam, Puladas), com o **título da oportunidade** em cada linha.
3. **Ver oportunidades** abre o Kanban: as ativas estão nas **fases certas**, com o **total** calculado (único + mensal × meses; sem Meses e com mensal, 12 meses) e a **probabilidade da fase** (ou a da planilha, marcada como editada à mão).
4. Título em branco vira **"Empresa – Solução"** (ou só o nome da empresa). Responsável: o usuário do e-mail da planilha; sem ele, o **vendedor da empresa**. Contato: só pelo e-mail de um contato **vinculado** à empresa.
5. Valores aceitam "R$ 1.234,56", "1234,56" e "1.234" (mil). "mil reais" ou valor negativo pula a linha.

## 4. Fechadas
1. **Perdida, Cancelada, Suspensa** precisam do **Motivo** (de um que valha para o status). Sem motivo, ou com motivo de outro status, a linha **pula**.
2. Abra uma perdida importada: o histórico mostra **"Criada na fase X"** e **"Perdida (motivo), na fase X"**; os relatórios de onde se perde contam a fase em que parou.
3. **Data de fechamento** na planilha vale como a data de fechamento; sem ela, fica a data da importação (com aviso). Data no **futuro** pula a linha.
4. **Suspensa** exige **"Retomar em"** (hoje ou depois) e cria a **tarefa de retomada** nessa data, com a mesma empresa e o mesmo responsável, como no fechamento manual.
5. **Conquistada** com a chave desligada não muda o Status da empresa; com a chave ligada, a empresa vira **Cliente**.

## 5. Duplicadas, avisos e puladas
1. Oportunidade com o **mesmo título** (sem diferença de acento e maiúsculas), na **mesma empresa** e no **mesmo funil**, que já existe (ou que a planilha repete) é **pulada**: "Pulada: oportunidade igual já existe". A importação **nunca altera** o que já existe.
2. **CNPJ fora da carteira** pula ("CNPJ não está na carteira"); CNPJ em branco ou inválido pula como "sem CNPJ válido".
3. Status desconhecido, valor, meses, probabilidade ou data inválidos **pulam** com o motivo. E-mail inválido, data de fechamento em ativa, "Retomar em" em quem não é suspensa e motivo em ativa ou conquistada entram **ignorados, com aviso**.
4. **Baixar o que não entrou (CSV)** traz só as linhas puladas, com o motivo.

## 6. Desfazer
1. No relatório, **Desfazer importação** (até 7 dias) explica o que sai. Confirme.
2. Saem as oportunidades que o lote criou e **ninguém mexeu depois**, junto com a **tarefa de retomada** das suspensas.
3. **Ficam** as que alguém editou, moveu de fase, fechou, reabriu ou ligou a uma atividade (o aviso diz quantas).
4. A empresa que virou Cliente por uma conquistada **continua Cliente**.
5. **Desfazer um lote de empresas** não tira mais a empresa que tem oportunidade (a importada ou a cadastrada à mão).

## 7. Permissões e celular
1. Vendedor não vê o botão e não abre `/importacao/nova` (a API recusa).
2. Uma empresa não importa oportunidades para outra: CNPJ de outra empresa do sistema pula como "não está na carteira".
3. No celular (390 px), o envio e o mapeamento cabem na largura, sem rolagem lateral.

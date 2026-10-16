# Roteiro de teste: importação de contatos e de atividades por planilha

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Use **planilhas inventadas** (nunca dados de clientes reais). Antes, tenha 2 ou 3 empresas **na carteira com CNPJ** (importe-as pelo assistente de empresas ou cadastre-as). Anote a tela, o passo e o que apareceu em qualquer diferença.

## Resumo dos roteiros
1. Primeiro passo: alternância Empresas / Contatos / Atividades e "Baixar modelo"
2. Contatos: mapear, prévia, importar e relatório
3. Contatos: duplicados, avisos e linhas puladas
4. Contatos: desfazer
5. Atividades: mapear colunas e apontar os tipos
6. Atividades: prévia, importar e relatório (datas, fuso, situação)
7. Atividades: efeito na carteira da empresa
8. Atividades: desfazer
9. Lista de importações, botões nas listas e permissões
10. Celular e layout

## 1. Primeiro passo
1. **Contatos → Importar planilha** (e **Atividades → Importar planilha**) abre o assistente **já no tipo certo**. O botão só aparece para administrador e gestor.
2. No envio há a alternância **Empresas · Contatos · Atividades**. Ela traz o texto do que cada linha vira, as colunas (as obrigatórias com *) e a dica fixa: **empresas → contatos → atividades**.
3. **Baixar modelo** baixa o `.xlsx` do tipo escolhido: contatos e atividades vêm com **uma linha de exemplo** (apague antes de importar) e uma aba "Como preencher".
4. O tipo **fica fixo no envio**. Para mudar, envie outra planilha.
5. Contatos e atividades têm **5 passos** (Enviar · Mapear · Prévia · Importar · Relatório): não há Regras nem Carteira.

## 2. Contatos
1. Monte uma planilha com as colunas do modelo (CNPJ da empresa*, Nome*, Cargo, E-mail, Telefone, Celular/WhatsApp, Papel na decisão, Aniversário, LinkedIn, Principal, Não quer contato, Observações).
2. **Mapear colunas** já vem preenchido pelos títulos. Tirar o CNPJ ou o Nome desliga o botão e diz o que falta.
3. **Prévia:** mostra quantos contatos serão criados, quantos serão vinculados a um que já existe, quantos pulam e quantas linhas entram com aviso. **Nada foi gravado ainda.**
4. **Importar N contatos** mostra o progresso e, no fim, o **relatório** (contatos criados, vinculados, puladas), com o nome do contato em cada linha.
5. Os contatos aparecem em **Contatos**, ligados à empresa pelo CNPJ, com **cargo**, o primeiro telefone como principal, telefone em formato internacional e e-mail em minúsculas.

## 3. Contatos: duplicados, avisos e puladas
1. **Mesmo e-mail ou telefone de um contato que já existe:** a linha vira **"Vinculada a contato que já existia"**. Os dados do contato **não mudam** (nem o nome, nem os telefones); só entra o vínculo com a empresa da linha, com o cargo e o "principal" dessa linha.
2. Se o contato **já estava vinculado** àquela empresa: "Contato já estava vinculado" (nada muda). Vínculo que estava **inativo** é reativado, com aviso.
3. **"Não quer contato = sim"** num contato novo grava a opção de saída (WhatsApp e e-mail desligados) com origem **importação** e a data. Numa linha duplicada é **ignorado, com aviso**.
4. **"Principal = sim"** numa empresa que **já tem principal** não troca: avisa.
5. **Papel na decisão que não existe** (a comparação ignora maiúsculas e acento): o contato entra **sem papel** e a linha mostra o aviso.
6. **E-mail ou telefone inválido:** a linha **pula** ("Pulada: dado inválido") com o motivo. **Aniversário ou LinkedIn inválido:** o contato **entra sem o campo**, com aviso.
7. **CNPJ que não está na carteira** (ou inválido): a linha pula e o relatório diz qual.
8. **Baixar o que não entrou (CSV)** traz só as linhas puladas, com o motivo, para corrigir e reimportar.

## 4. Contatos: desfazer
1. No relatório, **Desfazer importação** (até **7 dias** depois de terminar). O diálogo explica o que sai.
2. Saem os contatos que o lote criou **e que ninguém alterou nem usou depois**; os vínculos que o lote criou com contatos que **já existiam** são inativados (o contato fica).
3. O que alguém **editou** depois, ou que já tem **atividade** ou **oportunidade**, **fica**: o resultado diz quantos.

## 5. Atividades: mapear e apontar os tipos
1. Colunas do modelo: CNPJ*, Tipo*, Título, Data* (dd/mm/aaaa), Hora, Situação, Resultado, E-mail do contato, E-mail do responsável, Importante, Urgente, Observações.
2. Abaixo das colunas aparece **Tipos de atividade**: cada **valor distinto** da coluna Tipo, com quantas linhas tem.
3. O valor que **tem o mesmo nome** de um tipo cadastrado (sem maiúsculas nem acento) vem **escolhido sozinho**. Para os outros (ex.: "Visita técnica"), **aponte um tipo** (ex.: Visita) ou escolha **Pular essas linhas**. Sem escolha, as linhas são puladas e listadas.

## 6. Atividades: prévia, importar e relatório
1. A prévia mostra criadas, "já existe", puladas por tipo sem correspondência, por data no futuro, por dado inválido e por CNPJ fora da carteira, e **quantas atividades ficam com você como responsável** (sem e-mail do responsável).
2. **Data e hora valem no fuso da empresa** (America/Sao_Paulo). **Sem hora = dia inteiro.** Confira uma atividade às **22:00** e outra às **00:30** do mesmo dia: continuam nesse dia na tela de Atividades.
3. **Situação em branco:** data passada = **Realizada**; data futura = **Pendente**; o dia inteiro de **hoje** = **Pendente**. Situação aceita Realizada/Pendente/Cancelada (e variações como "feita" e "agendada"); outro valor pula a linha.
4. **Realizada** exige o **Resultado** (a mesma regra do cadastro pela tela) e **não pode estar no futuro** (tolerância de 5 minutos): senão a linha pula, com o motivo. **Pendente** com Resultado: o resultado é ignorado, com aviso. **Cancelada** guarda o resultado.
5. **Título em branco** vira o nome do tipo.
6. **Atividade idêntica** (mesma empresa, tipo, data, hora e título) que já existe é **pulada** ("Pulada: atividade idêntica já existe"). Reenviar a mesma planilha não duplica nada.
7. **E-mail do contato:** só vale se o contato tem vínculo ativo com a empresa da linha; senão a atividade entra **sem contato** e a linha avisa. **E-mail do responsável:** de um usuário da empresa; senão (ou sem a coluna), quem importa; com e-mail que não é de usuário, a linha avisa.
8. As atividades criadas aparecem em **Atividades** com a origem **importação**.

## 7. Atividades: efeito na carteira
1. Numa empresa sem atividades, importe uma **Visita realizada** e uma **Ligação realizada**: a ficha da empresa passa a mostrar **última visita**, **último contato** e as tags **Visitada** e **Contactada**.
2. Importe uma **Pendente** com data futura: ela vira a **próxima atividade** da empresa.
3. O resultado é **igual ao de registrar as mesmas atividades pela tela** (há um teste automático que compara os dois).

## 8. Atividades: desfazer
1. **Desfazer importação** tira as atividades que o lote criou e que ninguém alterou depois; depois **recalcula** a última visita, o último contato, a próxima atividade e as tags de cada empresa afetada. A empresa volta a ficar sem visita e sem tag se não sobrou nenhuma.
2. A atividade que alguém **concluiu, editou ou cancelou** depois **fica** (conta em "ficaram").

## 9. Lista de importações, botões e permissões
1. **Importações** mostra o **tipo** de cada lote (selo) e tem o filtro **Todas · Empresas · Contatos · Atividades**. O resumo de cada lote fala de contatos ou de atividades ("30 criados · 5 vinculados · 5 puladas").
2. **Vendedor** não vê o botão **Importar planilha**, não abre o assistente (volta ao início) e a API recusa (403).
3. **CNPJ de outra empresa (de outro cliente do sistema)** é tratado como "não está na carteira": nada vaza.

## 10. Celular e layout
1. No celular, a alternância, o mapeamento, a prévia e o relatório cabem na tela, sem rolagem horizontal; a barra mostra "Passo N de 5".
2. A página nunca rola; só a área central.

---

## O que ficou de fora e por quê
| Item | Motivo |
|---|---|
| Atualizar contato ou atividade que já existe | Decidido: contato duplicado só é vinculado, sem mudar os dados; atividade idêntica é pulada |
| Ligar a empresa pelo nome (em vez do CNPJ) | Decidido: o vínculo é sempre pelo CNPJ |
| Mais de um telefone e um e-mail por contato | O modelo tem uma coluna de telefone, uma de celular e uma de e-mail |
| Atividade do tipo Tarefa sem empresa | O CNPJ é obrigatório |
| Oportunidade, lembrete, recorrência e vários participantes na atividade | Não existem no formulário manual do MVP |
| Contato da atividade por nome ou telefone | Decidido: só pelo e-mail |
| Reativar sozinho um vínculo inativo e avisar quem usa | Reativa e avisa na linha (como o cadastro manual); não há tela de conferência |
| Notificação de "importação concluída" no sino | A central de notificações está fora do MVP |
| Relatório completo em Excel | O CSV do que não entrou cobre a correção; o relatório inteiro está na tela |
| Recálculo da carteira em lote (uma consulta só) | Medido: não pesa (ver o relatório de entrega); fica registrado no backlog caso um dia pese |

## Decisões
**Do Ale (16/10/2026):** o vínculo é sempre pelo CNPJ; ordem recomendada empresas → contatos → atividades; limites de 10.000 linhas e 10 MB; só administrador e gestor; desfazer em 7 dias (`DIAS_PARA_DESFAZER`); contato duplicado é vinculado sem mudar os dados, com o cargo e o principal da linha; "Não quer contato" em duplicado é ignorado com aviso; "Principal = sim" não troca o principal que existe; papel inexistente entra sem papel e avisa (sem maiúsculas e acento); e-mail ou telefone inválido pula a linha; aniversário ou LinkedIn inválido entra sem o campo e avisa; atividade idêntica pulada; dia inteiro de hoje com situação em branco é Pendente; título vazio vira o nome do tipo; resultado em Pendente ignorado com aviso; situações aceitas (outras pulam); responsável pelo e-mail de qualquer usuário ativo, senão quem importa; blocos de 200 linhas com varredura final do recálculo; tipo fixo no envio.

**Do Claude (dentro do plano):**
- **Realizada sem Resultado pula** como "dado inválido": o cadastro pela tela exige o resultado e o banco também confere (corrigi um erro do meu plano, que dizia o contrário).
- **"Não quer contato" que não é sim nem não pula** a linha (é dado de privacidade: na dúvida, não importa). **"Principal", "Importante" e "Urgente"** que não são sim nem não viram "não", com aviso.
- **Vínculo inativo** de um contato com a empresa é **reativado** (como o cadastro manual) e a linha avisa; no desfazer volta a ficar inativo.
- **E-mail do responsável**: o aviso por linha só aparece quando o e-mail foi informado e não é de usuário; quando a coluna não existe ou está em branco, a **prévia** diz quantas atividades ficam com quem importa.
- **O desfazer** considera "alterado" o que mudou depois do fim do lote (data de atualização) ou tem registro de auditoria; contato com atividade ou oportunidade fica.
- **Dois executores** no mesmo lote não duplicam contato (trava por e-mail e telefone) nem atividade (trava pela chave da atividade).
- **Uma asserção de teste mudou:** o teste que esperava erro 400 para `tipo=contatos` passou a usar um tipo realmente desconhecido (`tipo=produtos`), porque `contatos` agora é válido.

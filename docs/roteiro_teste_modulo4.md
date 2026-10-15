# Roteiro de teste: Módulo 4 (Importação de planilha)

> Para o Ale testar em `crm.aledias.com.br` depois do deploy. Cada tela tem os passos e o que deve acontecer. O que não bater, anote a tela, o passo e o que apareceu.
> **A importação consulta a Receita de verdade** (um CNPJ por vez, com o intervalo escolhido). Use uma planilha **pequena** (10 a 15 linhas) com CNPJs reais de empresas que você aceite ter na empresa de teste. Nada de dados de clientes reais no repositório: a planilha fica só com você.

## Resumo dos roteiros
1. Preparar a planilha de teste e o perfil de regras
2. Enviar o arquivo (e baixar o modelo)
3. Mapear colunas
4. Regras
5. Prévia
6. Carteira e iniciar
7. Acompanhar a importação (e sair da tela)
8. Relatório e CSV do que não entrou
9. Importar mesmo assim
10. Empresa não ativa na Receita (o bloqueio vence o perfil)
11. Cancelar e retomar
12. Deploy no meio da importação
13. Desfazer a importação
14. Lista de importações
15. Quem pode importar (gestor e vendedor)
16. Celular

## Antes de começar
- Entre com o **administrador** na empresa de teste. Em **Configurações → Carteira**, deixe **"Bloquear o cadastro de empresa não ativa na Receita" ligado** (padrão).
- Monte uma planilha **.xlsx** (e uma cópia em **.csv**) com a primeira linha de títulos, por exemplo `CNPJ`, `Razão social`, `Telefone`, `Cidade`, `UF`, e **12 a 15 linhas** assim:
  - 6 a 8 CNPJs **ativos e válidos** que ainda **não** estão na carteira;
  - 1 linha **sem CNPJ**;
  - 1 linha com **CNPJ inválido** (dígitos trocados) e 1 com o CNPJ **sem os zeros à esquerda** (como o Excel deixa);
  - 1 CNPJ **repetido** na planilha;
  - 1 CNPJ que **já está** na carteira (cadastre antes pela tela Nova empresa);
  - se você conhecer uma empresa **baixada ou inapta**, inclua o CNPJ dela (roteiro 10);
  - dois ou três CNPJs de **CNAEs diferentes**, para o perfil recusar alguns.

## 1. Perfil de regras (Configurações → Importação)
1. Crie o perfil **"Teste"**: situação ativa ligada, só matriz, sem MEI, cole **3 ou 4 códigos de CNAE** (com e sem pontuação; os inválidos aparecem antes de salvar) e a ação **"Pular e listar no relatório"**.
2. Crie um segundo perfil **"Teste com tag"** igual, com a ação **"Importar com a tag Fora do perfil"**.
3. O resumo de cada perfil aparece em uma linha.

## 2. Enviar o arquivo (Empresas → Importar planilha)
1. Em **Empresas**, o botão **Importar planilha** aparece ao lado de **Nova empresa** (some para o vendedor).
2. **Baixar modelo** baixa um `.xlsx` com os títulos das colunas e uma aba "Como preencher".
3. Escolha um arquivo que **não é planilha** (uma imagem): a tela recusa e o botão fica desligado. Escolha um arquivo vazio: recusa também.
4. Escolha a sua planilha: aparecem o nome e o tamanho; **Trocar** desfaz a escolha. Preencha o **nome da importação** (ou deixe em branco: vale o nome do arquivo) e clique **Enviar e mapear colunas**.
5. Uma planilha **sem a linha de títulos**, ou com **duas colunas de mesmo nome**, é recusada com uma mensagem que diz o que corrigir.
6. Também dá para **arrastar** o arquivo para a área tracejada.

## 3. Mapear colunas
1. As colunas vêm **já sugeridas** pelos títulos (CNPJ, Razão social, Telefone...), com um **exemplo** de valor ao lado e o estado **Mapeada / Ignorada / Repetida**.
2. Em **De onde vêm os dados?** escolha entre **usar a planilha**, **buscar tudo na Receita** (basta a coluna do CNPJ) e **completar só os campos vazios**.
3. **Sem a coluna do CNPJ** mapeada, a tela avisa "Falta um campo obrigatório" e **Ver as regras** fica desligado. **Duas colunas para o mesmo campo** também bloqueiam, com o aviso "Repetida".
4. **Ver as regras** grava e avança. Volte (Voltar nas telas seguintes) e confira que as escolhas ficaram.

## 4. Regras
1. **Perfil de regras**: a lista mostra **Sem regras** e os perfis **ativos**; o resumo do perfil escolhido aparece embaixo.
2. **Intervalo entre consultas à Receita**: 3 segundos por padrão. Valor fora de 0,5 a 60 mostra o erro e desliga **Ver a prévia**.
3. O aviso explica que o **bloqueio de empresa não ativa** (Configurações → Carteira) vence qualquer perfil.

## 5. Prévia
1. Quatro contagens: **A importar, Já na carteira, Repetidas na planilha, Sem CNPJ válido**. As contas fecham com o total de linhas.
2. **Tempo estimado**: número de consultas à Receita (o que já está no cache de 30 dias não conta) e o tempo. Com a fonte **usar a planilha** e **Sem regras** (e o bloqueio desligado) a importação **não consulta a Receita** e a tela diz que termina em instantes.
3. **Linhas com problema** lista as primeiras (número da linha e o motivo, ex.: "CNPJ em branco").
4. Nada foi gravado até aqui.

## 6. Carteira e iniciar
1. **Vendedor** (você, já escolhido se for o único membro), **Status** (começa em **Lead**), **Vertical** (opcional) e **Origem** (começa em **Importação**).
2. O botão diz **Importar N empresas** (o N da prévia). Escolha o Status **Cliente** para esta rodada e clique.
3. A tela passa para o **progresso**. Se algo faltar, aparece o aviso "Falta algo para importar" e nada começa.

## 7. Acompanhar a importação
1. A **barra** anda com **"X de Y linhas"** e a estimativa do que falta; a tela atualiza sozinha.
2. **Saia da tela** (vá para Empresas) enquanto roda e **volte** pelo endereço (ou por Importações): o progresso continua de onde estava. Abra o mesmo link em outra aba: mostra o mesmo andamento.
3. Ao terminar, a tela passa **sozinha** para o relatório com o aviso verde **"Importação concluída"**.
4. Em **Empresas**, as empresas novas estão lá, com o Status escolhido, o vendedor e a origem **Importação**, e os dados completados pela Receita.

## 8. Relatório e CSV do que não entrou
1. O resumo mostra **Importadas, Fora do perfil, Puladas e Com erro**, e as contas batem com a prévia.
2. A lista mostra cada linha (número, empresa, resultado e o **motivo** em português) e os filtros por resultado (cada um com a contagem). Mais de 50 linhas: pagina.
3. **Baixar o que não entrou (CSV)** baixa um arquivo que abre direto no Excel em português (acentos certos, colunas separadas), com **Linha, Resultado, Motivo** e as colunas originais. Corrija e reimporte.
4. Uma linha cujo texto começa com `=` não vira fórmula no CSV baixado (aparece com um apóstrofo na frente).
5. **Ver empresas importadas** leva à lista de Empresas.

## 9. Importar mesmo assim
1. Refaça uma importação com o perfil **"Teste"** (ação *pular*): as empresas de CNAE fora da lista ficam como **Fora do perfil**, com o motivo da regra que não passou (por exemplo, o CNAE).
2. Em **Fora do perfil**, marque **uma** linha e clique **Importar mesmo assim (1 marcadas)**: só ela entra, com a tag **Fora do perfil**; as outras seguem fora.
3. Sem marcar nada, **Importar mesmo assim (todas as N)** importa as que restam.
4. Com o perfil **"Teste com tag"**, as fora do perfil já entram sozinhas, com a tag.
5. Uma empresa **não ativa na Receita** nunca entra por aqui (roteiro 10).

## 10. Empresa não ativa na Receita
1. Com o **bloqueio ligado**, uma empresa baixada/inapta/suspensa **não entra**, mesmo sem regras e mesmo com a ação "importar com a tag": aparece como **Pulada: empresa não ativa na Receita**, sem a opção de importar mesmo assim.
2. Desligue o bloqueio em Configurações → Carteira e reimporte uma planilha só com ela e **Sem regras**: agora entra. Um perfil com **situação ativa** ligado continua recusando.
3. Ligue o bloqueio de novo ao terminar.

## 11. Cancelar e retomar
1. Inicie uma importação (a planilha de 12 linhas basta, com intervalo de **10 s** para dar tempo) e clique **Cancelar importação**: o relatório mostra o aviso amarelo **Importação cancelada** e as linhas já feitas continuam na carteira.
2. **Retomar** continua só das linhas pendentes: nenhuma empresa é cadastrada duas vezes.

## 12. Deploy no meio da importação (só se quiser testar)
1. Com uma importação rodando, peça ao Claude para fazer um push qualquer (ou reinicie o worker no Coolify).
2. A importação **para na linha em curso e continua sozinha** quando o worker novo sobe, em até 1 ou 2 minutos, sem empresa duplicada nem linha perdida. Se o worker cair de vez, a varredura de cada minuto reenfileira o lote.

## 13. Desfazer a importação
1. No relatório de um lote **concluído**, a seção **Desfazer a importação** diz até quando vale (**24 horas** depois da conclusão). **Desfazer importação** pede confirmação.
2. Confirme: o lote vira **Desfeita** (aviso azul), as empresas que **ele criou** saem da carteira (some da lista de Empresas) e **as que já existiam antes não mudam**. O relatório continua.
3. Os CNPJs desfeitos podem ser importados ou cadastrados de novo.
4. Depois de desfeito, não há mais Desfazer nem Importar mesmo assim. Um lote com mais de 24 horas não mostra Desfazer (exclua as empresas pela carteira).

## 14. Lista de importações (Importar planilha → Ver as importações anteriores)
1. Cada lote mostra o **nome**, o **resumo** ("40 linhas · 30 importadas · 3 puladas..."), o arquivo, a data, quem importou e a **situação** (Concluída, Em andamento, Parou, Cancelada, Desfeita...).
2. Clicar no nome abre o lote no passo em que ele está (progresso ou relatório).
3. Lote que parou mostra o **motivo**.

## 15. Quem pode importar
1. O **gestor** vê o botão e importa. O **vendedor** não vê **Importar planilha**; se abrir `/importacao` pelo endereço, volta para o início (e a API recusa com 403).
2. Lote de **outra empresa**: "Importação não encontrada".

## 16. Celular (ou janela estreita)
1. Os passos viram "Passo N de 7" com uma barra; as colunas do mapeamento e as linhas do relatório empilham; o rodapé com os botões fica fixo.
2. O botão "Importar planilha" da lista de Empresas é só do computador (no celular, use o endereço `/importacao/nova` ou o botão da tela Importações).

---

## O que ficou de fora do Módulo 4 e por quê

| Item | Motivo |
|---|---|
| Importar **contatos** por planilha (a alternância Empresas / Contatos do protótipo) | O escopo do MVP só traz a importação de empresas; o contato vem pela ficha e pela conversão de sócio. O envio recusa `tipo` diferente de empresas |
| **Atualizar** empresa que já está na carteira, e **duplicado por nome ou telefone** | Decidido em 12/10/2026: o MVP deduplica só por CNPJ e **pula** a linha repetida, sem alterar (o protótipo previa "Atualizar / Criar nova") |
| **Baixar o relatório completo em Excel** | O CSV do que **não entrou** cobre a correção e a reimportação; o relatório inteiro está na tela, filtrável |
| **Notificação** "importação concluída" | A central de notificações está fora do MVP (o progresso e o relatório ficam na tela) |
| **Linhas de importação por CPF ou sem documento** | A importação é por CNPJ; CPF, texto e notação científica viram "sem CNPJ válido" (pulada e listada) |
| **Editar o perfil** de um lote já iniciado | O lote guarda uma **cópia das regras** usadas; mudar o perfil depois não altera lotes antigos |
| **Retomar do mesmo lote depois de desfeito** | Desfeito é definitivo; para repetir, envie a planilha de novo |
| **Desfazer depois de 24 horas** | Prazo do protótipo; depois disso, a exclusão é a da carteira (empresa a empresa) |
| **Aplicar tag em massa** nas empresas de um lote, e **filtrar a lista de Empresas por lote** | A coluna `empresas.importacao_id` já existe e o filtro é uma evolução simples, mas não foi pedido no escopo |
| **Tela de lotes no celular com ações** (cancelar, desfazer na lista) | As ações ficam no relatório do lote; a lista só mostra e abre |

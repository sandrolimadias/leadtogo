# Plano do Módulo Financeiro (Fase 4)

> **Status: em discussão com o Ale (chat de planejamento, 28/10/2026).** As decisões da seção 2 já foram dadas; as perguntas da seção 12 ainda estão abertas. Nada de código até o plano ser aprovado.
> **Referência de escopo:** o menu "Finanças" da Omie (contas correntes, lançamentos, contas a pagar e a receber, boletos, PIX, extrato, orçamento de caixa, pesquisa de títulos, movimentos financeiros e resumo), mais gateways de pagamento, plano de contas, DRE e relatórios gerenciais mês a mês.
> Quando aprovado, as regras vão para `funcionalidades.md` (seção nova) e as tabelas para `modelagem_banco.md`, no mesmo commit de cada fase.

## 1. Objetivo

O Leadtogo passa a ser o **financeiro gerencial completo** de cada empresa (tenant): é a fonte da verdade do caixa, de contas a pagar e a receber, da cobrança e da DRE. O ERP (Omie) deixa de ser necessário para o financeiro. O módulo serve ao Ale **e aos clientes do Leadtogo**, então nada pode ser específico de um segmento.

O que já existe e o financeiro aproveita:

| Peça | Onde | Como o financeiro usa |
|---|---|---|
| Empresas com CNPJ, CPF ou sem documento, consulta à Receita | `funcionalidades.md`, seção 3 | Clientes **e fornecedores** (tag de sistema "Fornecedor") |
| Itens da oportunidade com cobrança única/mensal/anual e meses | `funcionalidades.md`, seção 7 | Geram contrato e títulos a receber ao conquistar (seção 6) |
| MRR do Dashboard | `funcionalidades.md`, seção 9 | MRR contratado × MRR recebido |
| Painel consolidado da conta | `funcionalidades.md`, seção 10 | DRE e fluxo de caixa consolidados das empresas da conta |
| Portal do Cliente | `plano_portal_cliente.md` | Aba "Financeiro": títulos em aberto, 2ª via de boleto/PIX, notas fiscais |
| WhatsApp (Evolution), e-mail, notificações, Kanban de tarefas | `funcionalidades.md`, seções 9A e 13 | Régua de cobrança, alertas, tarefa de conciliação e de aprovação |
| Outbox, BullMQ, auditoria particionada, Garage, criptografia AES-256-GCM | `configuracao_tecnologia.md`, `modelagem_banco.md`, seção 11 | Webhooks, jobs de recorrência e reconciliação, anexos, credenciais do gateway |
| Item do backlog "situação financeira por tags" | `backlog_pos_mvp.md` | Passa a ser calculada pelo próprio financeiro, sem depender do ERP |

## 2. Decisões do Ale (28/10/2026)

| # | Decisão |
|---|---|
| F-D1 | **Financeiro gerencial completo** no Leadtogo (opção A): a Omie sai do financeiro |
| F-D2 | Atende o Ale **e os clientes** do Leadtogo: plano de contas, DRE e impostos genéricos e configuráveis |
| F-D3 | **Fornecedor é uma `empresa`** com a tag de sistema "Fornecedor" (reaproveita cadastro, consulta à Receita e contatos). Uma empresa pode ser cliente e fornecedor |
| F-D4 | **Regime tributário configurável no cadastro da empresa (tenant)** |
| F-D5 | Títulos da venda: **as duas opções, configuráveis**: gerados a partir da oportunidade conquistada **ou** lançados manualmente pelo financeiro |
| F-D6 | **NFS-e entra no escopo** |
| F-D7 | **ASAAS primeiro; Mercado Pago depois, sem esquecer** (fase própria na seção 11 e linha no `backlog_pos_mvp.md`) |

## 3. Conceitos

- **Conta financeira:** corrente, poupança/aplicação, caixa físico, cartão de crédito e **carteira do gateway**. O saldo no ASAAS (ou no MP) é uma conta: o recebimento cai nela e o saque é uma **transferência** para o banco. Assim a conciliação fecha centavo a centavo.
- **Título:** a receber ou a pagar, com uma ou mais **parcelas**. Toda parcela tem **três datas**: competência, vencimento e pagamento. A DRE usa a competência e o fluxo de caixa usa o pagamento.
- **Baixa:** quitação total ou parcial de uma parcela, com juros, multa, desconto e tarifa. Uma parcela pode ter várias baixas. Baixa errada se **estorna**, nunca se exclui.
- **Lançamento:** o movimento que mexe no saldo de uma conta (é o extrato). Baixas, transferências, tarifas e lançamentos avulsos (sem título) geram lançamentos.
- **Categoria:** uma conta do **plano de contas**. Título e lançamento podem ser **rateados** entre categorias e centros de custo (soma = 100% do valor).
- **Centro de custo:** opcional, para ver o resultado por área, unidade, projeto ou vertical.
- **Contrato:** a recorrência de uma venda (itens mensais/anuais), com vigência, dia de vencimento, forma de cobrança e reajuste. Gera as parcelas mês a mês.
- **Cobrança:** a parcela emitida num gateway (boleto, PIX ou cartão), com o identificador externo e o status do gateway.
- **Nota fiscal:** NFS-e emitida para uma parcela, para um título ou avulsa.

## 4. Funcionalidades básicas (equivalência com a Omie)

| Omie | Leadtogo |
|---|---|
| Contas Correntes | Cadastro de contas financeiras: banco, agência, conta, saldo inicial com data, cor, ativa, "entra no fluxo de caixa" |
| Contas Correntes - Lançamentos | Lançamentos avulsos e **transferências entre contas** (dois lançamentos ligados, categoria de sistema, fora da DRE) |
| Contas a Pagar - Lançamentos | Títulos a pagar: fornecedor, parcelas, recorrência (fixa mensal, como o aluguel), rateio, anexos (boleto, NF, comprovante), código de barras/linha digitável e chave PIX do fornecedor |
| Contas a Receber - Lançamentos | Títulos a receber: cliente, parcelas, rateio, origem (manual, contrato, oportunidade), vendedor |
| Contas a Receber - Boletos | Emitir, 2ª via, **prorrogar** e cancelar boleto no gateway |
| Contas a Receber - PIX | PIX com QR Code e copia e cola (no ASAAS, o mesmo boleto já traz o PIX) |
| Extrato de Conta Corrente | Extrato por conta e período com saldo dia a dia, status de conciliado e filtros |
| Orçamento de Caixa | Orçamento anual por categoria e mês; previsto × realizado |
| Pesquisar Títulos | Lista única de títulos a pagar e a receber, com filtros salvos (padrão do CRM) e ações em massa (baixar, prorrogar, emitir cobrança) |
| Movimentos Financeiros | Consulta de baixas, lançamentos e transferências |
| Resumo | Painel financeiro (seção 8.1) |

Além da Omie:

- **Conciliação bancária** por importação de **OFX** (e CSV como alternativa): casamento automático por valor, data e documento; o que sobra, o usuário casa, cria o lançamento ou ignora. Lançamentos do gateway chegam já conciliados pelo webhook.
- **Fechamento mensal:** fechado o mês, nada com data de competência ou pagamento naquele mês se cria, edita ou estorna sem **reabrir** (permissão própria, registrada na auditoria).
- **Aprovação de pagamentos (alçada):** títulos a pagar acima de um valor configurável ficam "aguardando aprovação"; quem lançou não aprova.
- **Anexos** no Garage, no mesmo pipeline dos chamados (antivírus, limites).

## 5. Plano de contas

- **Hierárquico, até 3 níveis**, com código (`4.2.05`), nome, natureza (receita ou despesa), **linha da DRE** e "entra no fluxo de caixa". Só o último nível recebe lançamentos.
- **Modelos padrão, escolhidos na ativação do módulo:** **Serviços** (com recorrência), **Comércio** e **Indústria**. O modelo é copiado para a empresa uma única vez (marca `financeiro_padroes_criados_em`, mesmo padrão do `padroes_criados_em`) e depois é **todo editável**.
- Regras herdadas do CRM: **conta usada só se inativa**; o que nunca foi usado pode ser excluído; o que o administrador excluiu não volta.
- **Contas de sistema (travadas, não se excluem nem mudam de natureza):** transferência entre contas, juros e multas recebidos, descontos concedidos, tarifas do gateway, ajuste de conciliação, saldo inicial.
- Copiável entre empresas da mesma conta (a "cópia de configurações" que já existe para outros cadastros).

Esqueleto do modelo **Serviços** (os outros mudam os grupos de custo):

```
1 Receitas operacionais            → Receita bruta
  1.1 Mensalidades / recorrência
  1.2 Implantação e serviços avulsos
  1.3 Venda de produtos
2 Deduções da receita              → Deduções
  2.1 Impostos sobre faturamento (DAS do Simples, ISS, PIS, COFINS, CBS, IBS)
  2.2 Cancelamentos e devoluções
  2.3 Descontos concedidos
3 Custos dos serviços prestados    → Custos (CSP)
4 Despesas operacionais
  4.1 Pessoal (salários, encargos, benefícios, pró-labore)
  4.2 Comerciais (comissões, marketing, tarifas de cobrança)
  4.3 Administrativas (aluguel, software, contabilidade, telefonia)
5 Resultado financeiro             → Receitas e despesas financeiras
6 IRPJ e CSLL                      → Impostos sobre o lucro
7 Não operacional                  → FORA da DRE, entra no fluxo de caixa
  7.1 Investimentos (CAPEX)
  7.2 Empréstimos (entrada e amortização)
  7.3 Aportes e distribuição de lucros
```

**Reforma tributária:** em 2026 as notas já destacam CBS e IBS (ano de teste) e, a partir de 2027, a CBS substitui PIS e COFINS, com o IBS crescendo até 2033. O plano de contas padrão já nasce com as linhas de CBS e IBS, e o cálculo de impostos (seção 7) depende do regime **e do ano**. As datas e alíquotas são revistas antes de cada fase com o contador.

## 6. Recorrência e vendas (as duas opções, F-D5)

Configuração da empresa **`financeiro_titulos_da_venda`**:

| Valor | Comportamento |
|---|---|
| `manual` | A conquista não gera nada; o financeiro lança títulos e contratos à mão |
| `rascunho` (**proposta de padrão**) | A conquista cria o **contrato em rascunho** com os itens da oportunidade; o financeiro revisa (vencimento, forma de cobrança, conta, categoria) e ativa |
| `automatico` | A conquista cria e ativa o contrato e gera os títulos, com os padrões da configuração |

- Itens com cobrança **única** viram um título a receber (com parcelamento opcional); itens **mensais/anuais** viram o **contrato**.
- O contrato tem vigência (início, fim ou indeterminado), dia de vencimento, forma de cobrança (boleto+PIX, PIX, cartão, transferência, sem cobrança), conta de destino, categoria e centro de custo, **reajuste anual** (IPCA, IGP-M, percentual fixo ou nenhum) e "emitir NFS-e automaticamente".
- **O Leadtogo é o dono da recorrência:** um job diário do BullMQ gera as parcelas com N dias de antecedência (configurável) e, se for o caso, emite a cobrança e a nota. **As "assinaturas" do gateway não são usadas**, para não haver dois estados a sincronizar.
- Cancelar o contrato cancela as parcelas futuras em aberto (e as cobranças no gateway); as vencidas continuam a receber.
- O vendedor e a oportunidade ficam gravados no título (base para comissão e receita por vendedor).

## 7. Regime tributário e impostos (F-D4)

Campos novos no cadastro da empresa (tenant):

- `regime_tributario`: `mei` · `simples_nacional` · `lucro_presumido` · `lucro_real`.
- Simples: **anexo** (I a V) e **fator R** (calculado ou informado). Presumido/Real: alíquotas de PIS, COFINS, IRPJ, CSLL e adicional.
- ISS: alíquota padrão, município, inscrição municipal, código do serviço (LC 116), CNAE e se o ISS é retido.
- CBS/IBS: alíquotas por ano (tabela de referência global, com edição por empresa).

Usos:

1. **Provisão de impostos:** ao fechar a competência, o sistema calcula o imposto estimado sobre o faturamento do mês e cria o título a pagar provisório (DAS, ISS etc.) para ser conferido com a guia do contador. A DRE mostra o imposto na competência certa, não quando foi pago.
2. Linhas de dedução da DRE conforme o regime.
3. Dados da NFS-e (seção 9.2).

O cálculo é **gerencial**: a apuração oficial continua com o contador. A tela diz isso.

## 8. Relatórios gerenciais (em tela, mês a mês)

Todos com filtro de empresa (ou consolidado da conta), período, centro de custo e regime (competência ou caixa), exportação em CSV e PDF, e **clique em qualquer número para ver os títulos ou lançamentos que o compõem**.

### 8.1 Resumo (painel)
Saldo de cada conta e o total; a receber e a pagar hoje, em 7 e em 30 dias; vencidos; resultado do mês × mês anterior; gráfico de saldo projetado em 90 dias; alertas (saldo projetado negativo, pagamentos aguardando aprovação, conciliação atrasada).

### 8.2 DRE
- **Modelo de DRE configurável:** linhas, subtotais e fórmulas, com as contas do plano mapeadas nas linhas. Vem pronto o **DRE gerencial**: Receita bruta → (−) Deduções → **Receita líquida** → (−) Custos → **Lucro bruto** → (−) Despesas variáveis → **Margem de contribuição** → (−) Despesas fixas → **EBITDA** → (±) Resultado financeiro → (−) Depreciação → **LAIR** → (−) IRPJ/CSLL → **Lucro líquido**.
- **12 colunas mês a mês mais o total**, com **AV%** (sobre a receita líquida) e **AH%** (sobre o mês anterior), e a opção **orçado × realizado** com a diferença.
- Competência por padrão e caixa como opção.
- **Consolidada** das empresas da conta (sem eliminação de operações entre elas na primeira versão; transferências entre empresas da mesma conta marcadas como tais para poderem ser eliminadas depois).

### 8.3 Fluxo de caixa
Realizado + projetado, por categoria e mês (12 meses) e uma **visão de 13 semanas** para o curto prazo. Projeção = títulos em aberto + contratos ativos + orçamento das categorias sem título.

### 8.4 Orçamento
Orçamento anual por categoria e mês (digitado, copiado do ano anterior com percentual ou do realizado), previsto × realizado com semáforo de desvio.

### 8.5 Contas a receber
- **Aging:** a vencer e vencidos por faixa (1–30, 31–60, 61–90, +90 dias), por cliente, vendedor e solução.
- **Inadimplência:** percentual do vencido sobre o faturado, mês a mês.
- **Receita por cliente, vendedor, solução e vertical** (o CRM e o financeiro juntos).
- **MRR contratado (contratos) × MRR recebido**, churn financeiro e receita perdida.

### 8.6 Indicadores
PMR, PMP, ciclo financeiro, ponto de equilíbrio, margem de contribuição, **runway** (meses de caixa com a despesa fixa média) e burn mensal.

## 9. Integrações

### 9.1 Gateways de pagamento (ASAAS primeiro, depois Mercado Pago)

**Arquitetura:** interface `ProvedorCobranca` com um adaptador por gateway:

```
criarOuAtualizarCliente · criarCobranca (boleto, pix, cartão) · consultarCobranca
prorrogar · cancelar · segundaVia · processarWebhook · listarMovimentos (reconciliação)
```

- **Credenciais por empresa**, criptografadas (AES-256-GCM, mesma chave dos tokens OAuth), nunca devolvidas ao front; modo **sandbox** e botão "testar conexão". Cada empresa usa a **própria conta** no gateway (o dinheiro nunca passa pelo Leadtogo).
- **Webhook:** `POST /v1/webhooks/{gateway}/{id-da-integracao}`, com o token ou a assinatura do gateway validados. O evento é gravado em `gateway_eventos` com **chave única pelo id externo (idempotência)** e processado na fila do BullMQ. O processamento faz a **baixa automática**, lança a **tarifa** do gateway como despesa (categoria de sistema) e notifica o responsável.
- **Reconciliação diária:** job que consulta os movimentos do gateway e cobre webhooks perdidos. Diferenças viram alerta, nunca baixa silenciosa.
- **Saque/repasse** do gateway para o banco vira transferência entre contas.
- **ASAAS (F3):** boleto com PIX na mesma cobrança, prorrogação, cancelamento, juros, multa e desconto por antecipação configurados na cobrança, notificações do próprio ASAAS **desligadas** (a régua é do Leadtogo).
- **Mercado Pago (F7, não esquecer):** PIX, boleto e cartão (link de pagamento). Diferença conhecida a confirmar na fase: o boleto do MP **não permite mudar o vencimento**, então "prorrogar" vira cancelar e emitir outro; o adaptador esconde isso da tela.

### 9.2 NFS-e (F-D6)

- Interface `EmissorNfse` (emitir, consultar, cancelar, baixar PDF e XML), com o primeiro adaptador **pelo ASAAS** (já integrado na F3 e sem contratação extra). Um emissor independente do gateway (por exemplo Focus NFe, PlugNotas ou NFE.io) fica como segundo adaptador para quem não usa o ASAAS: ver pergunta 1 da seção 12.
- **Padrão nacional da NFS-e** e campos de **CBS/IBS** considerados desde o início.
- Emissão manual (pela parcela ou pelo título) ou automática (configuração do contrato: ao emitir a cobrança ou ao receber).
- PDF e XML guardados no Garage e disponíveis no portal do cliente.
- Cancelamento dentro do prazo do município, com motivo.

### 9.3 Portal do Cliente
Aba **Financeiro** (com permissão por empresa): títulos em aberto e pagos, 2ª via de boleto/PIX atualizada, notas fiscais (PDF e XML). Segue as regras de isolamento do portal (políticas restritivas pela empresa-cliente e DTOs próprios).

### 9.4 Régua de cobrança
Passos configuráveis (ex.: 3 dias antes, no dia, 3, 7 e 15 dias depois), canal (e-mail e WhatsApp quando a integração estiver ativa), modelo de texto com variáveis (cliente, valor, vencimento, link da 2ª via) e parada automática quando o pagamento é confirmado. Cada envio fica registrado como atividade na empresa.

### 9.5 Tags de situação financeira
O item do backlog passa a ser alimentado pelo próprio financeiro: grupo de tags de sistema **Financeiro** (Adimplente; Inadimplente até 30, 31–60, 61–90 e +90 dias), recalculado no job diário e a cada baixa. A conexão com ERP deixa de ser pré-requisito.

### 9.6 Migração da Omie
Importação única (planilha ou API da Omie) do plano de contas, contas correntes, títulos em aberto e saldos iniciais, para trocar de sistema sem redigitar. Detalhada na fase F2.

## 10. Permissões, segurança e boas práticas

**Permissões novas** no catálogo de perfis de acesso (próxima versão do catálogo; só o Administrador recebe, os demais perfis por configuração):

| Permissão | O que libera |
|---|---|
| `financeiro.ver` | Painel, extratos, títulos e relatórios |
| `financeiro.lancar` | Criar e editar títulos, lançamentos e transferências |
| `financeiro.baixar` | Baixar, estornar, conciliar |
| `financeiro.aprovar` | Aprovar pagamentos acima da alçada |
| `financeiro.cobrar` | Emitir, prorrogar e cancelar cobranças e notas |
| `financeiro.configurar` | Plano de contas, contas financeiras, gateways, regime tributário, régua, fechar e reabrir mês |
| `financeiro.situacao_cliente` | Ver só a situação financeira (tags e títulos) das empresas da **própria carteira**: é o que o vendedor recebe; não dá acesso ao caixa |

Não confundir com o `papel_conta = financeiro`, que trata da cobrança da conta no próprio Leadtogo e não muda.

**Boas práticas embutidas:**

- Conciliação guiada: tarefa automática no Kanban do responsável quando a conciliação passa de N dias sem fazer.
- Segregação de funções: quem lança não aprova; alçada configurável.
- Estorno em vez de exclusão para tudo que já mexeu no saldo; fechamento mensal; auditoria completa (antes e depois).
- Comprovante obrigatório na baixa de pagamentos (configurável).
- Separação PJ/PF: categorias de pró-labore e distribuição de lucros, e alerta de lançamento sem categoria.
- Reserva de caixa: alerta quando o saldo projetado fica abaixo de N meses de despesa fixa.
- Dinheiro sempre em `numeric(15,2)`, cálculo no banco ou com decimal (nunca `number` de ponto flutuante no front), arredondamento de rateio e parcelas com a diferença na última parcela.

## 11. Fases

| Fase | Entrega |
|---|---|
| **F1** | Ativação do módulo (assistente: regime tributário, modelo de plano de contas, contas financeiras e saldos iniciais), tag "Fornecedor", plano de contas, centros de custo, títulos a pagar e a receber com parcelas e rateio, baixas e estornos, lançamentos avulsos, transferências, extrato, anexos, pesquisa de títulos, painel Resumo, permissões |
| **F2** | DRE (modelo configurável), fluxo de caixa (12 meses e 13 semanas), aging, relatórios mês a mês, fechamento mensal, provisão de impostos, importação da Omie |
| **F3** | **ASAAS**: credenciais, cliente, boleto+PIX, prorrogar, cancelar, webhooks, baixa automática, tarifas, reconciliação diária, 2ª via no portal |
| **F4** | Contratos e recorrência, `financeiro_titulos_da_venda` (manual, rascunho, automático), reajuste anual, régua de cobrança, tags de situação financeira, MRR contratado × recebido |
| **F5** | **NFS-e** (adaptador ASAAS; emissor independente se aprovado), notas no portal |
| **F6** | Conciliação por OFX/CSV, orçamento anual, aprovação de pagamentos, indicadores |
| **F7** | **Mercado Pago** (PIX, boleto e cartão), comissão de vendedores sobre o recebido, DRE consolidada com eliminações |

Cada fase termina em portão, como no portal: gate verde, CI verde, deploy, roteiro de teste e aceite do Ale. Migrações só de expansão.

**Tabelas previstas** (nomes provisórios, detalhados em `modelagem_banco.md` quando cada fase for aprovada; todas com `tenant_id`, RLS forçado, colunas padrão e teste de isolamento):

| Fase | Tabelas |
|---|---|
| F1 | `contas_financeiras`, `categorias_financeiras`, `centros_custo`, `titulos`, `titulo_parcelas`, `titulo_rateios`, `baixas`, `lancamentos`, `lancamento_rateios`, `transferencias`; colunas de regime tributário e de configuração do financeiro em `tenants`/`tenant_configuracoes` |
| F2 | `dre_modelos`, `dre_linhas`, `dre_linha_categorias`, `periodos_fechados`, `aliquotas_referencia` 🌐 |
| F3 | `gateway_integracoes` (credencial cifrada), `cobrancas`, `gateway_eventos` (único por gateway + id externo) |
| F4 | `contratos`, `contrato_itens`, `contrato_reajustes`, `reguas_cobranca`, `regua_passos`, `regua_envios` |
| F5 | `notas_fiscais`, `nfse_configuracoes` |
| F6 | `extratos_importados`, `extrato_linhas`, `conciliacoes`, `orcamentos`, `orcamento_valores`, `aprovacoes_pagamento` |
| F7 | `comissoes`, `comissao_regras` |

## 12. Perguntas em aberto

1. **Emissor de NFS-e:** começar só pelo ASAAS (sem custo extra, mas só para quem usa o ASAAS) ou já contratar um emissor independente (funciona com qualquer gateway, tem custo por nota)?
2. **Padrão de `financeiro_titulos_da_venda`:** `rascunho`, como proposto?
3. **Fornecedor nas telas comerciais:** empresa que é **só** fornecedor fica fora da carteira, do funil e do mapa por padrão?
4. **Cartão de crédito da empresa** (fatura com várias compras) entra na F1 ou depois?
5. **Comissões** (F7): sobre o recebido, com percentual por vendedor, por solução ou pelos dois?
6. **Ordem das fases:** o ASAAS (F3) antes da DRE (F2), para começar a cobrar mais cedo?

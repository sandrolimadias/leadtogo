# CRM Alessandro — Funcionalidades (Fase 1)

> Documento de definições funcionais do projeto.
> Status: **Aprovado (v1.7)** · Data: 13/10/2026
> 28/10/2026: §13.6 **Situação financeira** (adimplência alimentada pelo ERP via API aberta; Omie pelo n8n), decisões do Ale
> v1.7: **Módulo 2 (Empresas)**: decisões do Ale em 13/10/2026 sobre a lista, o cadastro, a ficha e o bloqueio de empresa não ativa (ver as seções "Decisões de 13/10/2026" abaixo; valem sobre o protótipo)
> v1.1: incluídas as integrações WhatsApp (Evolution API) e n8n
> v1.2: incluídos Tarefas (Kanban do vendedor), E-mail (registro, envio e rastreamento), Agendas Google/Microsoft e Central de notificações
> v1.5: **revisão pelo protótipo** (Claude Design, `docs/prototipo/`): navegação, filtros salvos, colunas da lista, diálogo de fechamento, formulário de atividade e indicadores do Dashboard
> v1.4: **multiempresa**: uma conta pode ter várias empresas; usuários com papel por empresa; painel consolidado
> v1.3: revisões da modelagem do banco: atividades e tarefas unificadas, Status da oportunidade separado da Fase, Solução, recorrência de produtos, Vertical, Prospecção (Minha Receita), vendedor = membro da equipe. Campos detalhados em `modelagem_banco.md`
> Complementa: `configuracao_tecnologia.md`
> **Escopo do MVP (12/10/2026):** o recorte do que entra primeiro, a ordem dos módulos e o que fica de fora estão em [`escopo_mvp.md`](escopo_mvp.md). As regras deste documento **não mudam**; o MVP só escolhe quais delas implementar primeiro.

---

## 1. Visão geral

CRM focado em **gestão de carteira**: a empresa é o centro de tudo. Contatos, atividades e oportunidades giram em torno dela. As atividades **não ficam presas à oportunidade**: o vendedor registra o relacionamento com o cliente mesmo quando não há negócio em andamento.

```
                    ┌──────────────┐
          ┌────────►│   EMPRESA    │◄────────┐
          │         │ (tags, resp.)│         │
          │         └──────┬───────┘         │
          │ N:N            │ 1:N             │ 1:N
   ┌──────┴─────┐   ┌──────┴──────┐   ┌──────┴────────┐
   │  CONTATOS  │   │ ATIVIDADES  │   │ OPORTUNIDADES │
   └────────────┘   └──────┬──────┘   └──────┬────────┘
                           │ opcional        │
                           └────────►────────┘
                     (atividade pode citar uma oportunidade)
```

### Telas principais
1. **Dashboard**
2. **Empresas**
3. **Contatos**
4. **Oportunidades** (Kanban + Lista)
5. **Tarefas** (Kanban pessoal do vendedor, customizável)
6. **Configurações** (cadastros auxiliares e integrações; acesso conforme o papel)
7. **Minhas conexões** (cada usuário conecta Google/Microsoft e WhatsApp)


### Navegação e layout (v1.5, do protótipo)
- **Desktop:** menu lateral (Dashboard, Empresas, Contatos, Oportunidades, **Atividades**; grupo Carteira com Prospecção e Rotas) *(Módulo 5: o item "Tarefas" virou "Atividades", com as abas Agendadas, Atrasadas e Realizadas; o Kanban de Tarefas, seção 9A, fica para depois do MVP)* **recolhível** para ícones, com a preferência salva por usuário. Seletor de empresa (multiempresa) no topo do menu.
- **Barra superior (29/10/2026):** busca global, botão **"+"** (em negrito) que abre o menu **Empresa · Contato · Oportunidade · Atividade · Chamado** (só os itens que o perfil de acesso permite; substitui o antigo "Registrar atividade"), botão de ajuda **"?"** (por enquanto anuncia que as orientações e os vídeos da tela atual vêm em breve; será o sistema de ajuda por tela) e sino de notificações (de todas as empresas, identificadas pela empresa). No celular, o "+" e o "?" ficam no cabeçalho.
- **Celular:** cabeçalho com título, busca e notificações; **barra inferior** com Início, Empresas, Funil, **Atividades** e Mais; **botão "+"** (no cabeçalho) para registrar atividade; o seletor de empresa fica na folha de perfil.
- Temas claro e escuro (padrão: o do sistema), com a escolha salva por usuário.
---

## 2. Tags e grupos de tags

Todas as tags são **cadastráveis** e têm **cor customizável**.

### Grupo de tags
| Campo | Descrição |
|---|---|
| Nome | Ex.: Status, Visitação, Interesse |
| Seleção | **Única** (a empresa só pode ter uma tag do grupo) ou **Múltipla** |
| Obrigatório | Se toda empresa precisa ter uma tag desse grupo |
| Ordem | Ordem de exibição |
| Sistema | Grupos criados pelo sistema não podem ser excluídos, apenas editados (nomes e cores das tags) |
| **Aplica a** | **Empresas**, **Contatos** (29/10/2026) ou **Oportunidades** (31/10/2026). Escolhido na criação e não muda depois. As tags de um grupo de contato só valem para contatos e nunca aparecem nas telas de empresa (lista, ficha, mapa, importação, visitas, API pública); as de empresa nunca aparecem para contatos; as de oportunidade só valem para oportunidades |

### Tag
| Campo | Descrição |
|---|---|
| Nome | Ex.: Lead, Cliente |
| Grupo | Grupo ao qual pertence |
| Cor | Seletor de cor (fundo e texto calculado para contraste) |
| Ordem / Ativa | Organização e inativação sem perder o histórico |

### Grupos padrão (criados para cada novo tenant)
| Grupo | Seleção | Tags iniciais |
|---|---|---|
| **Status** | Única, obrigatório | Lead · Prospect · Cliente · Inativo |
| **Visitação** | Múltipla, automático | Visitada · Contactada |

> O antigo grupo "Segmento" foi substituído pelo campo **Vertical** da empresa (cadastrável, uma por empresa).

### Regras
- Trocar uma tag de grupo de seleção única **substitui** a anterior, e a mudança fica no histórico. Assim é possível medir quantos leads viraram clientes e quando.
- **Proteções do sistema (v1.6, Módulo 1):** os grupos **Status** e **Visitação** só podem ser renomeados (a seleção e o "obrigatório" não mudam, e não se inativam nem excluem); Visitação é **automático**, então não aceita tags novas. As tags `lead`, `cliente`, `visitada` e `contactada` são usadas pelas regras (importação, "empresa vira Cliente", controle de visitadas e contactadas): podem ser renomeadas e recoloridas, mas **não inativadas nem excluídas**. **Prospect** e **Inativo** não têm regra e podem ser inativadas ou excluídas.
- **Tag em uso não se exclui (v1.6):** uma tag aplicada a alguma empresa, **agora ou no histórico de Status**, só pode ser **inativada**; a exclusão fica para tags que nunca foram usadas (caso particular da regra geral da seção 11). Isso preserva o histórico de conversão (quantos Leads viraram Clientes e quando). Vale também para o grupo que contém tags em uso.
- Filtros por tag em todas as listas (combinação **E / OU**).
- **Automação opcional (configurável):** ao ganhar uma oportunidade, mudar o Status da empresa para *Cliente*.
- **Tags de contato (29/10/2026; plano em `plano_contatos_filtros_e_tags.md`):** *Configurações → Tags* tem as abas **Empresas** e **Contatos**. Grupo de contato tem seleção única ou múltipla, **não é obrigatório nem automático** e nenhum nasce pronto (o admin cria). O nome do grupo é único entre os dois destinos. Um contato pode ter várias tags. Tag ou grupo usado por algum contato (mesmo excluído) só se inativa, como nas empresas. Não há histórico de conversão: a mudança fica na auditoria do contato (aba Histórico, "Tags alteradas").
- **Tags de oportunidade (31/10/2026; plano em `plano_oportunidades_kanban_e_tags.md`):** *Configurações → Tags* ganha a aba **Oportunidades**. Mesmas regras das tags de contato: seleção única ou múltipla (padrão múltipla), **não obrigatório nem automático**, nenhum grupo nasce pronto, nome do grupo único entre os três destinos, várias tags por oportunidade e tag ou grupo usado (mesmo por oportunidade excluída) só se inativa. A mudança fica na auditoria da oportunidade (`alterar_tags`). Onde aparecem e onde se aplicam: seção 7.

---

## 3. Empresas

### Cadastro
| Campo | Observação |
|---|---|
| Razão social / Nome fantasia | Nome fantasia é o nome de exibição |
| CNPJ, CPF ou sem documento | CNPJ único por tenant, com validação (**inclui o CNPJ alfanumérico**) |
| **Consulta CNPJ automática** | API **Minha Receita** (minhareceita.org), com alternativa em caso de falha. Preenche os dados abaixo |
| Matriz ou Filial | Filial ligada automaticamente à matriz pela raiz do CNPJ |
| MEI · Porte · Regime tributário | Da Receita (regime editável: MEI, Simples, Presumido, Real…) |
| Data início atividades | Da Receita |
| CNAE principal e secundários | Tabela única de CNAEs (sem duplicados) |
| Sócios | Nome e qualificação; botão **"Converter em contato"** |
| Endereço | CEP, tipo + logradouro, número, **complemento**, bairro, cidade, estado, país |
| Geolocalização | Latitude e longitude, preenchidas na fase de geolocalização |
| Telefones (vários) | Fixo, celular e WhatsApp |
| Website | |
| **Vendedor** | Membro da equipe dono da carteira |
| **Vertical** | Cadastrável (uma por empresa) |
| Nº de funcionários / Faixa de faturamento | Faixas cadastráveis (+ número exato opcional) |
| Tags | Status, Visitação e demais grupos |
| Data de registro | Data de cadastro no CRM (automática) |
| Observações | Texto livre |
| **Tags** | Várias, dos grupos de tags de contato (seção 2). Escolhidas no cadastro, na edição ou em **"Editar tags"** na ficha; quem edita o contato edita as tags |
| Campos personalizados | Ver seção 8 |

**Atualizar pela Receita:** um botão mostra campo a campo o valor atual e o da Receita, e o usuário escolhe o que aplicar. Uma rotina mensal consulta novamente a situação cadastral e **avisa** se a empresa estiver baixada, inapta ou suspensa.

### Campos calculados automaticamente
| Campo | Origem |
|---|---|
| **Última visita em** | Última atividade concluída de tipo que conta como *Visita* |
| **Último contato em** | Última atividade concluída de tipo que conta como *Contato* (ou visita) |
| Próxima atividade | Próxima atividade agendada |
| Oportunidades abertas | Quantidade e valor total |

### Controle de visitadas e contactadas
- Ao **concluir** uma atividade, o sistema atualiza a data e aplica a tag automaticamente:
  - tipo marcado como *Visita* → tag **Visitada** + `última visita em`
  - tipo marcado como *Contato* → tag **Contactada** + `último contato em`
- **Validade configurável** (opcional): remover a tag depois de X dias sem nova visita ou contato (ex.: 180 dias). Isso mantém a tag como retrato atual da carteira.
- Filtros prontos: *Nunca visitadas*, *Sem visita há X dias*, *Sem contato há X dias*. São a base da roteirização (G4, seção 3D: montar a rota pelos filtros do mapa).

### Tela Empresas (lista)
- Tabela com busca (nome, CNPJ, cidade), filtros (tags, responsável, cidade/UF, última visita/contato, campos personalizados) e ordenação.
- **Filtros salvos.**
- Tags exibidas como "chips" coloridos.
- Ações em massa: aplicar/remover tag, trocar responsável, exportar.
- No celular: lista em cards, com botões de **ligar**, **WhatsApp** e **rota** (abre o Maps).

**Detalhes definidos no protótipo (v1.5)**
- **Filtros salvos padrão** (chips no topo): Todas · Minha carteira · Sem visita há 90 dias · Nunca visitadas · **Sem próxima atividade**, cada um com contagem.
- **Barra de filtros:** busca (nome, CNPJ, cidade, sem acento) + Status, Visitação, Vendedor, Cidade, Última visita (últimos 30 dias / sem visita há 60 / há 90 / nunca). "Limpar filtros" aparece com qualquer filtro ativo.
- **Aplicar tag em massa** respeita grupos de seleção única (aplicar um Status substitui o atual).

**Decisões de 13/10/2026 (v1.7): lista (valem sobre o protótipo)**
- **Colunas:** Empresa (nome + CNPJ) · **Tags (todas, sem "+N", quebrando linha)** · Cidade · Última visita (alerta a partir de 90 dias ou nunca) · Último contato (alerta a partir de 60 dias, ou o que a empresa configurou) · **Próxima atividade** (ou "Sem próxima atividade" em destaque). **Sem a coluna Vendedor.** A coluna "Em aberto" fica **oculta até o Módulo 6** (Oportunidades).
- **Chips:** os três últimos (*Sem visita há 90 dias*, *Nunca visitadas*, *Sem próxima atividade*) e as contagens consideram **por padrão só Status Cliente e Prospect**, com a opção **"Incluir leads"**; *Todas* mostra tudo.
- O filtro **Vendedor** e o chip **Minha carteira** ficam **ocultos** quando a empresa tem um único membro ativo.
- Filtros e busca ficam **na URL**. A busca encontra por pedaço do nome, razão social, documento (com ou sem máscara) e cidade, sem acento.
- Ações em massa: **Aplicar tag** (única ação desta fase; Trocar vendedor e Exportar ficam para depois). Só no desktop e no tablet; marca só o que o usuário edita.
- Celular: cartões com **Ligar, WhatsApp e Rota**; "Importar planilha" só aparece com o Módulo 4.

**Decisões de 29/10/2026: lista (valem sobre as anteriores)**
- **Chips:** Todas · Minha carteira · Nunca visitadas · Sem próxima atividade. O chip *Sem visita há 90 dias* **saiu da tela** (a API ainda o aceita; link antigo cai em *Todas*).
- **Filtros:** Status, Visitação, Vendedor, Cidade, **Porte** (Micro Empresa, Empresa de Pequeno Porte, Demais, Não informado; "Não informado" inclui quem não tem porte) e **Regime tributário**. O filtro **Última visita saiu**. Porte e regime filtram mesmo sem aparecer como coluna. A grade de filtros se ajusta à largura e não passa do fundo (tablet).
- **Colunas:** Empresa · Tags · **Cidade** · **Estado** (UF, em colunas separadas) · Último contato · Próxima atividade. **Saíram Última visita e Em aberto.**
- **Tags na ordem dos grupos:** na lista e na ficha, as tags seguem a ordem dos grupos de *Configurações → Tags* (setas ↑ ↓ de cada bloco) e, dentro do grupo, a ordem das tags.
- **Celular:** só a busca na linha; abaixo, o botão **Filtros** (com a quantidade ativa) abre os filtros um embaixo do outro e vira **Fechar filtros** para recolher a seção. O "+ Nova empresa" da linha saiu: fica no **+** do topo.

### Tela Empresa (detalhe)
- Cabeçalho: nome, tags, responsável, última visita/contato e ações rápidas (nova atividade, nova oportunidade, ligar, WhatsApp).
- Abas:
  1. **Resumo** — dados cadastrais e campos personalizados
  2. **Contatos** — vinculados à empresa
  3. **Atividades** — linha do tempo (agendadas no topo, histórico abaixo)
  4. **Oportunidades** — abertas, ganhas e perdidas
  5. **Histórico** — log de alterações (auditoria)

**Detalhes definidos no protótipo (v1.5)**
- Cabeçalho com badges **Matriz/Filial** e **situação na Receita** ("Ativa na Receita"). A situação é lida da última consulta guardada (`receita_consultas`), não de um campo da empresa, e traz a data da consulta.
- Faixa de resumo: Vendedor · Vertical · Última visita · Último contato · Próxima atividade.
- No celular: botões grandes **Ligar · WhatsApp · Rota · Atividade**.
- Aba **Histórico** mostra o log de auditoria; ações automáticas aparecem como "Sistema".

**Decisões de 13/10/2026 (v1.7): ficha (valem sobre o protótipo)**
- **Cabeçalho:** nome, Matriz/Filial, situação na Receita, razão social, CNPJ, tags + **Editar tags**, **Ligar** e **WhatsApp** (telefone principal da empresa) e **Mais ações** (Editar, Excluir). **Vendedor** some da faixa de resumo quando a empresa tem um membro só.
- **Abas visíveis agora: Resumo, Contatos, Atividades e Histórico** (Contatos veio no Módulo 3 e Atividades no **Módulo 5**, com o botão **Nova atividade**, no cabeçalho e na aba). **Oportunidades** e o botão "Nova oportunidade" ficam **escondidos até o Módulo 6**. Última visita, último contato e próxima atividade vêm das atividades ("Nunca"/"—" enquanto não há nenhuma).
- **Resumo:** *Dados cadastrais*, *CNAEs* (principal marcado), *Sócios* (só nome e qualificação; **"Converter em contato"** cria o contato com o vínculo e marca o sócio como "Contato"; não converte duas vezes e sobrevive ao "Atualizar pela Receita") e *Observações*. **Sem campos personalizados e sem faixas de funcionários e faturamento** (fora do MVP).
- **Atualizar pela Receita** (card Dados cadastrais, ao lado de "Receita em dd/mm/aaaa"): reconsulta ignorando o cache, atualiza a situação e a data e abre um diálogo com **o que mudou (atual × Receita)**, com **Aplicar alterações** ou **Manter como está**; fica na auditoria. Telefones da Receita se somam aos da equipe. Empresa que deixou de ser ativa **continua na carteira**, com o aviso de situação.
- **Editar** usa a mesma tela do cadastro, **sem o passo da Receita e sem o documento**. **Excluir** é só de administrador e gestor, é lógico e **não há lixeira** por enquanto (pendência pós-MVP).
- A aba **Histórico** traz a auditoria **em português** (com nomes no lugar de ids) e as tags que o sistema aplicou ou tirou sozinho.

**Decisões de 29/10/2026: ficha (valem sobre as anteriores)**
- **Tags** na ordem dos grupos de *Configurações → Tags* (como na lista).
- **Cabeçalho:** **Check-in** do mesmo tamanho de *Nova oportunidade* e *Nova atividade*. **Sem o botão Ligar** (no desktop e nos botões grandes do celular): a ligação virá da integração com a telefonia. Fica o WhatsApp. (Os cartões da aba Contatos e da lista no celular continuam com Ligar.)
- **Abas** sem barra de rolagem; **Contatos, Atividades, Oportunidades e Chamados mostram o total** ao lado do nome.
- Nova aba **Chamados** (quem tem `chamados.ver`): os chamados **abertos** da empresa (nem resolvidos nem fechados), com **Abrir chamado** já ligado a ela e o atalho para a central.
- **Dados cadastrais:** cada rótulo em **negrito**. **CNAEs:** o **principal sempre primeiro**.
- **Converter sócio em contato** abre um diálogo com **telefone e e-mail, os dois opcionais**; em branco, o contato nasce sem eles para completar depois. Telefone ou e-mail inválido não cria nada.
- **Aba Contatos:** quem gere acessos ao portal (`portal.acessos`) vê, em cada cartão, a situação do acesso ao **portal do cliente** ou o botão **Acesso ao portal**, que abre o convite já com a empresa e o contato.

**Cadastro: decisões de 13/10/2026 (v1.7)**
- Três passos: **Documento** (CNPJ, CPF ou sem documento, com consulta à Receita), **Conferir dados da Receita** (editáveis) e **Carteira** (Vendedor, Vertical, Status padrão Lead, Website, Observações).
- **Empresa não ativa na Receita** (baixada, inapta, suspensa, nula) **não pode ser cadastrada**: com o bloqueio ligado (padrão; Configurações → Carteira) a tela mostra a situação e o motivo e desabilita Salvar, e a API recusa (409 `empresa_nao_ativa`). Com a Receita fora do ar, a empresa é salva com o selo **"situação não verificada"** e o sistema reconsulta de hora em hora (até 24 vezes), avisando o vendedor se ela não estiver ativa. CPF e "sem documento" não são afetados. O mesmo bloqueio vale na importação (Módulo 4).
- **Duplicado:** o CNPJ repetido na carteira mostra "Esta empresa já está no CRM" com **Abrir ficha**; o vendedor que não vê aquela empresa só fica sabendo que é de outro vendedor, sem nome.
- Matriz e filial se ligam pela raiz do CNPJ, nos dois sentidos, ao salvar.

### Recursos extras
- **Importação por planilha** (Excel/CSV): mapeamento de colunas, prévia, validação e relatório de erros. Importa **empresas, contatos, atividades e oportunidades** (alternância no primeiro passo; ordem recomendada empresas → contatos → oportunidades → atividades).
  - **Contatos e atividades (16/10/2026):** o vínculo com a empresa é sempre pelo **CNPJ** (que precisa estar na carteira); sem Receita; 5 passos (Enviar · Mapear · Prévia · Importar · Relatório). **Contatos:** e-mail ou telefone que já é de um contato existente só **vincula** (os dados dele não mudam); e-mail ou telefone inválido pula a linha; aniversário ou LinkedIn inválido entra sem o campo, com aviso; papel inexistente entra sem papel, com aviso; "Não quer contato" grava a saída com origem importação. **Atividades:** tipo apontado no mapeamento (valor da planilha → tipo cadastrado), data e hora no fuso da empresa (sem hora = dia inteiro), situação pela data quando em branco, Realizada exige o resultado e não pode estar no futuro, atividade idêntica pulada, contato pelo e-mail (com vínculo ativo), responsável pelo e-mail ou quem importa, `origem = importacao`; a atividade realizada atualiza a última visita, o último contato, a próxima atividade e as tags da empresa como o registro manual. **Desfazer** (7 dias) em ambos: só o que o lote criou e ninguém alterou depois; o das atividades recalcula a carteira. Detalhe em `escopo_mvp.md` ("Importação de contatos e de atividades") e `roteiro_teste_importacao_contatos_atividades.md`.
  - **Oportunidades (28/10/2026; plano em `plano_importacao_oportunidades.md`):** empresa pelo **CNPJ** (na carteira); sem Receita; 5 passos. **Um funil por lote** (o padrão já marcado); fase, motivo, origem e solução pelo **mapeamento de valores** (o de mesmo nome casa sozinho); sem fase, a primeira fase ativa. Status Ativo, Conquistado, Perdido, Cancelado ou Suspenso: a fechada entra com o histórico e a **fase em que parou**, como no fechamento manual; Perdido, Cancelado e Suspenso exigem um motivo que valha para o status; Suspenso exige "Retomar em" e cria a retomada; data de fechamento da planilha (sem ela, a da importação; no futuro, pula). **Conquistada só muda a empresa para Cliente com a chave do lote ligada** (desligada por padrão). Valores em reais (único, mensal, meses; total e ponderado sempre calculados), probabilidade da fase ou a da planilha (marcada como editada à mão), responsável pelo e-mail ou o **vendedor da empresa**, contato pelo e-mail com vínculo ativo, título vazio = "Empresa – Solução". Mesma empresa, funil e título (sem acento e caixa) que já existe é **pulada**: nunca altera o que existe. **Desfazer** (7 dias): só as que ninguém mexeu depois, com a retomada; a empresa que virou Cliente continua Cliente. O desfazer de um lote de **empresas** mantém a empresa que tem oportunidade. Roteiro em `roteiro_teste_importacao_oportunidades.md`.
  - **Decisões de 12/10/2026 (v1.6):** passos *Enviar arquivo · Mapear colunas · Regras · Prévia · Carteira · Importar · Relatório*; até **10.000 linhas e 10 MB**; fonte dos dados (*usar a planilha*, *buscar tudo na Receita* ou *completar só os vazios*); consulta à Receita **um CNPJ por vez, no worker**, com intervalo **fixo de 3 s** e *retry* em 429/5xx; **regras em perfis nomeados por empresa** (situação ativa, matriz/filial, excluir MEI, CNAE principal em lista com opção de aceitar nos secundários, e a ação para quem não passa: pular e listar, ou importar com a tag "Fora do perfil"); **lote nomeado, filtrável e desfazível** (o desfazer vale por 7 dias depois de o lote terminar, concluído ou cancelado, e tira só as empresas que o lote criou e que ninguém alterou depois). Detalhes em `escopo_mvp.md` (Módulo 4).
- **Detecção de duplicados:** alerta no cadastro e na importação por CNPJ igual, nome muito parecido ou telefone igual. Opção de **mesclar** duplicados.
- **Exportação** da lista filtrada para Excel/CSV, respeitando as permissões do usuário.

---

## 3A. Prospecção (Minha Receita)

Gerar listas de leads a partir da base pública de CNPJs.

- **Busca por:** CNAE (principal ou secundário), UF, município e natureza jurídica. Por padrão, **só empresas ativas**.
- **Lista de revisão:** razão social, cidade, CNAE e a marcação "**já está no CRM**" (com link para a ficha).
- **Importar selecionadas:**
  - escolher vendedor, vertical e tag de Status (padrão: Lead);
  - os dados completos da Receita são preenchidos (CNAEs, sócios, telefones, endereço);
  - a origem do cadastro fica como **Prospecção**.
- As buscas ficam salvas e podem ser **repetidas** para encontrar empresas novas desde a última vez.
- Integra com a geolocalização (fase 2): ver os leads importados no mapa e montar o roteiro de visitas.
- **Direção técnica (12/10/2026):** a busca por CNAE + município exige a base completa da Receita. O caminho previsto é uma **instância própria da Minha Receita** (código aberto), o que permite filtrar por município (IBGE), CNAE principal, situação, matriz e porte/MEI direto no banco, sem depender da API pública. Os **perfis de regras** da importação (seção 3, "Recursos extras") são reaproveitados aqui.

---

## 3B. Geolocalização e mapa (G1 e G2; plano em `plano_geolocalizacao.md`)
- **Geocodificação** do endereço da empresa em camadas (CNEFE do IBGE e Nominatim do ES, completando pelo CEP), parando na primeira que acerta. A posição é **exata** (número casado, raio 100 m) ou **aproximada** (interpolada ~300 m, rua ~1 km, CEP/cidade ~5 km); todo o resto fica "aproximada" com o tipo guardado.
- **Quando roda:** sozinha, uma empresa por vez, ao criar a empresa ou alterar o endereço (a coordenada antiga é invalidada; o ajuste manual é preservado até o usuário confirmar a troca); e em **lote por cidade ou região** (admin e gestor), com total e quantas já têm coordenada, progresso e retomada. Sempre no worker, com concorrência baixa e configurável.
- **Endereço incompleto** (sem rua, número, bairro ou cidade; "S/N" conta como número): completa pelo CEP; se continuar incompleto, a empresa recebe a tag de sistema **Endereço a confirmar** (grupo de sistema **Cadastro**) e entra na fila "Confirmar endereço". A tag sai quando o endereço fica completo e geocodificado, ou quando o usuário confirma a posição. Empresa incompleta nunca vira pin.
- **Ficha:** selo de precisão (exata, aproximada, sem coordenada, a confirmar) com a origem, e **Ajustar posição** num mapa pequeno, com confirmação.
- **Configurações → Geolocalização:** lotes, contagens, progresso, relatório, regiões (as microrregiões oficiais do ES, somente leitura, e as do admin, com nome e municípios) e, só para o **admin**, a **legenda do mapa** (cores e nomes dos estados, com prévia e "Restaurar padrão").
- **Mapa:** tela cheia com MapLibre. Pins coloridos pela tag de Status; um visto marca "visitada alguma vez". Estados fixos: **visita tentada** (só alimentada pelo check-in do G3) e **sem visita há 60+ dias** (só empresas com o Status **Cliente**, como na tela de referência; vermelho por padrão; prevalece sobre a cor do Status). "Visitada" = tem alguma visita realizada (`última visita` preenchida). A tag de Status ganha as opções **aparece no mapa** (ligada, exceto Inativo) e **visível ao abrir** (ligada, exceto Prospect).
- **Filtros:** busca (empresa, bairro, cidade), status, visitada (alguma vez, 90 dias, período), vendedor, sem visita há N dias, cidade, região e precisão. **Carregamento por área visível**, com agrupamento nos zooms afastados; leads entram por lote de importação, até 500 por vez.
- **Painel da empresa** (Ligar, WhatsApp, Abrir ficha), **empresas próximas** (2, 5, 10 e 25 km; por padrão sem as já visitadas), **seleção por retângulo ou raio** (listar, abrir ou aplicar tag) e **cobertura por município**.
- **Permissões:** o vendedor vê no mapa só o que já vê na carteira; admin e gestor veem tudo.
- **Fora do G1+G2:** check-in com GPS e relatório de visita (G3, seção 3C), "Na rota" e rotas (G4).

## 3C. Visitas: check-in e relatório (G3; plano em `plano_geolocalizacao.md`, seção 9)

### Configurações → Visitas (G3a)
Quem configura: permissão **Gerir cadastros** (`cadastros.gerir`; por padrão só o Administrador). Três abas:
- **Resultados:** o resultado da visita é um campo de sistema, fora do modelo, e **escolhe o modelo** do relatório. Cada resultado tem nome, modelo e ordem. Padrões de toda empresa: **Visita realizada**, **Retornar depois**, **Sem interesse**, **Responsável ausente**, **Não localizada** e **Empresa encerrada**. Os dois últimos são de sistema: só se renomeiam e trocam de modelo, nunca se inativam nem se excluem. Os demais seguem a regra de exclusão da seção 11 (usado só se inativa; sem uso, se exclui).
- **Modelos:** construtor ordenável com prévia, com o resultado fixo no topo. Um modelo é **padrão** (o primeiro sugerido para um resultado novo). Tipos de campo: texto curto, texto longo, número, data, sim/não, escolha única, múltipla escolha, nota de 1 a 5, e os de CRM:
  - **Contato:** o vendedor confirma um contato da empresa ou cria um novo, que fica vinculado.
  - **Próximo passo:** cria a próxima atividade ou um retorno.
  - **Tag:** o admin fixa a tag no construtor; o vendedor marca sim/não, e "sim" aplica a tag na empresa.
  - **Dados da empresa:** o admin escolhe um campo da ficha numa lista fixa (nome fantasia, site, vertical, número de funcionários); o valor respondido atualiza a ficha. **Nunca** CNPJ nem razão social.

  Cada campo tem rótulo, obrigatório e ordem, e um **id estável** que não muda quando o rótulo muda (base para relatórios por campo no futuro). Fora: campos condicionais e fotos.
  **Versões:** editar um modelo que já tem relatório publica uma **versão nova**; os relatórios antigos continuam mostrando a versão com que foram preenchidos. Modelo ainda sem relatório é editado no lugar.
  **Modelo de fábrica** ("Relatório de visita"): contato, número de funcionários, interesse (Alto, Médio, Baixo, Nenhum), demandas, ações feitas (WhatsApp, e-mail, material), próximo passo e resumo. Os seis resultados padrão apontam para ele.
- **Check-in:** modo **Avisar** (padrão: mostra a distância e deixa seguir), **Bloquear** (não deixa fazer check-in além do limite) ou **Só gravar** (não avisa; grava a distância); **limite** em metros (padrão 300); **horário do lembrete** dos relatórios pendentes (padrão 17:30).

### Check-in e relatório no campo (G3b)
- **Onde fica:** o botão **Check-in** está na ficha da empresa (no celular, abaixo das ações rápidas) e no painel da empresa no mapa; o menu **Relatórios de visita** lista os pendentes e as **empresas no aparelho** (cada uma com o seu check-in, que é por onde se começa a visita sem sinal); a ficha mostra o cartão **Relatórios de visita** com os selos.
- **Check-in** na ficha e no painel do mapa: lê a posição do aparelho, calcula a distância até a posição da empresa e aplica o modo configurado. Cria a atividade **Visita** em execução com o relatório pendente. Longe do endereço, oferece atualizar a posição da empresa com a do check-in.
- **Visita sem check-in** ("registrar depois"): fica marcada como sem check-in e sem posição, com um selo visível a quem vê os relatórios da equipe.
- **Relatório:** formulário montado pelo modelo do resultado escolhido; o rascunho é salvo a cada alteração. Ao concluir, a atividade vira **Realizada** e a carteira é recalculada como no Módulo 5; os campos de CRM aplicam seus efeitos na mesma transação. Enquanto o relatório está em rascunho, a atividade da visita não se edita nem se conclui por fora dele (cancelar e excluir continuam valendo).
- **Efeito do resultado na empresa:**
  - **Não localizada (decisão do Ale, 22/10/2026):** a atividade fica **Realizada** e **conta como atividade em tudo que mede esforço**: Dashboard, indicadores, lista de atividades do vendedor e histórico. Houve deslocamento e tentativa, explicados no relatório. O que ela **não** faz é marcar a **empresa** como visitada: não atualiza a última visita, não aplica a tag Visitada e não muda o estado "visitada" do mapa. A empresa recebe **Endereço a confirmar** e a data da visita tentada, e no mapa aparece como **visita tentada** enquanto essa tentativa for mais nova que a última visita real; ao confirmar o endereço (ajustar a posição ou corrigir o endereço e ele ser achado), a marca sai e o pin volta a "visitada" ou "nunca visitada", conforme o histórico. (No banco, `atividades.conta_visita = false` serve **só** para esse efeito na empresa, **nunca** para tirar a atividade das contagens.)
  - **Empresa encerrada:** pergunta "mudar o Status para Inativo?".
  - **Demais resultados:** visitada e última visita, pela regra do Módulo 5.
- **Quem vê:** o relatório segue o alcance de **Ver atividades** (o vendedor vê os dele; gestor e admin, todos). A posição e a distância do check-in só aparecem para quem tem **Ver a localização dos check-ins** (Administrador e Gestor por padrão); o vendedor vê apenas o aviso de distância na hora do check-in.
- **Pendentes:** lista no celular e card no Dashboard; lembrete no horário configurado pelo admin na aba Check-in (padrão 17:30), que aparece **com o app aberto** (notificação do aparelho, se permitida) ou **ao abrir o app** depois do horário. Sem Web Push nesta fase (backlog, junto com a central de notificações).
- **Offline:** as empresas abertas recentemente (abrir a ficha guarda a empresa) e as levadas com **"Levar para offline"** da lista de Empresas ou da seleção do mapa (até 300 por vez, válidas por 7 dias) ficam no aparelho com dados mínimos (sem CNPJ, observações nem histórico); check-in e relatório entram numa fila e sobem ao voltar o sinal, sem duplicar. Sem rede, o app usa a última sessão conferida (guardada cifrada no aparelho) para abrir e navegar. Os dados do aparelho são apagados ao sair da conta e quando outra pessoa entra, e tudo o que fica nele é cifrado. Proteções e o limite da cifra em `lgpd.md`, seção 3.2.

## 3D. Rotas (G4; plano em `plano_geolocalizacao.md`, seção 10)

### Planejar (G4a)
- **Rota:** código sequencial por empresa (**R-0151**), nome, data, **responsável** (o vendedor que vai rodar), ponto de partida, "voltar ao ponto de partida", minutos por visita e as paradas em ordem. Situação: **planejada**, **em andamento** (desde o primeiro check-in pela rota, G4b), **concluída** ou **cancelada**.
- **Paradas:** no máximo **30 por rota** (decisão do Ale, 23/10/2026). Só entram empresas **com coordenada** e que o **responsável da rota** pode ver na carteira; coordenada **aproximada** entra com aviso na parada. Uma empresa aparece uma vez por rota.
- **Ponto de partida:** padrão = **posição atual do aparelho**, lida só na hora de otimizar ou salvar, usada só no cálculo e **nunca gravada** (LGPD); alternativa = um **ponto cadastrado** pelo admin (ex.: a sede), com a posição **marcada no mapa** em Configurações → Rotas. Sem permissão de localização, a rota começa na primeira parada (aviso "Sem a posição atual").
- **Otimizar ordem:** a ordem mais curta pelas ruas (OSRM + VROOM), sem janela de horário nem almoço; depois, a ordem continua editável arrastando (ou pelas setas do teclado). **Sem o serviço de rotas configurado** (`VROOM_URL`/`OSRM_URL`), o botão fica desligado com o aviso **"Otimização de rotas ainda não configurada"**: monta-se e ordena-se à mão, e as distâncias saem em **linha reta** (desvio médio de 1,3 e 40 km/h). **Configurado mas fora do ar**, a ordem sai em linha reta, com o aviso "Serviço de rotas indisponível".
- **Estimativas:** distância e tempo = deslocamento + paradas × **minutos por visita** (padrão 40, configurável pelo admin e ajustável em cada rota).
- **A rota não cria atividades agendadas** (decisão do Ale, 23/10/2026): ela é a agenda do dia; a visita nasce no check-in pela parada (G4b).
- **Navegação:** **Google Maps** em trechos (até 3 paradas intermediárias no celular e 9 no computador); **Waze** uma parada por vez.
- **Onde se monta:** tela **Rotas** (menu Carteira) com a lista, os filtros (datas, situação e, para quem vê as da equipe, vendedor) e "Nova rota"; **editor no Mapa** (`/mapa?rota=…`; painel à direita; no celular, tela cheia com abas Lista | Mapa). Paradas entram por "Adicionar à rota" no painel da empresa (que passa a mostrar **"Na rota · parada N"**; uma empresa já parada de rota salva em aberto mostra "Na rota R-0151 · parada N"), por "Adicionar todas à rota" em Empresas próximas e na seleção por retângulo ou raio, pelo botão de rota das ferramentas do mapa (acrescenta as empresas da área visível com os filtros) e pela seleção em massa da lista de Empresas (numa rota nova ou numa aberta). Sempre até completar 30, com aviso do que ficou de fora.
- **Permissões:** **Ver rotas** e **Editar rotas** com alcance (própria = as rotas de que a pessoa é responsável, equipe ou todas) e **Atribuir rotas** (montar ou passar a rota para outro vendedor). Padrão: Administrador e Gestor com tudo em todas; Vendedor vê e edita as próprias, sem atribuir. **Configurações → Rotas** (pontos de partida e minutos por visita): Gerir cadastros.

### Executar (G4b)
- **Rota do dia:** card **"Rota de hoje"** no Dashboard e a tela da rota (`/rotas/:id`), com a próxima parada em destaque (Navegar pelo Waze · Ligar · Check-in · Pular) e o Google Maps em trechos. **Todo check-in** (da rota, da ficha, do mapa ou sem sinal) numa empresa que é parada **pendente** da rota **de hoje** do mesmo vendedor liga a visita à parada e põe a rota **em andamento**; concluir o relatório marca a parada **visitada** (qualquer resultado, inclusive "não localizada"). "Pular" pede um motivo curto. A rota fica **concluída** quando não há parada pendente ou por "Encerrar rota" (as pendentes viram puladas, "Rota encerrada"). Paradas visitadas ou puladas não saem da rota.
- **Offline:** "Levar para offline" na tela da rota guarda as empresas (o "levar para offline" do G3b) e a própria rota no aparelho, cifradas e por 7 dias; sem sinal, a rota abre do aparelho e o check-in entra na fila. Pular, encerrar, otimizar e salvar exigem sinal.
- **Planejado × realizado** na lista de Rotas (gestor e admin veem as da equipe): visitadas de N, puladas e pendentes, a distância e o tempo estimados.

## 4. Contatos

Um contato pode estar ligado a **várias empresas** (N:N).

### Cadastro do contato (dados da pessoa)
| Campo | Observação |
|---|---|
| Nome | Obrigatório |
| Telefones | Vários, com tipo (celular, fixo, WhatsApp). Também armazenados em formato E.164 para identificar conversas do WhatsApp |
| E-mails | Vários |
| Observações | Texto livre |
| Papel na decisão | Decisor, Influenciador, Usuário, Financeiro, Técnico (cadastrável) |
| Aniversário | Dia e mês |
| LinkedIn | Link do perfil |
| Consentimento (LGPD) | Aceita WhatsApp / aceita e-mail, com data e origem |
| Campos personalizados | Ver seção 8 |

### Vínculo contato ↔ empresa (dados que mudam por empresa)
| Campo | Observação |
|---|---|
| **Cargo** | O cargo pertence ao vínculo (a pessoa pode ser sócia de uma empresa e contadora de outra) |
| Telefone/e-mail corporativo | Opcional, específico daquela empresa |
| Contato principal | Marca o contato principal da empresa |
| Ativo | Desativa o vínculo (ex.: saiu da empresa) mantendo o histórico |

### Tela Contatos
- Lista com busca (nome, telefone, e-mail), filtro por empresa, cargo, papel na decisão, **tag do contato** e tag da empresa (nessa ordem). Coluna **Tags** (as do contato, todas, quebrando linha, na ordem dos grupos) e as mesmas etiquetas nos cartões do celular. O filtro "Tag do contato" só aparece quando existe algum grupo de tags de contato.
- **Filtros recolhíveis (29/10/2026):** em todos os dispositivos a busca fica sozinha na barra, com o botão **"Filtros"** ("Filtros · N" com filtros ativos) ao lado. O botão abre, abaixo da busca, os filtros **um abaixo do outro** (cada um com o rótulo acima; até 420px de largura no desktop e no tablet), e **"Fechar filtros"** (ou o próprio botão) recolhe a seção sem tirar os filtros, que continuam na URL. A seção começa sempre fechada, mesmo com filtros na URL; "Limpar filtros" fica sempre à vista. Plano em `plano_contatos_filtros_e_tags.md`.
- Detalhe do contato: as **tags** no cabeçalho, com **"Editar tags"** para quem edita o contato (some quando não há grupo de tags de contato com tag ativa).
- Detalhe do contato: dados, **empresas vinculadas**, atividades e oportunidades em que participa (as duas últimas entram nos Módulos 5 e 6). Aba **Histórico** com a auditoria do contato em português; as linhas que citam empresa que o usuário não vê ficam de fora.
- Ações rápidas: ligar, WhatsApp, e-mail.
- Detecção de duplicados por e-mail ou telefone.

---

## 5. Atividades

### Princípio
- **Atividades e tarefas são a mesma coisa no sistema** (tabela única). O tipo **Tarefa** cobre o to-do interno; os demais tipos são interações com o cliente.
- A atividade é **sempre ligada a uma empresa** (gestão de carteira), **exceto** o tipo Tarefa, em que a empresa é opcional.
- **Contato** e **oportunidade** são **opcionais** (e precisam pertencer à mesma empresa).
- Funciona como **agenda + histórico**.

### Cadastro
| Campo | Observação |
|---|---|
| Tipo | Ligação, WhatsApp, E-mail, Visita, Reunião, Tarefa (cadastrável) |
| Empresa | Obrigatório (opcional no tipo Tarefa) |
| Contato(s) | Opcional, um ou mais contatos da empresa |
| Oportunidade | Opcional |
| Título / Descrição | O que será ou foi feito |
| Data e hora | Início e duração (opcional) |
| Responsável | Usuário que executa |
| **Situação** | **Pendente · Em execução · Realizada · Cancelada** (*Atrasada* é calculada: pendente com data passada) |
| **Importante / Urgente** | Chaves liga/desliga (juntas formam a matriz de prioridade) |
| **Notificar em** | Um ou mais lembretes (data/hora e canal: app, push, e-mail) |
| **Recorrência** | Diária, semanal, mensal, anual ou personalizada; editar "só esta / esta e próximas / todas" |
| Checklist e etiquetas | Subitens e etiquetas coloridas (usados principalmente em tarefas) |
| Resultado | Texto ao concluir (o que aconteceu) |
| Localização | Check-in com GPS na visita (G3, seção 3C) |
| Origem | Manual · WhatsApp · Integração/API (preenchido pelo sistema) |
| Anexos | Arquivos e fotos (Garage); mídias do WhatsApp no futuro |

### Fluxo
1. **Agendar** → entra na agenda do responsável.
2. **Concluir** → informa o resultado. Tem opção "**Concluir e agendar próxima**" (fluxo rápido de follow-up).
3. Atividade agendada com data passada fica como **Atrasada** (destaque em vermelho).
4. É possível registrar direto como concluída (algo que já aconteceu).

### Formulário "Registrar atividade" (v1.5, do protótipo; **como ficou no Módulo 5**)
- Abre pelo item **Atividade** do botão **"+"** da barra superior e do cabeçalho do celular (no celular, folha que sobe do rodapé), por **"Nova atividade"** nas fichas (com a empresa já preenchida; na ficha do contato, também o contato) e pela tela **Atividades**.
- Campos: **Tipo** (botões com o ícone de cada tipo ativo; padrão Visita) · **Empresa** (**campo de pesquisa**: digite parte do nome, da razão social, o CNPJ/CPF com ou sem máscara ou a cidade; **os resultados só aparecem depois de digitar** e abrem como uma camada sobre os campos de baixo, sem mudar o tamanho da janela; escolhida a empresa, o campo mostra o nome e **Trocar empresa**; obrigatória, exceto no tipo Tarefa) · **Contato** (só os ativos da empresa; trocar de empresa limpa o contato) · **Título** (obrigatório) · **Data e hora** (em atividade **Realizada** o campo é **"Quando aconteceu"**; **Dia inteiro** troca por só a data) · **Situação** (**Realizada**, padrão, ou **Pendente**, para agendar; cancelada não se cria) · **Resultado** (obrigatório quando Realizada; a dica diz o efeito do tipo na carteira: visita aplica Visitada e atualiza última visita e último contato, contato aplica Contactada e atualiza o último contato, os demais não alteram a carteira) · **Importante** e **Urgente**.
- **Responsável:** o padrão é o usuário logado. Administrador e gestor escolhem outro em **"Mais opções → Responsável"**; o vendedor registra sempre para si.
- **Fora desta entrega (depois do MVP):** do bloco "Mais opções" do desenho, **Oportunidade** (entra com o Módulo 6), **Lembrete** ("Notificar em") e **Repetir** (recorrência). Ver `backlog_pos_mvp.md`.
- **Botões:** "Registrar atividade" (ou "Agendar atividade", quando Pendente) e **"Registrar e agendar próxima"** (só quando Realizada), que registra e **reabre o formulário com a mesma empresa, o mesmo tipo e o mesmo contato, situação Pendente e data vazia**.
- **Regras de data:** uma atividade realizada **não pode ter data no futuro**, com tolerância de **5 minutos** (para o celular com o relógio adiantado). "Hoje", "atrasada", "dia inteiro" e o agrupamento por dia valem no **fuso da empresa** (America/Sao_Paulo), nunca em UTC; atividade de dia inteiro só atrasa quando o dia acaba.
- **Ações de cada atividade** (menu ⋯): **Concluir** (resultado obrigatório, data em que aconteceu e "Concluir e agendar próxima"), **Editar**, **Cancelar atividade** (vale também para a realizada, que deixa de contar como visita ou contato; o resultado fica guardado; a cancelada não se edita) e **Excluir** (lógica). Toda mudança **recalcula** na empresa a última visita, o último contato, a próxima atividade e as tags Visitada e Contactada; a tag só sai quando não resta nenhuma atividade realizada daquele tipo.
- **Conclusão rápida** no Dashboard: na própria linha, com Resultado e "Concluir" ou "Concluir e agendar próxima" (**Módulo 7**).

### Tipos de atividade (cadastráveis)
| Campo | Observação |
|---|---|
| Nome | Ex.: Telefone, E-mail, Visita, WhatsApp, Reunião online |
| Ícone e cor | Exibição na linha do tempo e na agenda |
| **Conta como** | *Visita*, *Contato* ou *Nenhum*. Alimenta o controle de visitadas/contactadas |
| Ativo | Inativar sem perder o histórico |

Tipos padrão: **Ligação** (contato) · **WhatsApp** (contato) · **E-mail** (contato) · **Visita** (visita) · **Reunião** (contato) · **Tarefa** (nenhum, empresa opcional).

> **Proteções (v1.6, Módulo 1):** o tipo **Tarefa** pode ser renomeado e mudar ícone e cor, mas não é inativado nem excluído, **não exige empresa** e **não conta como visita nem contato**. Os demais tipos padrão são livres. O ícone é escolhido numa lista do design system.

> **Atividade × Tarefa (v1.3):** estão unificadas. A tarefa é uma atividade do tipo *Tarefa*. Todas aparecem na agenda, na linha do tempo (quando têm empresa) e no Kanban de Tarefas (seção 9A).

### Onde aparecem
- Dashboard (minhas atividades)
- Detalhe da empresa, do contato e da oportunidade (linha do tempo)

---

## 6. Funis de vendas

### Funil
| Campo | Observação |
|---|---|
| Nome | Ex.: Vendas novas, Renovação, Pós-venda |
| Padrão | Funil aberto por padrão no Kanban |
| Ativo | Inativar sem perder o histórico |
| Ordem | Exibição |

### Etapa
| Campo | Observação |
|---|---|
| Nome | Ex.: Qualificação, Diagnóstico, Proposta, Negociação |
| Ordem | Arrastar para reordenar |
| Cor | Cabeçalho da coluna no Kanban |
| Probabilidade padrão (%) | Sugerida ao entrar na etapa (ex.: Proposta = 50%) |
| Dias para alerta de parada | Destaca a oportunidade sem atividade há X dias nessa etapa |

### Regras (v1.3: fechamento pelo **Status**)
- Funis e etapas (fases) **ilimitados**. As fases representam só o **andamento**.
- O **Status** da oportunidade é independente da fase: **Ativo · Conquistado · Perdido · Cancelado · Suspenso**.
- Ao mudar para **Conquistado**: grava a data de fechamento e aciona a automação opcional "empresa vira Cliente".
- Ao mudar para **Perdido, Cancelado ou Suspenso**: exige o **Motivo** (lista cadastrável por status) e guarda a **fase em que parou** (análise de onde se perde).
- **Suspenso** tem o campo "**Retomar em**", que cria uma atividade de retomada.
- Reabrir (voltar para Ativo) é permitido, com registro no histórico.
- **Funil padrão (v1.6):** há **sempre exatamente um**. Tornar outro funil o padrão troca o anterior; o padrão não pode ser inativado nem excluído. Um funil nasce com ao menos uma etapa e a **última etapa** de um funil não pode ser excluída. A etapa tem nome, cor, probabilidade padrão (0 a 100) e dias para o alerta de parada (vazio = sem alerta); a etapa **nunca usada** se exclui; a que **já teve oportunidade** (mesmo só fechada) **só se inativa** (Módulo 6): etapa inativa sai do Kanban e das escolhas, e o funil precisa de ao menos uma etapa ativa.
- **Excluir etapa (v1.6):** com oportunidades **ativas** na etapa, é preciso **movê-las antes**. Uma etapa que **já teve** oportunidades (mesmo só fechadas) **só se inativa**; só a que **nunca foi usada** pode ser excluída (regra geral da seção 11). O histórico de fases e a **"fase em que parou"** continuam mostrando o nome dela.
- **Histórico de etapas:** cada mudança de etapa é registrada (data, usuário, de → para). Isso permite calcular tempo médio por etapa e conversão.

---

## 7. Oportunidades

### Cadastro
| Campo | Observação |
|---|---|
| Nome | Ex.: "Contrato anual 2027" (sugestão automática: Empresa – Solução) |
| Empresa | Obrigatório (busca) |
| Contatos | Principal (busca **apenas entre os contatos da empresa escolhida**) + outros |
| **Solução** | Linha de solução cadastrável |
| Funil / Fase | Obrigatório. **Um funil tem no máximo 6 fases ativas** (as inativas não contam): criar ou reativar a 7ª é recusado (409 `limite_de_fases_ativas`) |
| **Status** | Ativo · Conquistado · Perdido · Cancelado · Suspenso |
| **Valores (Módulo 6)** | A pessoa digita o **valor único**, o **valor mensal** e a **duração em meses** (inteiro ≥ 0; **12** quando há valor mensal e nada foi dito). O **total é calculado** (`único + mensal × meses`) e **nunca digitado**; o **ponderado** é `total × probabilidade`. As duas contas ficam no banco (colunas geradas), num lugar só. *(Itens e catálogo de produtos: depois do MVP.)* |
| **Data prevista de fechamento** | **Opcional.** Sem data, a oportunidade é "sem previsão" e fica fora da previsão do mês (Módulo 7) |
| **Probabilidade (%)** | Começa com a da fase e é editável. **Ao mover de fase assume a da nova fase, a menos que a pessoa a tenha editado à mão** (o sistema guarda essa marca): aí fica a dela e aparece um aviso com a sugestão da nova fase. Editar para o mesmo valor da fase volta a acompanhar a fase |
| Valor ponderado | Valor × probabilidade (calculado) |
| **Origem** | Lista cadastrável (Indicação, Site, Prospecção ativa, Evento…) |
| Responsável | Usuário (por padrão, o responsável da empresa) |
| **Motivo** | Lista cadastrável, obrigatório para Perdido, Cancelado e Suspenso |
| Retomar em | Data de retomada (Suspenso) |
| Data de fechamento | Automática ao sair de Ativo. **Admin e gestor** (permissão `oportunidades.data_fechamento`) escolhem o **dia** na janela "Fechar oportunidade": hoje por padrão, **nunca no futuro nem antes do dia da criação** (400 `fechamento_no_futuro` / `fechamento_antes_da_criacao`; quem não tem a permissão e manda o dia recebe 403). Hoje grava o momento; um dia passado grava o meio-dia no fuso da empresa (31/10/2026). Mudar depois de fechada: reabrir e fechar de novo |
| **Data de criação** | Automática. **Só o administrador** (permissão `oportunidades.data_criacao`) muda o **dia** em "Editar oportunidade" (campo "Criada em"): nunca no futuro nem depois do dia do fechamento (400 `criacao_no_futuro` / `criacao_depois_do_fechamento`). Muda "Criada em", a ordenação da lista e as "novas no período"; o histórico de fases fica como foi registrado e a troca vai para a auditoria (31/10/2026) |
| Observações | Texto livre |
| **Tags** | Várias, dos grupos de tags de oportunidade (seção 2; 31/10/2026). Escolhidas no cadastro, na edição ou em **"Editar tags"** na ficha (também depois de fechada); quem edita a oportunidade edita as tags. **Duplicar** copia as tags |
| Campos personalizados | Ver seção 8 *(fora do MVP)* |

### Produtos/itens *(fora do MVP: o Módulo 6 usa valores digitados; ver `backlog_pos_mvp.md`)*
- **Catálogo de produtos e serviços** (cadastrável): código, nome, tipo (produto/serviço), solução, unidade, preço padrão, **cobrança padrão (única/mensal/anual)** e **meses padrão**.
- Itens da oportunidade: produto, quantidade, preço unitário (editável), desconto (%), **cobrança** e **quantidade de meses**.
- Cálculo: única = qtd × preço · mensal = qtd × preço × meses · anual = qtd × preço × (meses ÷ 12).
- Exemplo: licença R$ 500/mês × 12 + implantação R$ 2.000 → **Único R$ 2.000 · Mensal R$ 500 · Total R$ 8.000**.

### Tela Oportunidades
- **Kanban** por funil (seletor de funil no topo):
  - Colunas = fases, com **soma de valores e quantidade** no cabeçalho. Só oportunidades com status **Ativo**.
  - Card: **empresa em maiúsculas e negrito** na 1ª linha (até 2 linhas; a maiúscula é só visual), **nome da oportunidade** abaixo (link para a ficha), as **tags** da oportunidade, valor, responsável, data prevista e próxima atividade (31/10/2026).
  - **Arrastar e soltar** entre etapas (Módulo 6: **pela alça** do card, com mouse, toque ou teclado; ao mover, a probabilidade assume a da nova fase, a menos que tenha sido editada à mão).
  - **Alerta de oportunidade parada:** card destacado quando passa X dias sem atividade.
  - Zona de soltura no **topo** do quadro (também no celular), só enquanto se arrasta: **Conquistado · Perdido · Cancelado · Suspenso** (arrastar o card para fechar). Desde 31/10/2026 a faixa ocupa **espaço próprio e empurra as colunas para baixo**, sem cobrir o nome, a quantidade e a soma das fases. Filtro para ver as suspensas.
  - **Layout (16/10/2026):** o quadro usa a largura e a altura toda da área central; cada coluna rola os próprios cards. No computador e no tablet as colunas abertas dividem a largura por igual, sem rolagem horizontal, e qualquer fase pode ser **recolhida** numa faixa estreita (o estado fica por usuário e por funil, na conta); no celular é uma coluna por vez, com deslize e indicador de posição. Regra em `design_system.md`, seção "Kanban".
  - **Duplicar** (menu ⋯ do card, da lista e da ficha): abre "Nova oportunidade" preenchida com empresa, contato, solução, origem, funil, fase, valores, meses, probabilidade (com a marca de editada à mão, se houver) e data prevista, com " (cópia)" no nome; tudo editável, inclusive a empresa (o contato só fica se tiver vínculo com a nova empresa). **Não** copia histórico, atividades, status, fechamento, responsável nem observações: a cópia nasce **Ativa**. O vendedor só duplica para empresas da própria carteira; a auditoria da cópia registra de qual foi duplicada (`duplicadaDeId`).
  - No celular: rolagem horizontal por coluna e mover pelo menu do card (sem depender de arrastar).
- **Visão em lista** (alternância Kanban ↔ Lista): tabela com ordenação, filtros e paginação 25/50/100 *(exportação: depois do MVP)*.
- **Filtros:** responsável, fase, status, solução, período de previsão, origem, valor, tags da empresa e campos personalizados. **Feito:** responsável, status (lista) e **"Tag da oportunidade"** (Kanban e lista, uma tag; 31/10/2026). A lista tem a coluna **Tags** (todas, quebrando linha) e a ficha mostra as tags no cabeçalho.
- **Filtros salvos** por usuário (ex.: "Minhas oportunidades acima de R$ 10 mil").

### Diálogo "Fechar oportunidade" (v1.5, do protótipo)
- Abre ao soltar o card numa das 4 zonas do **topo** do Kanban (Conquistado, Perdido, Cancelado, Suspenso) ou pelo menu do card (que é o jeito de mover no celular).
- Escolha do status em 4 opções · **Motivo** obrigatório (lista filtrada pelo status) para Perdido, Cancelado e Suspenso · **Retomar em** para Suspenso · Detalhe.
- **Conquistado:** mostra Valor total e MRR e um interruptor **"Mudar o Status da empresa para Cliente"**, que já vem ligado conforme a configuração do tenant e pode ser desligado naquele fechamento.
- Informa "Fica registrado que parou na fase X". O botão repete o verbo ("Marcar como perdida").
- **Suspensas:** botão com contador abre a lista com "Retomar em" e o botão "Reabrir".
- Mover de fase mostra a probabilidade sugerida da nova fase.

### Detalhe da oportunidade
- Dados, itens, contatos, **atividades vinculadas**, histórico de etapas e log de alterações.

---

## 8. Campos personalizados

O admin cria campos extras para **Empresa**, **Contato** e **Oportunidade**.

| Configuração | Opções |
|---|---|
| Tipo | Texto, Texto longo, Número, Moeda, Data, Sim/Não, Lista (única), Lista (múltipla), URL |
| Obrigatório | Sim/Não |
| Ordem / Seção | Organização no formulário |
| Filtrável | Aparece nos filtros das listas |
| Ativo | Inativar sem perder os dados |

---

## 9. Dashboard

Cada usuário vê os dados da **sua carteira**; gestores e admin podem alternar entre **minha visão / equipe / usuário específico**.

### Blocos da versão 1
**Minhas tarefas e atividades**
- Resumo do quadro de tarefas: atrasadas, para hoje e da semana (atalho para a tela Tarefas)

**Minhas atividades**
- Hoje · Atrasadas · Próximos 7 dias
- Conclusão rápida direto do dashboard (com resultado)

**Funil e previsão**
- Valor e quantidade por etapa (funil selecionável)
- Previsão do mês: soma do valor ponderado com data prevista no mês
- Conquistados × Perdidos/Cancelados no período (valor e quantidade), taxa de conversão e **MRR conquistado**
- Principais motivos de perda

**Carteira**
- Empresas por Status (Lead, Prospect, Cliente, Inativo) com as cores das tags
- **Sem contato há X dias** e **sem visita há X dias** (lista clicável)
- Novos leads no período

Filtro de período no topo: mês atual, mês anterior, trimestre ou personalizado.

---

### Indicadores do Dashboard (v1.5, do protótipo)
- Saudação e data, visão **Minha | Equipe** (gestor e admin) e período **Mês atual | Mês anterior | Trimestre**.
- 4 indicadores: **Previsão do mês** (valor ponderado) · **MRR conquistado** (variação e mini-gráfico) · **Taxa de conversão** (conquistadas × perdidas) · **Sem contato há 60 dias**.
- Minhas atividades com abas **Hoje · Atrasadas · Próximos 7 dias** e conclusão rápida.
- Funil por fase com barras, Conquistadas × Perdidas e canceladas, Principais motivos de perda.
- Carteira: barra por Status, novos leads no mês (quantos vieram da prospecção) e lista "Sem contato há 60 dias".

### Dashboard como ficou no Módulo 7 (visão "Minha")
- **Período:** Mês atual, Mês anterior ou Trimestre do calendário, no fuso da empresa; o "anterior" é o período inteiro de mesmo tipo logo antes. Sem período personalizado nem alternância Equipe (pós-MVP).
- **Indicadores:** **Previsão do período** (valor ponderado das ativas com data prevista no período; as sem data em "N sem previsão"), **MRR conquistado** (soma do valor mensal das conquistadas pela data de fechamento, com a variação sobre o período anterior e os últimos 6 meses), **Taxa de conversão** = conquistadas ÷ (conquistadas + perdidas) (as canceladas ficam fora da taxa) e **Sem contato há N dias** (Cliente e Prospect, pelas chaves de sistema; inclui as nunca contatadas; N é o prazo da empresa, padrão 60).
- **Minhas atividades:** Hoje (abertas de hoje que ainda não venceram, mais as de dia inteiro de hoje), Atrasadas e Próximos 7 dias (de amanhã até daqui a 7 dias), sem sobreposição; conclusão rápida na própria linha. O rodapé "Quadro de tarefas" não existe (Kanban de Tarefas fora do MVP); no lugar, "Ver todas as atividades".
- **Funil e previsão:** funil por fase (as ativas de hoje), Conquistadas × Perdidas e canceladas e Principais motivos de perda, em **gráficos interativos** (tooltip e clique levando à lista filtrada; `design_system.md`, "Gráficos").
- **Carteira:** barra por Status nas cores das tags (pelo nome que a empresa deu), empresas novas no período e a lista "Sem contato" (até 8) com "Ver as N".

## 9A. Tarefas — Kanban do vendedor

Quadro estilo *to-do* em Kanban, **customizável**, para o vendedor organizar o próprio trabalho.

> v1.3: os cards são **atividades** (inclusive as do tipo *Tarefa*). Cada quadro escolhe quais tipos exibe. Uma coluna pode ser vinculada a uma situação (ex.: "Feito" = Realizada).

### O que aparece no quadro
- **Tarefas internas** (ex.: "Preparar proposta", "Enviar catálogo", "Cobrar retorno do financeiro").
- **Atividades agendadas com clientes** (opcional, configurável por quadro): aparecem como cards com o ícone do tipo (Telefone, Visita…). Ao mover uma atividade para a coluna de conclusão, abre a janela de **concluir atividade** (com resultado).

### Quadros
| Campo | Observação |
|---|---|
| Nome | Ex.: "Meu dia a dia", "Pós-venda" |
| Dono | **Pessoal** (um usuário) ou **Equipe** (gestor + vendedores) |
| Colunas | Nome, cor, ordem, **limite de cards** (opcional) e marcação de **coluna de conclusão** |
| Exibir atividades | Liga/desliga, com filtro por tipos e período |
| Modelo | Criado a partir do **modelo padrão** do admin ou do zero |

- **Modelo padrão (admin):** ex.: *A fazer · Fazendo · Aguardando cliente · Feito*. Todo novo usuário recebe um quadro a partir dele.
- **Personalização do vendedor:** renomear, criar ou remover colunas e cores, e criar **quadros adicionais**.
- **Quadros de equipe (gestor):** o gestor atribui tarefas aos vendedores e acompanha o andamento.

### Tarefa
| Campo | Observação |
|---|---|
| Título / Descrição | Obrigatório / texto livre |
| Checklist | Subitens marcáveis, com % concluído no card |
| Prazo | Data (e hora opcional), com destaque para atrasada, hoje e próxima |
| Prioridade | Baixa · Média · Alta · Urgente (cor no card) |
| Responsável | Por padrão quem criou; o gestor pode atribuir a outro |
| **Etiquetas** | Cadastráveis, com **cor customizável** (pessoais ou da equipe) |
| Vínculos (opcionais) | Empresa, contato e/ou oportunidade |
| Anexos e comentários | Arquivos (Garage) e comentários (útil em quadros de equipe) |
| Recorrência | Diária, semanal, mensal (ex.: "Relatório semanal toda sexta") |
| Lembrete | Notificação antes do prazo |

### Visões e usabilidade
- **Kanban** (arrastar e soltar), **Lista** e agrupamento rápido **por prazo** (Atrasadas · Hoje · Esta semana · Depois).
- Filtros: etiqueta, prioridade, prazo, vínculo (empresa/oportunidade) e responsável (gestor).
- **Criação rápida:** digitar o título e Enter na coluna, ou o botão "+" flutuante no celular.
- No celular: uma coluna por vez com deslize lateral; mover pelo menu do card.
- A tarefa vinculada aparece também na ficha da empresa ou oportunidade (aba Atividades/Tarefas).
- Ação "**Converter em atividade**" (ex.: a tarefa "Ligar para o João" vira uma atividade de Telefone).


## 9B. Central de chamados (Fase 2, interna)

A equipe abre **chamados** para as áreas da própria empresa (Jurídico, Financeiro...), conversa, anota e resolve, com prazos contados no expediente e métricas. Na Fase 2 era **só interna**; com o **Portal do Cliente (seção 9C)**, o contato também abre e acompanha chamados pelo portal (origem `portal`).

### Permissões (catálogo v4; só o Administrador recebe, os demais perfis ganham por configuração)
`chamados.ver` (lista e detalhe), `chamados.criar`, `chamados.atender` (assumir, mudar o estado, responder, nota interna), `chamados.triar`, `chamados.atribuir`, `chamados.gerir_areas` (áreas, triagem, expediente e feriados), `chamados.ver_metricas` e `chamados.exportar` (CSV). O alcance (própria, equipe, todas) vale para ver e para as métricas. Sem `chamados.ver`: sem tela e **403 `acesso_negado`** na API. O enum `papel_conta` não muda.

### Áreas de atendimento
- Quatro áreas por empresa, criadas sozinhas (e para as empresas que já existiam, no start da API): **Jurídico, Financeiro, Comercial e Administrativo**. Nome único; metas de **primeira resposta** e de **resolução** em minutos úteis, **vazias por padrão** (vazio = sem meta e sem alerta de prazo); "visível no portal" (reservado); "pula a triagem"; ativa.
- **Quem atende:** membros (um deles pode ser o **gestor da área**) e/ou **perfis inteiros**. Área sem ninguém definido aceita quem tem a permissão de atender.
- Só se **exclui** a área que nunca teve chamado; a usada só se **inativa** (some das escolhas novas e continua nos chamados que já tem).

### Estados e prioridades
**Aguardando triagem → Pendente de atendimento → Em atendimento ⇄ Aguardando cliente → Resolvido → Fechado.** Prioridades: baixa, normal, alta, urgente. **Aguardando cliente pausa o prazo.** O chamado **Resolvido** pode ser **reaberto até 7 dias** depois; **Fechado** não muda mais. Cada passo grava um evento na linha do tempo (`chamado_eventos`, só acrescenta), que é a **única base das métricas**.

### Triagem
- **Configurável, começa desligada.** Desligada, o chamado cai direto na área escolhida. Ligada, ele espera em **Aguardando triagem** e **só quem tria o vê**, até escolher a área (e, se quiser, o responsável).
- Quem tria: **pessoas** e/ou um **perfil** (com a permissão `chamados.triar`). Ligar exige ao menos um triador.
- **Exceção por área:** "pula a triagem". **Chamado sem área** (o solicitante não sabe) **sempre** passa pela triagem.

### Atribuição
O responsável vem do **triador**, do **gestor da área** (quem atribui) ou da própria pessoa (**Assumir**, que coloca em atendimento). Atribuir não muda o estado.

### Conversa, notas e anexos
- **Conversa** entre solicitante e equipe; a **primeira resposta da equipe** é registrada uma vez.
- **Nota interna:** só da equipe, em bloco visualmente separado; **nunca** aparece na conversa nem para o solicitante.
- **Anexos:** até **25 MB** cada e **5 por mensagem**; o navegador envia direto ao Garage por URL pré-assinada e o **ClamAV** varre antes de liberar. Estados: em verificação → **limpo** (único que baixa) ou **infectado** (bloqueado, vai ao histórico). Sem antivírus configurado, os anexos ficam **desligados** (nada é aceito sem varredura).

### Expediente, feriados e prazos
- **Expediente** por dia da semana, com **várias faixas** por dia (padrão: segunda a sexta, 8h às 18h) e o **fuso** da empresa (`America/Sao_Paulo`). Feriados nacionais fixos e móveis criados por padrão; a empresa acrescenta, exclui e **gera os móveis de um ano** (Carnaval, Sexta-feira Santa, Corpus Christi; idempotente).
- O prazo de resposta e de resolução conta **só minutos úteis** (faixas do expediente, fora dos feriados), sem o tempo em Aguardando cliente. Sem meta na área, não há prazo nem alerta.
- Os filtros de data (lista, métricas e CSV) usam o **dia da empresa** (0h a 24h no fuso do expediente).

### Notificações
Sino do CRM (com atualização em tempo real por SSE) e e-mail, gravados por **evento do outbox** na mesma transação do ato: chamado aberto ou triado (avisa os triadores ou a área), atribuído, assumido, mensagem nova, aguardando cliente, resolvido e reaberto. **Nunca avisa quem fez a ação.** Sem Web Push nesta fase.

### Telas
Lista com as abas **Triagem, Pendentes, Meus e Todos** (contagem em cada), busca por número ou assunto e filtros; card **Chamados pendentes** no Dashboard; detalhe com conversa, notas, histórico e ações; Configurações → **Chamados** (áreas, triagem, expediente e feriados); **Métricas** (tempo até a 1ª resposta, tempo de resolução, dias em aberto, % no prazo, por área e por responsável) e **Exportar CSV**.

## 9C. Portal do Cliente, Fase 3A (acesso e chamados)

Espaço do **contato da empresa-cliente** (`portal.aledias.com.br`, app `apps/portal`), separado do CRM: outro domínio, outro cookie, outra CSP e DTOs próprios. Plano e decisões em `plano_portal_cliente.md`; roteiro de teste em `roteiro_teste_portal_3a.md`. Esta seção cobre a **3A**; publicações, documentos, agenda e avisos entram nas fases 3B a 3E.

### Permissões da equipe (catálogo v5; só o Administrador recebe)
`portal.ver` (hub: indicadores, chamados e acessos em leitura), `portal.acessos` (dar, reenviar, suspender, reativar e revogar acessos; tratar pedidos) e `portal.configurar` (ativar o portal, nome, exigência de 2FA). O Gestor **não herda** o prefixo `portal.`. O enum `papel_conta` não muda.

### Acesso do cliente (sem senha)
- **Convite:** quem tem `portal.acessos` dá o acesso ao contato (empresa-cliente + papel **Responsável** ou **Colega**). O e-mail leva um link `portal.../acesso#<token>` (token de 256 bits, só o **hash** no banco, vale 7 dias, uso único). A página mostra o botão **Confirmar acesso**: o link é consumido por `POST`, **nunca** ao abrir a página (verificadores de e-mail não o gastam). No primeiro acesso o cliente aceita o **aviso de privacidade** (registrado).
- **Entrada:** o cliente informa o e-mail e recebe um **link mágico** de 15 minutos, uso único. A resposta é **sempre a mesma**, exista o e-mail ou não.
- **Sessão:** cookie `__Host-portal` (`HttpOnly`, `Secure`, `SameSite=Lax`, sem `Domain`); 30 dias deslizantes, no máximo 90; mudanças no portal só valem com `Origin` igual a `PORTAL_URL`. Suspender ou revogar o acesso derruba as sessões. Sem `PORTAL_URL` as rotas respondem `503 portal_indisponivel`.
- **Limites contra abuso:** pedido de link por IP (20/h) e por e-mail (5/h); consumo de link 30/h; 2FA com 8 tentativas por 15 minutos.
- **Segurança da conta:** lista e encerramento de sessões, **2FA por aplicativo (TOTP)** com códigos de recuperação (código usado não repete), troca de e-mail por link enviado ao **endereço novo**. A empresa pode **exigir 2FA do Responsável**.
- **Perfil:** o cliente edita só o **nome**; o cargo vem do vínculo contato–empresa e é somente leitura.
- **Pedido de acesso para colegas:** o Responsável pede, a equipe aprova ou recusa (com motivo) no hub.

### Chamados pelo portal
- O cliente **abre**, **acompanha**, **responde**, **reabre** (Resolvido, até 7 dias) e **avalia** (nota de 1 a 5 e comentário, uma por chamado) os chamados da **sua empresa-cliente** (os de colegas também aparecem). O número vem da mesma sequência dos chamados internos.
- Estados vistos pelo cliente: **Aberto, Em atendimento, Aguardando sua resposta, Resolvido, Fechado**. Ele só vê chamados `origem = 'portal'`; chamados internos da equipe que citam a empresa **nunca** aparecem.
- **O cliente nunca vê:** notas internas, prioridade, responsável, prazos, triagem, eventos. A linha do tempo dele são **marcos** derivados das datas do chamado.
- **Anexos:** os mesmos da Fase 2 (25 MB, 5 por mensagem, URL pré-assinada, ClamAV, download por 60 s só de arquivo limpo). Desligados enquanto o antivírus não estiver configurado.
- **Notificações do cliente:** sino no portal (tempo real por SSE) e e-mail, pelo mesmo outbox da equipe, **sem avisar quem fez o ato**. Sem Web Push (3E).
- **Auditoria:** todo ato do cliente é auditado com `membro_id` nulo e `alteracoes.ator = { tipo: 'contato', acessoId, contatoId }`.

### Hub "Portal do Cliente" no CRM
Indicadores (chamados abertos pelo portal, tempo de resposta, avaliação média, acessos ativos, com período), lista de **chamados do portal**, **acessos** (dar, reenviar, suspender, reativar, revogar), **pedidos de acesso** e a **configuração** (portal ativo, nome, 2FA do Responsável). No detalhe do chamado, **Criar tarefa** vincula uma tarefa ao chamado (com prazo opcional) e a avaliação do cliente aparece junto.

### Isolamento (resumo)
Duas camadas no banco: o **tenant** (RLS como em todo o sistema) e a **empresa-cliente** (variáveis `app.portal_*` preenchidas só pela sessão do portal, com políticas restritivas). As tabelas internas **negam tudo** à sessão do portal. Detalhe em `modelagem_banco.md`.

## 9D. Portal do Cliente, Fase 3B (publicações)

A equipe publica **comunicados** no feed do portal; o cliente lê, reage, comenta e denuncia. Hub: Portal do Cliente → aba **Publicações**; cliente: **Início** do portal. Roteiro em `roteiro_teste_portal_3b.md`.

### Permissões (catálogo v6; só o Administrador recebe)
`portal.publicar` (criar, editar, agendar, fixar e excluir) e `portal.moderar` (comentários, denúncias e bloqueio). Quem só tem uma delas vê a aba Publicações e só o que ela permite. A chave geral dos comentários é `portal.configurar`.

### Publicação
- **Situações:** rascunho → agendada → publicada. **Agendada** é publicada sozinha pelo worker (confere a cada minuto) e exige horário no futuro. **Publicada** não volta a rascunho nem agenda (edita-se o texto ou exclui-se). Excluir é lógico: some do portal e da lista.
- **Texto:** Markdown restrito (negrito, itálico, links `http`, `https` e `mailto`, listas, subtítulos e parágrafos). **HTML nunca é interpretado**: aparece como texto. Título até 160 e texto até 10 mil caracteres.
- **Alcance:** todos os clientes, ou empresas-clientes escolhidas (até 500). O cliente só vê o que é do alcance da empresa dele.
- **Fixar:** uma publicação fixada por empresa (fixar outra desafixa a anterior); só a publicada fixa. A fixada vem primeiro no feed.
- **Anexos:** não há anexo nas publicações; arquivos para os clientes entram em **Documentos** (Fase 3C).

### O cliente
- **Reações:** Curtir e Parabéns (*Fase 4A: "Apoiar" saiu; os totais antigos ficam no banco*), uma de cada por pessoa; clicar de novo desfaz. Ele vê o **total de todas as empresas** e quais ele marcou, **nunca quem reagiu**.
- **Comentários:** texto puro de 1 a 1000 caracteres. **Os comentários visíveis aparecem para todos os clientes que veem a publicação, mostrando "Nome S." (primeiro nome e inicial do sobrenome), sem a empresa.** O cliente não edita nem apaga o próprio comentário (pode pedir à equipe ocultar). Fecham com o bloqueio da publicação ou com a chave geral (409 `comentarios_fechados`).
- **Denúncia:** de comentário alheio, com motivo (spam, ofensivo, outro); uma por pessoa e comentário; a pessoa não vê as denúncias dos outros.
- **Leitura:** a publicação é marcada como lida quando aparece na tela dele (uma vez por pessoa). É dado pessoal (ver `lgpd.md`).

### A equipe
- **Métricas por publicação:** alcance = pessoas distintas que leram ÷ pessoas com acesso ativo dentro do alcance, **contadas sobre o mesmo conjunto** (*Fase 4A: leitura de acesso revogado, suspenso ou de empresa que saiu do alcance não conta, então nunca passa de 100%*), reações, comentários (e ocultos) e empresas com ao menos uma leitura.
- **Lista do hub (Fase 4A):** abre na aba **Publicações** (é a primeira aba do hub para todos), da mais recente para a mais antiga (a fixada leva o selo, sem pular a ordem), com **5, 10 ou 20 por página** (padrão 10, a escolha fica no aparelho). **Duplicar** cria uma cópia ("Cópia de …") em rascunho com o mesmo texto e alcance, sem fixar, agenda nem métricas.
- **Moderação:** **Manter** (dispensa as denúncias), **Ocultar** (com motivo; some para os outros clientes, **não apaga**; o autor continua vendo o comentário e o motivo) e **Reexibir**. **Bloquear comentários** por publicação. Lista com o aviso das denúncias abertas.
- **Auditoria:** atos da equipe e do cliente (comentar, denunciar) são auditados; reagir e ler não.
- **Sem notificação:** publicar não gera sino nem e-mail para o cliente nesta fase; o aviso com push chega na Fase 3E (Avisos).

## 9E. Portal do Cliente, Fase 3C (documentos)

A equipe publica **arquivos** para os clientes; o cliente lista e baixa; **cada download fica registrado**. Hub: Portal do Cliente → aba **Documentos**; cliente: **Documentos** no menu. Roteiro em `roteiro_teste_portal_3c.md`.

### Permissões (catálogo v7; só o Administrador recebe)
`portal.documentos` (publicar, editar, tirar do portal e excluir). Quem só tem `portal.ver` lista, baixa e vê quem baixou.

### O documento
- **Cadastro:** título (até 160), descrição opcional (até 500), arquivo de **até 25 MB** e alcance (todos os clientes, ou empresas escolhidas, até 500). O arquivo não troca: outra versão é outro documento.
- **Envio e antivírus (o mesmo caminho dos anexos dos chamados):** o navegador envia o arquivo direto ao Garage por URL pré-assinada, a API confere o tamanho e o **ClamAV** varre antes de liberar. Estados: **Em verificação** → **Disponível** (limpo) ou **Bloqueado pelo antivírus** (infectado, nunca baixa, nem para a equipe). **Sem o antivírus configurado, o envio fica desligado** (503 `anexos_indisponiveis`).
- **Visibilidade:** o cliente só vê documento **Disponível, visível no portal e do alcance da empresa dele**. "Tirar do portal" esconde sem excluir; excluir é lógico (some do portal e da lista).
- **Download:** equipe, URL de 5 minutos; cliente, URL de **60 segundos**, sempre como arquivo (nunca abre no navegador). O cliente baixa por `POST` (a ação registra o download).
- **Registro:** cada download do cliente grava quem (o acesso), de que empresa-cliente e quando, e a equipe vê o total e a lista (os 200 mais recentes). É dado pessoal (ver `lgpd.md`). O ato do cliente também entra na auditoria (ator contato).
- **Busca do cliente:** por título e descrição, sem diferença de acento ou caixa.

## 9F. Portal do Cliente, Fase 3D (agenda e eventos)

A equipe publica **eventos** com vagas; o cliente **confirma a presença**, entra na **lista de espera** quando lota e é **promovido sozinho** quando abre uma vaga. Hub: Portal do Cliente → aba **Agenda**; cliente: **Agenda** no menu e painel **Próximos eventos** no Início. Roteiro em `roteiro_teste_portal_3d.md`.

### Permissões (catálogo v8; só o Administrador recebe)
`portal.agenda` (criar, editar, publicar, cancelar e excluir eventos, e tirar participantes). Quem só tem `portal.ver` vê a agenda, as vagas e os participantes.

### O evento
- **Dados:** título (até 160), descrição (Markdown restrito, até 5 mil), local, link online (`http` ou `https`), início e fim, **vagas totais** e **vagas por empresa** (vazio = sem limite), **prazo de confirmação** (vazio = até o início; nunca depois do início) e alcance (todos os clientes ou empresas escolhidas, até 500).
- **Situações:** **rascunho** (o cliente não vê) → **publicado** (início no futuro) → **cancelado** (com motivo, que é enviado aos participantes). Evento cancelado não se edita. Só rascunho ou cancelado se exclui (exclusão lógica).

### Confirmar, lista de espera e promoção (regras)
- **Confirmar:** com vaga livre no total **e** na empresa do cliente, fica **confirmado**; senão entra na **lista de espera**. Idempotente: pedir de novo devolve a situação atual. Recusas: evento cancelado, já iniciado ou prazo encerrado.
- **Cancelar a própria presença:** vale até o início do evento (o prazo de confirmação não impede cancelar). Se a pessoa estava confirmada, a vaga é oferecida à fila.
- **Promoção:** na **ordem da fila**, o primeiro que cabe nas vagas **do total e da empresa dele**; quem está com a empresa no limite é **pulado** (continua esperando). Quem sai da fila e volta, volta ao **fim**. A mesma promoção roda quando a equipe **tira um participante** ou **aumenta as vagas**.
- **Sem passar do limite:** confirmar e cancelar são funções do banco que **travam a linha do evento**, então vários cliques ao mesmo tempo nunca passam do limite (há testes de concorrência no banco e pela API).
- **Privacidade:** o cliente vê **quantas vagas restam**, as vagas da empresa dele (limite e quantos colegas confirmaram) e a situação dele; **nunca** o nome de outro participante.

### Avisos e lembrete
- **Promovido da fila:** sino e e-mail ao cliente ("Vaga confirmada"). **Evento cancelado:** sino e e-mail a confirmados e lista de espera, com o motivo. **Lembrete de 24 horas:** sino e e-mail aos **confirmados** dos eventos que começam em até 24 horas, **uma vez por evento** (o worker confere a cada 5 minutos). O e-mail depende de `PORTAL_URL` e do SMTP; sem eles só o sino sai.
- **.ics:** o cliente baixa o arquivo de calendário de qualquer evento que enxerga ("Adicionar à agenda").

### Equipe
Lista por **Próximos, Passados e Rascunhos** com vagas e fila (*Fase 4A: 5, 10 ou 20 por página*); detalhe com a descrição, o alcance, os **Confirmados** e a **Lista de espera** (posição, pessoa, e-mail e empresa); **Tirar** um participante. Atos da equipe e do cliente (confirmar, entrar na lista, cancelar presença) são auditados.

## 9G. Portal do Cliente, Fase 3E (avisos, preferências, push, PWA e busca)

A equipe envia **avisos curtos** que chegam no sino, no e-mail e no **celular (push)**; o cliente escolhe **horário de silêncio** e **e-mail por tipo**, instala o portal como app e usa a **busca global**. Hub: Portal do Cliente → aba **Avisos**; cliente: **Perfil e empresa → Notificações**, campo de busca no topo e tela **Busca**. Roteiro em `roteiro_teste_portal_3e.md`.

### Permissões (catálogo v9; só o Administrador recebe)
`portal.avisos` (enviar, agendar e cancelar avisos). Quem só tem `portal.ver` vê a lista e as estatísticas. Limite semanal: Configurações → Portal (`portal.configurar`).

### O aviso
- **Mensagem** de 1 a **140 caracteres** (aparece inteira na notificação), **link** opcional (uma tela do portal, como `/agenda`, ou um endereço `http(s)`; nunca `//` nem `javascript:`), **audiência** (todos os clientes com acesso ativo ou empresas escolhidas, até 500), **envio** agora ou agendado (horário no futuro) e **urgência**.
- **Situações:** agendado → **enviado** ou **cancelado**. Só o agendado se cancela; o que já saiu não volta. O envio é confirmado numa janela ("Vai para N empresas…"). A tela mostra a **prévia "como chega no celular"**.
- **Urgente:** chega na hora, **mesmo no horário de silêncio**, e **não conta no limite**. **Normal:** o push espera o fim do silêncio de cada pessoa.
- **Limite semanal:** no máximo **3 avisos normais por semana (segunda a domingo, horário de Brasília) por empresa-cliente** (configurável de 1 a 20). Conta os de alcance "todos" mais os do segmento que incluem a empresa; cancelados e urgentes não contam. Estourou: 409 `limite_semanal` e o botão fica desligado ("3 de 3"). Agendar para outra semana usa o limite daquela semana. Criar dois avisos ao mesmo tempo não passa do limite (trava por empresa-da-equipe).
- **Entrega** (feita pelo worker, na hora ou pela varredura de cada minuto): para cada pessoa com acesso **ativo** da audiência, grava o **sino** (notificação "Aviso"), enfileira o **e-mail** (se ela não desligou) e marca quando o **push** pode sair. Portal desligado: o aviso é dado como enviado a 0 pessoas. A mesma pessoa com acesso em duas empresas recebe um sino e um e-mail só.
- **Estatísticas** (equipe): **Entregues x de y**, **Lidos %** (ler a notificação no sino marca o aviso como lido), pushes aceitos e e-mails enfileirados.

### Push (Web Push com VAPID)
- **Consentimento é um clique:** em Perfil e empresa → Notificações → "Ativar avisos neste aparelho" (o navegador pede a permissão). Nunca se pede sozinho. Cada aparelho tem a sua inscrição; "Desativar neste aparelho" revoga.
- **iPhone/iPad:** o push só funciona com o portal **instalado na tela de início** (Safari → Compartilhar → Adicionar à Tela de Início). Fora disso a tela explica e o cliente recebe só sino e e-mail.
- **Estados mostrados:** sem suporte, instalar primeiro (iOS), bloqueado no navegador, desativado e ativo.
- **No servidor:** sem as chaves `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` o push fica desligado (a tela do cliente explica; sino e e-mail seguem). O push sai **no máximo uma vez** por pessoa e aviso; aparelho que o serviço de push recusa (404/410) é revogado, e 5 falhas seguidas também revogam. O conteúdo do push é só a mensagem do aviso e o link.
- O clique na notificação abre o link do aviso (ou o portal).

### Preferências do cliente
- **Horário de silêncio** (padrão: sem silêncio; ao ligar sugere 22:00 às 07:00; pode virar a noite): só adia o **push dos avisos normais**. **E-mail por tipo:** Chamados, Agenda e Avisos da equipe (padrão: todos ligados). O sino sempre mostra tudo. **E-mails de entrada e de segurança não são desligáveis.**

### PWA e busca global
- **PWA:** manifesto, ícones e service worker (`/sw.js`) tornam o portal instalável; o service worker **não guarda nada em cache** (só recebe push e abre o destino).
- **Busca:** no topo do portal (lupa no celular), pesquisa **chamados da própria empresa** (assunto, descrição, código ou número), **documentos** limpos e visíveis, **eventos** publicados e **publicações**, sem acento e sem diferenciar maiúsculas; até 5 por tipo; mínimo de 2 letras. Roda dentro da sessão do cliente: as mesmas regras de visibilidade valem (rascunhos, documentos em varredura e eventos de outras empresas nunca aparecem).

### Auditoria e privacidade
Criar e cancelar aviso (equipe) e ativar push (cliente) são auditados. Ver `lgpd.md` (preferências, inscrições de push e leituras de aviso são dados pessoais).

---

## 10. Usuários, papéis e carteira

### Perfis de acesso (Fase 1, ✅ testada e aprovada pelo Ale; registrado em 23/10/2026)

O papel fixo (Admin, Gestor, Vendedor) dá lugar a **perfis de acesso** configuráveis por empresa: **permissões por módulo e ação, com alcance**. Base da central de chamados (Fase 2, seção 9B) e do futuro portal do cliente (que não entra agora).

- **Nome e confusões a evitar:** "perfil de acesso" não é o *papel na decisão* do contato, nem o *perfil de regras* da importação, nem o `papel_conta` (dono, administrador, financeiro), que **não muda**.
- **Um perfil por membro por empresa** (`membros.perfil_id`). Sem múltiplos perfis.
- **Perfis de sistema:** **Administrador, Gestor e Vendedor** nascem com a empresa, são editáveis e **nunca se excluem**. O perfil Administrador não perde `perfis.gerir` nem `equipe.gerir`. Perfil criado pela empresa só se exclui sem membros. Há **duplicar**.
- **Catálogo:** chaves `modulo.acao` (29 na versão 1; `atividades.excluir` saiu antes de ser usada: excluir, concluir e cancelar a atividade são parte de `atividades.editar`, como antes dos perfis; a linha gravada nos perfis de sistema é ignorada) (ex.: `empresas.excluir`, `atividades.atribuir_responsavel`), versionado em `packages/shared/src/permissoes.ts`, só com módulos que existem hoje. Na partida da API, os perfis de sistema recebem as permissões novas padrão; **perfis da empresa nunca recebem permissão automaticamente**. *(Na versão 1 do catálogo não há o que sincronizar; o mecanismo entra com a primeira permissão nova, ver `backlog_pos_mvp.md`.)*
- **Alcance** (empresas, contatos, oportunidades e atividades): `propria`, `equipe` ou `todas`. *Equipe* = o próprio membro + subordinados diretos e indiretos pelo `gestor_id` (com proteção contra ciclo). O alcance é **por ação**, não por módulo: o Vendedor com "ver todas" fica com `ver = todas` e `editar = propria`.
- **Padrões dos perfis de sistema** (reproduzem os papéis antigos):

| Perfil | Acesso |
|---|---|
| **Administrador** | Todas as permissões, alcance `todas` |
| **Gestor** | Ver, criar, editar, excluir e transferir em toda a carteira; importação; geocodificação em lote; atribuir responsável; escolher a data de fechamento da oportunidade; ver e-mail da equipe. **Sem** cadastros, regiões, legenda, equipe, perfis, segurança, regras da carteira e alterar a data de criação da oportunidade |
| **Vendedor** | Ver, criar e editar **só a própria carteira**; sem excluir, transferir, importar, atribuir responsável nem cadastrar contato sem empresa |

- **Catálogo v11 (31/10/2026; plano em `plano_oportunidades_kanban_e_tags.md`):** `oportunidades.data_fechamento` (escolher o dia do fechamento; Administrador e Gestor) e `oportunidades.data_criacao` (alterar o dia da criação; só o Administrador). Os perfis de sistema existentes recebem as chaves na partida da API; perfis criados pela empresa, não.

- **Migração do interruptor** "Vendedores podem ver todas as empresas": ligado → perfil Vendedor da empresa com `ver = todas` e `editar = propria`; desligado → `propria` nas duas. O interruptor sai da tela Configurações → Carteira.
- **2FA** passa a ser o flag `exige_2fa` de cada perfil (Configurações → Segurança edita por perfil). A política antiga é convertida: `admin` → só o Administrador; `admin_gestor` → também o Gestor; `todos` → os três. Administrador de conta continua sempre exigido.
- **Proteções:** a empresa nunca fica sem um membro ativo com `perfis.gerir` (409); ninguém altera o próprio perfil nem tira `perfis.gerir` de si.
- **Tela** Configurações → Perfis de acesso: lista, matriz módulos × ações com seletor de alcance, aba "Usuários do perfil", duplicar, aviso de impacto ao salvar ("N usuários serão afetados") e visão "quem pode o quê". Em Equipe e convites, o seletor de perfil substitui o papel.
- **Auditoria:** criar e editar perfis (permissões antes/depois) e trocar o perfil de um membro.
- **API (Fase 1, commit 5):** `GET/POST /v1/perfis`, `GET/PATCH/DELETE /v1/perfis/:id`, `GET /v1/perfis/:id/membros`, `POST /v1/perfis/:id/duplicar` e `PUT /v1/membros/:id/perfil`, todas com `perfis.gerir`. Recusas: Administrador sem `perfis.gerir`/`equipe.gerir` (409 `permissao_protegida`); inativar ou excluir perfil de sistema (409 `perfil_de_sistema`); inativar ou excluir perfil com membros ou convite pendente (409 `perfil_em_uso`); tirar `perfis.gerir` do próprio perfil (409 `propria_permissao`); trocar o próprio perfil (403 `alterar_a_si_mesmo`) ou o do dono da conta (403 `dono_da_conta`); atribuir perfil inativo (409 `perfil_inativo`); nome repetido (409). Por fim, na mesma transação, a empresa precisa continuar com alguém ativo, com login, que gere os perfis (409 `sem_administrador`, defesa em profundidade). As mudanças de perfis de uma empresa são serializadas por uma trava transacional. Trocar o perfil grava no `papel` legado a chave do perfil de sistema, ou `vendedor` nos da empresa.
- **O servidor sempre decide;** o front só esconde (`pode(chave)`, `alcanceDe(chave)` e o componente `<Pode>`, a partir das permissões da empresa ativa no `/v1/me`). **No front (commit 7):** o menu mostra Empresas, Contatos, Oportunidades, Atividades, Mapa e Geolocalização só com a permissão de ver de cada uma; **Configurações** aparece para quem tem ao menos uma permissão de configuração e cada seção do menu interno, pela sua (Usuários e equipe: `equipe.gerir` ou `perfis.gerir`; cadastros e Importação: `cadastros.gerir`; Carteira: `carteira.configurar`; Geolocalização: `geolocalizacao.regioes` ou `geolocalizacao.legenda`; Segurança: `seguranca.gerir`), e `/configuracoes` abre a primeira permitida; o seletor de empresa e o cabeçalho mostram o **nome do perfil**; escolher outro responsável (atividade, oportunidade, empresa nova), importar, exigir a empresa do contato novo e as ações de geolocalização seguem as permissões. Em **Usuários e equipe**, o seletor de **perfil** substitui o de papel (trocar perfil e convidar: `perfis.gerir`; desativar: `equipe.gerir`; tirar de alguém a gestão dos perfis pede confirmação); o convite é feito com um perfil (padrão: Vendedor) e o convidado vê o nome do perfil.
- **Perfil efetivo do membro:** o do membro (`perfil_id`); enquanto o membro não tem perfil (transição até a contração), o perfil de **sistema do papel** dele, a mesma regra do backfill; sem perfil de sistema, **nenhuma permissão**. Perfil **inativo ou excluído = nenhuma permissão** (não volta para o do papel). Chave fora do catálogo é ignorada.
- **`GET /v1/me`** traz, em cada empresa, o `perfil` (`{id, nome}` ou nulo) e as `permissoes` (`chave → alcance` ou `true`); o `papel` continua no payload até a contração.
- **Toda rota de negócio decide pelo perfil** (commit 6 da Fase 1): declara `@Permissao` (chaves do catálogo) ou `@TodoMembro`; as públicas e de identidade (saúde, login, primeiro acesso, convite do convidado, `/v1/me`, troca de empresa, preferências, criar empresa pela conta, consulta de CNPJ) ficam numa lista explícita. Um teste (`rotas-com-decisao.test.ts`) falha se uma rota nova não declarar a decisão. Nenhuma regra lê mais o `papel`.
- **Módulos já decididos pelo perfil** (recusa: 403 `acesso_negado`, o mesmo código de antes): **cadastros auxiliares** (escrever exige `cadastros.gerir`; ler é de todo membro, marca `@TodoMembro`); **equipe e convites** (convidar exige `equipe.gerir` **e** `perfis.gerir`, porque convidar com um perfil é atribuí-lo: **um perfil só com `equipe.gerir` não convida** (decisão do Ale, 22/10/2026); listar e cancelar convites, desativar e reativar, `equipe.gerir`; a lista da equipe é de todo membro, com o e-mail só para `equipe.ver_emails` e o último acesso só para `equipe.gerir`; trocar o `papel` pelo PATCH antigo vira o perfil de sistema dele e exige `perfis.gerir`; desativar também respeita a regra de nunca ficar sem quem gere os perfis); **configurações** (Carteira: alterar exige `carteira.configurar`, ler é de todo membro, e o interruptor "Vendedores podem ver todas as empresas" **saiu da API e da tela**; Segurança: alterar exige `seguranca.gerir`, ler é de todo membro); **carteira** (empresas, contatos, oportunidades, atividades e Dashboard: cada rota exige a permissão da ação, ex.: `empresas.ver`, `oportunidades.criar`, `contatos.excluir`, e o serviço aplica o **alcance** dela; passar a carteira exige `empresas.transferir`; cadastrar contato sem empresa, `contatos.criar_sem_empresa`; escolher outro responsável, `oportunidades.atribuir_responsavel` e `atividades.atribuir_responsavel`).
- **Regras de alcance da carteira** (iguais às antigas nos perfis de sistema): a empresa conta pelo responsável (`vendedor_id`); a oportunidade, pelo responsável da empresa; o **contato**, pelas empresas a que está vinculado (vínculo ativo), e o contato **sem empresa** só aparece para quem tem ver **e** editar contatos com alcance `todas`; a **atividade**, pelo responsável da empresa, e a Tarefa sem empresa, pelo responsável dela no alcance de `atividades.editar` (o vendedor que "vê todas" continua vendo só as Tarefas soltas dele); excluir, concluir e cancelar a atividade seguem `atividades.editar`. O Dashboard segue `empresas.ver`. **Importação**: lotes, prévia, execução, relatório e modelo exigem `importacao.executar` (o worker relê o perfil de quem iniciou a cada bloco e encerra o lote se a permissão sair); perfis de regras da importação: ler e conferir CNAEs, todo membro; escrever, `cadastros.gerir`. **Geolocalização e mapa**: lotes de geocodificação, `geolocalizacao.lotes`; criar, alterar e excluir regiões, `geolocalizacao.regioes`; legenda do mapa, `geolocalizacao.legenda`; resumo, fila, pontos, próximas, seleção e cobertura seguem o alcance de `empresas.ver`; ajustar a posição, confirmar o endereço e geocodificar uma empresa, `empresas.editar`; regiões, opções e legenda (leitura), todo membro. O filtro de vendedor do mapa aparece só para quem vê a carteira de todos.
- **Transição:** o `papel` antigo continua gravado como legado, mas nenhuma regra nova lê o papel. A contração (remover `papel`, `perfil_id NOT NULL`, remover o interruptor) fica para depois de duas semanas de uso real (`backlog_pos_mvp.md`).

> A Fase 1 foi entregue (22/10/2026) e aprovada pelo Ale (registrado em 23/10/2026): quem decide é o **perfil de acesso**. As descrições por papel abaixo e nas demais seções valem como os **padrões dos perfis de sistema** (Administrador, Gestor e Vendedor).

### Papéis padrão (anterior à Fase 1)
| Papel | Acesso |
|---|---|
| **Admin** | Tudo, incluindo configurações, usuários e funis |
| **Gestor** | Vê e edita todas as carteiras e relatórios da equipe; sem acesso às configurações do sistema |
| **Vendedor** | Vê e edita **apenas a própria carteira** (empresas em que é responsável e o que estiver ligado a elas) |

### Regras de carteira
- Cada empresa tem **um responsável**.
- Configuração do tenant: **"Vendedores podem ver todas as empresas"** (ligado/desligado) *(Fase 1: saiu da API e da tela Configurações → Carteira; virou o alcance de `ver` do perfil Vendedor. A coluna fica no banco até a contração)*. Quando ligado, o vendedor vê tudo, mas edita só a própria carteira.
- **Transferência de carteira:** o gestor ou admin move empresas (individual ou em massa) para outro responsável, com opção de levar junto as oportunidades e atividades abertas.
- Toda alteração relevante fica registrada no **log de auditoria**.

### Multiempresa (v1.4)
- Uma **Conta** (o administrador ou o grupo) pode ter **várias empresas** no CRM. Cada empresa é um tenant **isolado**: carteira, equipe, funis, tags e configurações próprios.
- **Empresa ativa no login:** ao entrar, a sessão já começa na **última empresa usada** (guardada por usuário); sem histórico e com uma só empresa, nela; com várias e nenhuma usada antes, o sistema mostra o **seletor de empresa** antes de abrir o app (`GET /v1/me` traz `precisaEscolherEmpresa`). Empresa suspensa/cancelada ou da qual a pessoa saiu não conta.
- **Seletor de empresa** no topo, que troca a empresa ativa sem sair do sistema. No celular, fica no menu do perfil.
- **Um login, vários papéis:** o mesmo usuário pode ser admin numa empresa e vendedor em outra. O papel é definido por empresa.
- **Painel consolidado** (administradores da conta): soma das empresas para funil, previsão (inclusive MRR), conquistados × perdidos, atividades da equipe e carteira por status, com filtro por empresa. Só leitura; para agir, abre a empresa.
- **Copiar configurações** de uma empresa para outra (funis, tags, tipos de atividade, origens, motivos, soluções, produtos, faixas, verticais, campos personalizados e quadro modelo). Útil ao criar uma nova empresa no grupo.
- **Criar empresa (tela `/criar-empresa`, E16a):** só o dono ou administrador da conta, pelo item "Criar empresa" do seletor. Razão social obrigatória; nome fantasia e CNPJ opcionais (CNPJ validado, alfanumérico, com dígitos verificadores). A empresa nasce em teste, com as configurações padrão e quem criou como administrador, e a pessoa já entra nela. **Não há unicidade global de CNPJ** (não revela que outra conta existe): só um aviso quando a **mesma conta** já tem o CNPJ. Consulta à Receita e cópia de configurações ficam para depois. Registrada na auditoria.
- **Gestão da conta:** criar ou desativar empresas, administradores da conta (dono, administrador, financeiro) e, no futuro, plano e cobrança.
- **Notificações** de todas as empresas na mesma central, com a identificação da empresa.
- Uma mesma empresa cliente pode existir em duas empresas do grupo, como cadastros independentes. Não há compartilhamento de carteira.

### Equipe e convites (E16a)

- **Quem usa:** só o **administrador da empresa ativa** (Configurações → Usuários e equipe). Gestor e vendedor não veem o menu nem a rota. A visão de equipe do gestor vem com a carteira e o painel, no MVP.
- **Lista:** nome, e-mail, papel, situação (*Ativo*, *Inativo*, *Convidado*, *Convite expirado*), com ou sem acesso e **último acesso** (só a data, aproximada: vem da sessão mais recente, atualizada no máximo uma vez por dia, até existir o registro de acessos).
- **Convidar** por e-mail com **perfil de acesso** (Fase 1: `perfilId`; o `papel` vira o perfil de sistema dele) (validade de 7 dias, uso único). O convidado vê o nome do perfil e o e-mail diz "com o perfil X"; ao aceitar, o membro já nasce com o perfil; **reenviar** cria outro convite e o anterior deixa de valer; **cancelar** invalida o link. O link inválido, vencido, cancelado ou já usado mostra a **mesma** tela "Convite inválido" (a API não revela o motivo).
- **Mudar papel, desativar e reativar:** desativar vale na próxima requisição da pessoa e mantém o histórico. Quem está com a sessão aberta recebe um aviso claro e é levado a outra empresa dela, se houver, ou ao login.
- **Proteções:** ninguém altera o próprio papel nem a própria situação; o **dono da conta** não é rebaixado nem desativado por outro administrador; a empresa nunca fica sem administrador ativo.
- **Auditoria:** criar empresa, convidar, cancelar convite, mudar papel, desativar e reativar geram registro (quem, o quê, **IP**).

### Segurança e acesso (v1.6)

**Verificação em duas etapas (2FA, app autenticador/TOTP) para todos os usuários.**

- **Ativação voluntária:** em **Meu perfil → Segurança** (folha de perfil no celular), qualquer usuário (admin, gestor ou vendedor) ativa o 2FA lendo um QR code (ou digitando a chave) e confirmando com um código; recebe **códigos de recuperação** de uso único, mostrados uma vez.
- **Desativar:** pede a **senha e um código atual** do app. Não é possível enquanto alguma regra exigir o 2FA daquele usuário (ver abaixo). A mesma tela **gera novos códigos de recuperação** (pede a senha; os antigos deixam de valer).
- **Exigência por perfil de acesso (Fase 1):** cada **perfil** tem o flag **`exige_2fa`**; quem tem um perfil que o exige é obrigado a ter 2FA naquela empresa. Configurações → **Segurança** mostra os perfis com um interruptor cada (`seguranca.gerir`; `PATCH /v1/configuracoes/seguranca` com `{ perfis: { [perfilId]: exige2fa } }`, registrado na auditoria); o editor de perfis também muda o flag. O perfil **Administrador sempre exige** (409 `admin_exige_2fa`), como em toda política antiga. O membro que ainda não tem perfil (transição até a contração) segue a **política antiga** por papel, abaixo. Na migração, cada empresa teve a política convertida para os perfis de sistema (`admin` → Administrador; `admin_gestor` → também Gestor; `todos` → os três).
- **Política antiga por empresa (só para quem ainda não tem perfil):** em `tenant_configuracoes.dois_fatores_exigido`:

| Valor | Obriga |
|---|---|
| `admin` (padrão) | administradores da empresa |
| `admin_gestor` | administradores e gestores |
| `todos` | todos os membros (admin, gestor e vendedor) |

- **Como a regra é aplicada:** vale o **perfil que a pessoa tem na empresa ativa** (ou, sem perfil, a política antiga para o papel). Quem entra numa empresa que o exige e ainda não tem 2FA é levado à **ativação** e fica barrado nas demais telas e rotas (`403 2fa_obrigatorio`) até ativar. **Ao trocar de empresa vale a regra da nova:** a troca sempre é permitida, e o mesmo usuário pode estar livre numa empresa e barrado em outra. A mudança da política vale na próxima requisição de cada pessoa.
- **Administradores da conta** (dono ou administrador, painel consolidado) precisam de 2FA sempre, qualquer que seja a política.
- **Quem não pode desativar:** administradores da conta e qualquer usuário a quem a política de **alguma** das empresas dele obriga (o administrador não desativa enquanto a regra exigir).
- **Quem altera:** quem tem `seguranca.gerir` (por padrão, o Administrador), pela tela **Configurações → Segurança**, perfil por perfil; ou `perfis.gerir`, no editor do perfil.
- **Outras regras de acesso:** login com e-mail e senha (mínimo de 10 caracteres), mensagens que **não revelam** se um e-mail existe (login e recuperação de senha), recuperação por link de 1 hora e uso único, confirmação de e-mail, convite de 7 dias e uso único, **sessão de 7 dias** renovada por uso. Google só entra para quem já tem conta (e só se a flag estiver ligada).

---

## 11. Configurações (cadastros auxiliares)

| Cadastro | Quem acessa |
|---|---|
| Grupos de tags e tags | Admin |
| Tipos de atividade | Admin |
| Funis e etapas | Admin |
| Origens de oportunidade | Admin |
| Motivos de perda | Admin |
| Catálogo de produtos | Admin / Gestor |
| Campos personalizados | Admin |
| Usuários e papéis | Admin (**tela pronta na E16a**: convidar por e-mail com papel, reenviar e cancelar convites, mudar papel, desativar e reativar; ver "Equipe e convites" na seção 10) |
| Integrações | Admin (chaves de API, webhooks, conexões WhatsApp, logs). Fase futura, com menu previsto |
| Quadro de tarefas modelo e etiquetas da equipe | Admin / Gestor |
| Modelos de e-mail | Admin / Gestor (modelos da empresa); cada usuário pode ter os seus |
| Contas conectadas (visão geral) | Admin (vê quem conectou e pode revogar) |
| Preferências do tenant | Admin (visão de carteira, validade das tags de visitação, automação de status, dias de "sem contato") |
| Visitas (resultados, modelos de relatório e check-in) | Gerir cadastros (Admin por padrão; G3, seção 3C) |
| Pontos de partida das rotas e minutos por visita | Gerir cadastros (Admin por padrão; G4, seção 3D) |
| Segurança | Admin (**política de 2FA** da empresa: administradores, administradores e gestores, ou todos; ver "Segurança e acesso") |
| E-mail (SMTP próprio) 🔮 | Admin (servidor de envio da empresa; ver abaixo). **Funcionalidade futura, ainda não implementada** |

**Regra de exclusão (v1.6, decidida em 13/10/2026), para todos os cadastros acima** (tags e grupos de tags, tipos de atividade, funis e etapas, origens, motivos, soluções, verticais): **só se exclui o que nunca foi usado; o que já foi usado só se inativa**. Assim nenhum histórico perde o nome do que usou (conversão Lead → Cliente, "fase em que parou", motivo de perda, origem, tipo de atividade). Item inativo some das escolhas novas e continua aparecendo no que já o usa. Os itens protegidos do sistema (seções 2, 5 e 6) não se excluem nem se inativam, mesmo sem uso.

### Configurações → E-mail (SMTP próprio da empresa) 🔮

> **Futura (ainda não implementar).** Registrada aqui para orientar o desenho; a tabela prevista está em `modelagem_banco.md`, 11.1 (`tenant_smtp`).

- O admin da empresa pode cadastrar o **próprio servidor SMTP**: servidor, porta, segurança (SSL/TLS, STARTTLS ou nenhuma), usuário, senha e remetente (nome e endereço).
- A **senha é cifrada** com a `TOKEN_ENCRYPTION_KEY` (AES-256-GCM, com o prefixo de versão da chave) e **nunca volta à tela nem aos logs**: depois de salva, a tela mostra só "senha cadastrada" e permite substituí-la.
- O botão **"Enviar teste"** envia uma mensagem ao e-mail do próprio admin usando os dados do formulário (mesmo antes de salvar) e mostra o resultado ou o erro do servidor. A configuração só vale como ativa depois de um teste bem-sucedido.
- **Quais e-mails usam qual servidor:**
  - **E-mails da empresa** (envio pelo CRM sem conta conectada, resumos, avisos e notificações por e-mail): saem pelo SMTP da empresa, se estiver ativo; **sem configuração, saem pelo SMTP da plataforma** (o mesmo `SMTP_*` do Coolify).
  - **E-mails de acesso** (verificação de e-mail, recuperação de senha, convites e 2FA): **sempre saem pelo SMTP da plataforma**, nunca pelo da empresa. Assim um SMTP próprio errado ou fora do ar não tranca ninguém para fora, e o remetente dos e-mails de segurança é sempre o da plataforma.
- Se o SMTP da empresa falhar, a tentativa é registrada e repetida pela fila (como os demais e-mails); o admin vê o último erro na tela.
- Só o admin acessa. Alterações e testes vão para a auditoria (sem a senha).

---

## 12. Recursos transversais

- **Busca global** (barra no topo; plano em `plano_busca_global.md`, roteiro em `roteiro_teste_busca_global.md`): **empresas** (nome fantasia, razão social, cidade e CNPJ com ou sem máscara), **contatos** (nome, e-mail e telefone) e **oportunidades** (título e nome da empresa), sem acento e sem diferenciar maiúsculas. **Tarefas ficam para uma fase seguinte.**
  - **Mínimo de 2 letras**; até **5 por tipo**; quem **começa** com o termo vem antes de quem só o contém, depois o atualizado mais recentemente.
  - **Respeita a carteira:** cada tipo segue o alcance do perfil (`empresas.ver`, `contatos.ver`, `oportunidades.ver`); quem não vê um tipo não recebe resultados dele. Excluídos não aparecem.
  - **Desktop e tablet:** sugestões enquanto digita, abaixo da caixa, em seções Empresas, Contatos e Oportunidades (a empresa mostra "Cidade/UF · vendedor" e o Status; o contato, a empresa e o cargo; a oportunidade, a empresa, a fase e o valor). Setas, Enter e Esc; **Ctrl+K** (⌘K) ou **/** levam o foco à busca. Escolher um item abre a ficha. **Enter** sem item marcado, ou "Ver todos os resultados", abre a tela **Busca** (`/busca?q=`).
  - **Tela Busca** (e a **lupa do celular**): o termo fica na URL; cada seção tem **"Ver todos em Empresas/Contatos/Oportunidades"**, que abre a lista do tipo já filtrada.
  - **Buscas recentes:** com a caixa vazia aparecem as **10 últimas buscas** da pessoa (guardadas no servidor, acompanham entre o desktop e o celular, separadas por empresa). Só entra a busca **concluída** (escolheu um resultado ou apertou Enter); termo repetido (até com acento diferente) volta ao topo. Um **x** apaga um termo e **"Limpar histórico"** apaga todos. **Ninguém vê o histórico de outra pessoa**, nem o administrador; desativar o membro apaga o histórico dele.
- **Central de notificações** (sino no topo) + **notificações push** (PWA/app) + e-mail opcional. Eventos: tarefa atribuída, prazo próximo ou vencido, atividade atrasada, e-mail aberto ou clicado, mensagem de WhatsApp de número não identificado, oportunidade parada. Cada usuário escolhe o que recebe e por qual canal.
- **Log de auditoria** em empresa, contato e oportunidade.
- **Responsivo e PWA:** botões grandes no celular, ações rápidas (ligar, WhatsApp, rota) e um botão "+" flutuante para registrar atividade.
- **Offline (leitura + fila):** consultar a carteira e registrar atividades sem internet.
- **Exclusão segura:** soft delete com lixeira (restaurável por X dias, admin).

---

## 13. Integrações (fase futura, com base preparada na Fase 1)

### 13.1 WhatsApp — Evolution API

**Objetivo:** registrar no CRM as conversas de WhatsApp com os contatos, sem digitação manual.

**Conexão**
- Evolution API self-hosted (container no Coolify).
- Cada **usuário (vendedor)** conecta o próprio número por QR Code. Opcionalmente também um **número da empresa** (compartilhado).
- Tela de status da conexão (conectado, desconectado, reconectar).

**Recebimento e identificação**
- A Evolution envia as mensagens ao CRM por **webhook** (enviadas e recebidas).
- O número é normalizado (formato internacional **E.164**) e comparado com os telefones dos **contatos** e das **empresas**.
- Contato ligado a **várias empresas**: usa o contato principal ou a empresa da última interação, e o usuário pode reatribuir.
- **Número desconhecido:** a conversa vai para a caixa **"Conversas não identificadas"**, onde é possível:
  - criar um contato ou lead a partir dela;
  - vinculá-la a um contato existente;
  - ignorar o número (por exemplo, um número pessoal).

**Registro no CRM**
- As mensagens são agrupadas em uma **atividade do tipo WhatsApp por conversa/dia** (não uma atividade por mensagem).
- A atividade mostra a conversa completa em **formato de chat** na linha do tempo da empresa, do contato e da oportunidade (se vinculada).
- **Mídias** (imagens, áudios, documentos) são salvas no **Garage**, ligadas à atividade.
- Conta como **Contato**: atualiza *último contato em* e aplica a tag *Contactada*. Configurável: contar só quando o vendedor envia mensagem, ou também quando só recebe.
- O usuário pode vincular a atividade a uma oportunidade depois.

**Modos de importação (configurável por tenant ou usuário)**
| Modo | Funcionamento |
|---|---|
| Automático | Toda conversa com número cadastrado é registrada |
| Manual | O usuário clica em **"Importar conversa"** no contato e escolhe o período |
| Desligado | Integração apenas para envio (futuro) |

**Histórico anterior à conexão ("se possível")**
- A partir da conexão o registro é garantido.
- Mensagens **antigas** dependem do que o WhatsApp sincroniza com a instância (geralmente parte do histórico recente). O CRM tenta importar pelo "Importar conversa", **sem garantia de histórico completo**.

**Envio pelo CRM (etapa posterior)**
- Botão "Enviar WhatsApp" no contato/empresa, com **modelos de mensagem** e variáveis (nome, empresa…).
- A mensagem enviada já é registrada na atividade.

**Privacidade, segurança e riscos**
- Só são registradas conversas de números **cadastrados** (ou aprovados na caixa de não identificados), evitando guardar conversas pessoais.
- As conversas seguem as **regras de carteira**: o vendedor vê as da própria carteira, e gestor e admin veem todas.
- Retenção configurável e exclusão a pedido do titular (**LGPD**).
- ⚠️ A Evolution com conexão via WhatsApp Web (Baileys) **não é oficial** e há risco de bloqueio do número em uso abusivo (envio em massa). Para volume alto, avaliar a **API oficial (WhatsApp Cloud API)**, que a Evolution também suporta.

### 13.2 n8n — Automações

> **Plano de execução:** [`plano_api_aberta.md`](plano_api_aberta.md) (chaves de API, API pública `/v1/publica/*` e webhooks; fases I1 a I4).

**O CRM avisa o n8n (webhooks de saída)**
- O admin cadastra **webhooks** e escolhe os **eventos**:

| Grupo | Eventos |
|---|---|
| Empresa | criada · atualizada · tag alterada · responsável alterado |
| Contato | criado · atualizado |
| Atividade | criada · concluída · atrasada |
| Oportunidade | criada · fase alterada · status alterado (conquistada, perdida, cancelada, suspensa) · parada (alerta) |
| WhatsApp | conversa registrada · número não identificado |

- Payload JSON padronizado (evento, data, tenant, dados do registro e quem alterou): o envelope de `plano_api_aberta.md` §6.2, com o registro no formato da API pública. Também `importacao.concluida` (um por lote; a importação não avisa empresa por empresa).
- **Assinatura HMAC** para o n8n validar a origem.
- **Reenvio automático** com espera progressiva em caso de falha, além de um **log de entregas** com status e botão "reenviar".

**O n8n atua no CRM (API REST)**
- **Chaves de API por tenant**, com nome, permissões (leitura/escrita por módulo), validade e revogação.
- O n8n usa a **API pública** (`/v1/publica/*`, documentação aberta em `/v1/publica/docs`) pelo nó *HTTP Request*, com a chave no cabeçalho `Authorization: Bearer`. Futuramente pode haver um **nó próprio do CRM** para o n8n.
- As ações feitas via API ficam no log de auditoria como *"Integração: <nome da chave>"*.

**Exemplos de automações**
- Formulário do site / landing page → cria empresa (Lead) + oportunidade + atividade de retorno.
- Oportunidade **ganha** → mensagem de boas-vindas no WhatsApp + tarefa de onboarding.
- Oportunidade **parada** → aviso ao vendedor e ao gestor (WhatsApp, Telegram ou e-mail).
- Resumo diário da agenda para cada vendedor.
- Empresa sem contato há X dias → cria atividade de follow-up automaticamente.
- Sincronização com ERP, faturamento ou planilhas.

### 13.3 E-mail — registro, envio e rastreamento

**Como funciona o registro (duas formas, ambas disponíveis)**

| Forma | Como o vendedor usa | Prós / contras |
|---|---|---|
| **1. Conta conectada** (padrão) | Em *Minhas conexões*, clica em "Conectar Google" ou "Conectar Microsoft" e autoriza | Automático: registra também os e-mails enviados **fora do CRM** (pelo Gmail/Outlook normal). Requer autorização da conta |
| **2. Cópia oculta (BCC)** | Coloca o endereço do CRM (ex.: `registro@aledias.com.br`) em **Cco** ao enviar | Funciona com qualquer provedor e sem conectar a conta. Depende de o vendedor lembrar |

**Regras do registro**
- Só são registrados e-mails trocados com **endereços de contatos cadastrados**. Opcionalmente, também com o **domínio da empresa** (ex.: qualquer `@cliente.com.br`).
- Cada **conversa (thread)** vira uma **atividade do tipo E-mail**, com as mensagens em sequência, ligada à empresa/contato (e à oportunidade, se o vendedor vincular).
- Anexos: opção de salvar no CRM (Garage) ou só listar o nome.
- E-mail **enviado** pelo vendedor conta como **Contato** (atualiza *último contato em* e a tag *Contactada*).
- **Privacidade:**
  - lista de domínios e endereços **ignorados** (ex.: pessoais e internos);
  - o vendedor pode marcar um e-mail como **privado**, e então só o título fica visível para outros;
  - as regras de carteira continuam valendo.
- E-mail de remetente desconhecido não é importado (evita lixo). No BCC, cai na caixa de **não identificados**.

**Envio pelo CRM**
- Botão "**Enviar e-mail**" na empresa, contato ou oportunidade.
- Editor com formatação, **assinatura** do usuário, **anexos** (do computador ou dos arquivos do CRM) e **modelos** com variáveis (`{{contato.nome}}`, `{{empresa.nome}}`, `{{vendedor.nome}}`…).
- O e-mail sai **pela conta conectada do vendedor** (fica na pasta Enviados dele e as respostas chegam na caixa dele). As respostas também são registradas no CRM pela sincronização.
- Sem conta conectada: envio por SMTP configurado pelo tenant, com o e-mail do vendedor como *responder para*.
- Agendar envio (enviar mais tarde).

**Rastreamento de abertura e cliques (opcional por envio)**
- O vendedor liga ou desliga em cada e-mail (padrão configurável pelo admin).
- A abertura é detectada por uma imagem invisível e o clique por links redirecionados pelo domínio do CRM.
- O histórico mostra: *aberto 3x (último em 10/10 14:32)*, *clicou em "proposta.pdf"*.
- Notificação ao vendedor na **primeira abertura** e nos cliques.
- ⚠️ **Limitações:**
  - não é 100% preciso: Apple Mail e alguns provedores pré-carregam as imagens (gerando "aberturas" falsas), e outros bloqueiam imagens (sem registro);
  - só funciona em e-mails **enviados pelo CRM**.
- **LGPD:** citar o rastreamento na política de privacidade; sem rastreamento em e-mails sensíveis.

**Resposta à dúvida "como implantar"**
1. Cada vendedor autoriza o CRM a acessar o e-mail (login Google/Microsoft, padrão OAuth). O CRM **não guarda senha**, só um token que pode ser revogado.
2. Um processo em segundo plano verifica a cada poucos minutos (ou recebe aviso do provedor) se houve e-mail novo com algum contato cadastrado.
3. Encontrando, cria ou atualiza a atividade de e-mail na ficha da empresa.
4. O BCC funciona como uma caixa de e-mail própria do CRM, que ele lê e distribui da mesma forma.

### 13.4 Agendas — Google Agenda e Microsoft (Outlook/Teams)

- Usa a **mesma conexão** do e-mail (um único "Conectar Google/Microsoft" autoriza e-mail e agenda, e o usuário pode escolher só um dos dois).
- **CRM → Agenda:** toda atividade **agendada** no CRM (visita, reunião, ligação) pode ir automaticamente para a agenda do vendedor. É configurável por tipo de atividade.
- **Marcar reunião com o cliente:** ao agendar, é possível:
  - **convidar os contatos** (o convite sai pela agenda do vendedor);
  - gerar o **link de Google Meet ou Microsoft Teams** automaticamente;
  - ver a **disponibilidade** do vendedor (horários livres e ocupados) antes de escolher o horário.
- **Agenda → CRM:**
  - mudou o horário ou cancelou na agenda → atualiza a atividade no CRM;
  - evento criado direto na agenda **com participantes que são contatos do CRM** → é importado como atividade (automático ou com confirmação, configurável).
- Eventos pessoais (sem contatos do CRM) **não são importados**.
- **Futuro:** link público de agendamento (estilo Calendly), em que o cliente escolhe um horário livre e a atividade é criada sozinha.

### 13.5 Preparação já na Fase 1
Para as integrações entrarem depois **sem retrabalho**, a Fase 1 já inclui:
- Telefones armazenados também no formato **E.164** (padrão para comparar com o WhatsApp).
- Atividades com campo **Origem** (Manual · WhatsApp · Integração/API) e **ID externo** (evita duplicidade na importação).
- **Registro interno de eventos** (toda alteração relevante gera um evento), que depois alimenta os webhooks.
- Tela **Configurações → Integrações** (chaves de API e webhooks com o log de entregas, entregues com a API aberta; conexões WhatsApp ficam para a fase delas).
- Anexos de atividades já suportados (Garage), usados para as mídias do WhatsApp e anexos de e-mail.
- E-mails de contatos normalizados (minúsculas) e **domínio** da empresa cadastrado, para identificar e-mails automaticamente.
- Atividades com **participantes** (vários contatos) e **ID externo** também para e-mail (thread) e eventos de agenda.
- Estrutura de **contas conectadas** por usuário (WhatsApp hoje; Google/Microsoft depois).
- **Central de notificações** já na Fase 1 (usada por tarefas e atividades atrasadas).

---

### 13.6 Situação financeira (adimplência) — decisão do Ale, 28/10/2026

**Objetivo:** marcar sozinho, nas empresas com Status **Cliente** (na empresa do Ale, "Associado"), se as cobranças estão em dia. Vale para qualquer ERP e, no futuro, para o módulo financeiro do próprio Leadtogo.

**Quem faz o quê**
- **O CRM guarda os títulos e decide a tag.** A regra fica no CRM: é testada, auditada e configurável por tenant.
- **O ERP só fornece os dados**, por um conector externo (hoje um workflow do **n8n** que funciona como *middleware* com o **Omie**) que grava na **API aberta** (§13.2) com uma chave de escopo `financeiro.escrita`. Conector nativo do Omie só se a demanda justificar, e grava pelo mesmo contrato.
- **Quem é associado é definido no CRM** (tag de Status com `chave_sistema = 'cliente'`, nunca pelo nome). A planilha de associados do Google Drive deixa de ser a fonte: o n8n pede a lista ao CRM.

**Contrato (independente de ERP)**
- `GET /v1/publica/empresas?status=cliente`: CNPJs que o conector precisa consultar.
- `POST /v1/publica/financeiro/posicoes`: `fonte`, `referencia_em` e, por empresa, o `cnpj` e os **títulos em aberto** (`id_externo`, `vencimento`, `valor`, `parcela`), ou `sem_cadastro: true` quando o CNPJ não existe no ERP. A lista de cada CNPJ **substitui** a anterior daquela fonte: o título que some foi recebido ou cancelado. Idempotente por `fonte + id_externo`.
- A chave do contrato é o **CNPJ**. Ligar o CNPJ ao código interno do ERP (no Omie, `codigo_cliente_fornecedor`) é trabalho do conector.
- **Títulos considerados:** todos os títulos em aberto do cliente no ERP (no Omie, `A VENCER` e `ATRASADO`; `RECEBIDO` e `CANCELADO` não são enviados). Não há no Omie um campo que identifique a mensalidade; se for preciso excluir algum tipo de título, o filtro fica no conector.

**Regra (grupo de tags de sistema Financeiro: seleção única, automático, não aceita aplicação manual; tags renomeáveis, com chave de sistema)**
| Situação | Tag (`chave_sistema`) |
|---|---|
| Nenhum título vencido há mais que a tolerância | **Adimplente** (`adimplente`) |
| Título vencido mais antigo com atraso de 1 a 90 dias | **Inadimplente** (`inadimplente`) |
| Título vencido mais antigo com atraso acima de 90 dias | **Desassociação** (`desassociacao`) |
| CNPJ não encontrado no ERP | **Sem cadastro no ERP** (`sem_cadastro_erp`) |

- Atraso em **dias corridos** pelo título vencido mais antigo, no fuso da empresa.
- **Tolerância configurável** por tenant (padrão 0 dia): atraso até a tolerância conta como Adimplente. A tolerância **não** desloca o limite de 90 dias.
- Só empresas com Status Cliente. A empresa que deixa de ser Cliente perde a tag Financeiro.
- Pagou: volta sozinha para Adimplente. Toda troca entra no histórico (origem "Integração: <nome da chave>").
- **Desassociação só marca e avisa** (notificação ao gestor e ao admin); **nunca** muda o Status sozinha. Desassociar é decisão humana.

**Webhooks de saída:** `empresa.situacao_financeira_alterada` (cobrança por WhatsApp ou e-mail, aviso ao gestor) e `empresa.tag_alterada` ao virar Cliente (o conector consulta na hora, sem esperar a rodada diária).

**Ordem:** 1) chaves de API e API aberta; 2) recurso financeiro (tabelas, regra, grupo de tags, tela em Configurações, webhook); 3) workflow modelo do n8n para o Omie.

---

## 14. Fora da Fase 1 (próximas fases)

| Fase | Funcionalidade |
|---|---|
| 2 — Geolocalização | **G1 (geocodificação) e G2 (mapa) ✅ testados e aprovados pelo Ale em 22/10/2026, ver `plano_geolocalizacao.md` e a seção 3B.** Check-in de visita com GPS e relatório (G3) **✅ testado e aprovado pelo Ale em 22/10/2026** (seção 3C) |
| 3 — Roteirização (G4) | **✅ testado e aprovado pelo Ale em 23/10/2026** (plano aprovado em 23/10/2026, `plano_geolocalizacao.md`, seção 10; seção 3D; roteiro `roteiro_teste_geo_g4.md`; no máximo 30 paradas por rota). Montar roteiro do dia com base em filtros (ex.: sem visita há 90 dias + cidade), otimização da ordem (VROOM) e navegação |
| 4 — WhatsApp | Integração Evolution API: registro automático/manual de conversas, caixa de não identificados e, depois, envio pelo CRM (ver seção 13.1) |
| 5 — n8n | Webhooks de saída, chaves de API e automações (ver seção 13.2) |
| 6 — E-mail | Conexão Google/Microsoft + BCC, registro automático, envio pelo CRM com modelos, rastreamento de abertura/cliques (ver seção 13.3) |
| 7 — Agendas | Sincronização com Google Agenda e Microsoft, convites, Meet/Teams, disponibilidade (ver seção 13.4) |
| Futuro | Propostas/orçamentos em PDF, metas por vendedor, link público de agendamento, relatórios avançados |

> O **Status da oportunidade** e o **histórico de fases e status** já deixam a base pronta para metas, relatórios de conversão e automações.

---

## 15. Decisões registradas

| # | Decisão | Escolha |
|---|---|---|
| 1 | Organização de tags | Grupos de tags (seleção única ou múltipla), cores customizáveis |
| 2 | Visitadas/contactadas | Automático pelas atividades + tag automática |
| 3 | Etapa de fechamento | ~~Tipo da etapa: Aberta / Ganha / Perdida~~ → substituída pela decisão 21 |
| 4 | Carteira | Configurável por papel (vendedor vê a própria; gestor/admin veem tudo) |
| 5 | Atividades | Sempre na empresa; contato e oportunidade opcionais; agenda + histórico |
| 6 | Tipos de atividade | Cadastráveis, com "conta como Visita/Contato" |
| 7 | Oportunidade | Previsão + probabilidade, origem + motivo de perda, produtos/itens, campos personalizados |
| 8 | Empresas (extras) | Consulta CNPJ, importação, detecção de duplicados, exportação |
| 9 | Contatos | Vínculo N:N com empresas (cargo por vínculo) |
| 10 | Dashboard v1 | Minhas atividades, Funil e previsão, Carteira |
| 11 | Oportunidades (visões) | Kanban + Lista, filtros salvos, alerta de parada |
| 12 | WhatsApp | Evolution API: conversas viram atividades (agrupadas por conversa/dia), número por vendedor, caixa de não identificados |
| 13 | Automações | n8n via webhooks de saída (eventos, HMAC) + API REST com chaves por tenant |
| 14 | Preparação | E.164, origem/ID externo nas atividades, registro de eventos e menu de Integrações já na Fase 1 |
| 15 | Tarefas | Kanban com tarefas internas + atividades (opcional); modelo do admin + quadros pessoais e de equipe; etiquetas coloridas |
| 16 | E-mail (registro) | Conta conectada Google/Microsoft **e** BCC como alternativa |
| 17 | E-mail (envio) | Pelo CRM, via conta do vendedor, com modelos; rastreamento de abertura/cliques opcional por envio |
| 18 | Agendas | Google e Microsoft, bidirecional, com convites e link de reunião |
| 19 | Notificações | Central no app + push + e-mail, configurável por usuário (Fase 1) |
| 20 | Atividades × tarefas (v1.3) | **Unificadas**; tipo *Tarefa* com empresa opcional; importante/urgente, lembretes e recorrência |
| 21 | Fechamento (v1.3) | **Status separado da Fase** (Ativo, Conquistado, Perdido, Cancelado, Suspenso). Substitui a decisão 3 |
| 22 | Oportunidade (v1.3) | Solução cadastrável; itens com cobrança única/mensal/anual + meses → valor único, MRR e total |
| 23 | Empresa (v1.3) | Minha Receita; CNPJ, CPF ou sem documento; matriz/filial vinculadas; Vertical substitui tag Segmento; faixas cadastráveis |
| 24 | Prospecção (v1.3) | Busca por CNAE + UF/município e importação como Lead |
| 25 | Vendedor (v1.3) | Vendedor = membro da equipe (pode existir sem login) |
| 26 | Multiempresa (v1.4) | Conta dona de várias empresas; dados isolados + painel consolidado + cópia de configurações |
| 27 | Usuários (v1.4) | Mesmo login em várias empresas, papel por empresa |
| 28 | Protótipo (v1.5) | Telas do protótipo (`docs/prototipo/`) são a referência visual; regras continuam neste documento |
| 29 | Registrar atividade (v1.5) | Situação padrão Realizada; resultado obrigatório ao realizar; "Mais opções" com Oportunidade, Lembrete e Repetir. **Módulo 5 (16/10/2026):** empresa por campo de pesquisa (resultados só depois de digitar, como camada); "Mais opções" só com o Responsável; Oportunidade, Lembrete e Repetir ficaram para depois do MVP |
| 30 | Fechamento (v1.5) | Interruptor "empresa vira Cliente" por fechamento, padrão vindo da configuração do tenant |
| 31 | Navegação (v1.5) | Menu lateral recolhível (preferência salva por usuário); celular com barra inferior (Início, Empresas, Funil, Tarefas, Mais) e botão "+" |
| 32 | Importação (v1.6) | Perfis de regras nomeados por empresa, aplicados depois da consulta à Receita; limite de 10.000 linhas e 10 MB; lote desfazível; ver `escopo_mvp.md` (Módulo 4) |
| 33 | Prospecção (v1.6) | Instância própria da Minha Receita com a base completa, pós-MVP; reaproveita os perfis de regras |

## 16. Próximos passos

1. **Modelagem do banco** (tabelas, relacionamentos, índices e políticas RLS) a partir deste documento.
2. Protótipo das telas (wireframes) para validar a usabilidade em desktop e celular.
3. Esqueleto do monorepo e do ambiente dev local.

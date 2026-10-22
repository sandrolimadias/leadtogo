# CRM Alessandro — Funcionalidades (Fase 1)

> Documento de definições funcionais do projeto.
> Status: **Aprovado (v1.7)** · Data: 13/10/2026
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
- **Barra superior:** busca global, botão "Registrar atividade" e sino de notificações (de todas as empresas, identificadas pela empresa).
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
- Filtros prontos: *Nunca visitadas*, *Sem visita há X dias*, *Sem contato há X dias*. São a base da roteirização futura.

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

**Cadastro: decisões de 13/10/2026 (v1.7)**
- Três passos: **Documento** (CNPJ, CPF ou sem documento, com consulta à Receita), **Conferir dados da Receita** (editáveis) e **Carteira** (Vendedor, Vertical, Status padrão Lead, Website, Observações).
- **Empresa não ativa na Receita** (baixada, inapta, suspensa, nula) **não pode ser cadastrada**: com o bloqueio ligado (padrão; Configurações → Carteira) a tela mostra a situação e o motivo e desabilita Salvar, e a API recusa (409 `empresa_nao_ativa`). Com a Receita fora do ar, a empresa é salva com o selo **"situação não verificada"** e o sistema reconsulta de hora em hora (até 24 vezes), avisando o vendedor se ela não estiver ativa. CPF e "sem documento" não são afetados. O mesmo bloqueio vale na importação (Módulo 4).
- **Duplicado:** o CNPJ repetido na carteira mostra "Esta empresa já está no CRM" com **Abrir ficha**; o vendedor que não vê aquela empresa só fica sabendo que é de outro vendedor, sem nome.
- Matriz e filial se ligam pela raiz do CNPJ, nos dois sentidos, ao salvar.

### Recursos extras
- **Importação por planilha** (Excel/CSV): mapeamento de colunas, prévia, validação e relatório de erros. Importa **empresas, contatos e atividades** (alternância no primeiro passo; ordem recomendada empresas → contatos → atividades).
  - **Contatos e atividades (16/10/2026):** o vínculo com a empresa é sempre pelo **CNPJ** (que precisa estar na carteira); sem Receita; 5 passos (Enviar · Mapear · Prévia · Importar · Relatório). **Contatos:** e-mail ou telefone que já é de um contato existente só **vincula** (os dados dele não mudam); e-mail ou telefone inválido pula a linha; aniversário ou LinkedIn inválido entra sem o campo, com aviso; papel inexistente entra sem papel, com aviso; "Não quer contato" grava a saída com origem importação. **Atividades:** tipo apontado no mapeamento (valor da planilha → tipo cadastrado), data e hora no fuso da empresa (sem hora = dia inteiro), situação pela data quando em branco, Realizada exige o resultado e não pode estar no futuro, atividade idêntica pulada, contato pelo e-mail (com vínculo ativo), responsável pelo e-mail ou quem importa, `origem = importacao`; a atividade realizada atualiza a última visita, o último contato, a próxima atividade e as tags da empresa como o registro manual. **Desfazer** (7 dias) em ambos: só o que o lote criou e ninguém alterou depois; o das atividades recalcula a carteira. Detalhe em `escopo_mvp.md` ("Importação de contatos e de atividades") e `roteiro_teste_importacao_contatos_atividades.md`.
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
- **Fora do G1+G2:** check-in com GPS (G3), "Na rota" e rotas (G4).

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
- Lista com busca (nome, telefone, e-mail), filtro por empresa, cargo e tags da empresa.
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
| Localização | Fase futura: check-in com GPS na visita |
| Origem | Manual · WhatsApp · Integração/API (preenchido pelo sistema) |
| Anexos | Arquivos e fotos (Garage); mídias do WhatsApp no futuro |

### Fluxo
1. **Agendar** → entra na agenda do responsável.
2. **Concluir** → informa o resultado. Tem opção "**Concluir e agendar próxima**" (fluxo rápido de follow-up).
3. Atividade agendada com data passada fica como **Atrasada** (destaque em vermelho).
4. É possível registrar direto como concluída (algo que já aconteceu).

### Formulário "Registrar atividade" (v1.5, do protótipo; **como ficou no Módulo 5**)
- Abre pelo botão **"Registrar atividade"** da barra superior, pelo botão **"+"** do cabeçalho do celular (folha que sobe do rodapé), por **"Nova atividade"** nas fichas (com a empresa já preenchida; na ficha do contato, também o contato) e pela tela **Atividades**.
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
| Data de fechamento | Automática ao sair de Ativo |
| Observações | Texto livre |
| Campos personalizados | Ver seção 8 *(fora do MVP)* |

### Produtos/itens *(fora do MVP: o Módulo 6 usa valores digitados; ver `backlog_pos_mvp.md`)*
- **Catálogo de produtos e serviços** (cadastrável): código, nome, tipo (produto/serviço), solução, unidade, preço padrão, **cobrança padrão (única/mensal/anual)** e **meses padrão**.
- Itens da oportunidade: produto, quantidade, preço unitário (editável), desconto (%), **cobrança** e **quantidade de meses**.
- Cálculo: única = qtd × preço · mensal = qtd × preço × meses · anual = qtd × preço × (meses ÷ 12).
- Exemplo: licença R$ 500/mês × 12 + implantação R$ 2.000 → **Único R$ 2.000 · Mensal R$ 500 · Total R$ 8.000**.

### Tela Oportunidades
- **Kanban** por funil (seletor de funil no topo):
  - Colunas = fases, com **soma de valores e quantidade** no cabeçalho. Só oportunidades com status **Ativo**.
  - Card: nome, empresa, valor, responsável, data prevista e próxima atividade.
  - **Arrastar e soltar** entre etapas (Módulo 6: **pela alça** do card, com mouse, toque ou teclado; ao mover, a probabilidade assume a da nova fase, a menos que tenha sido editada à mão).
  - **Alerta de oportunidade parada:** card destacado quando passa X dias sem atividade.
  - Zona de soltura no **topo** do quadro (também no celular), só enquanto se arrasta: **Conquistado · Perdido · Cancelado · Suspenso** (arrastar o card para fechar). Filtro para ver as suspensas.
  - **Layout (16/10/2026):** o quadro usa a largura e a altura toda da área central; cada coluna rola os próprios cards. No computador e no tablet as colunas abertas dividem a largura por igual, sem rolagem horizontal, e qualquer fase pode ser **recolhida** numa faixa estreita (o estado fica por usuário e por funil, na conta); no celular é uma coluna por vez, com deslize e indicador de posição. Regra em `design_system.md`, seção "Kanban".
  - **Duplicar** (menu ⋯ do card, da lista e da ficha): abre "Nova oportunidade" preenchida com empresa, contato, solução, origem, funil, fase, valores, meses, probabilidade (com a marca de editada à mão, se houver) e data prevista, com " (cópia)" no nome; tudo editável, inclusive a empresa (o contato só fica se tiver vínculo com a nova empresa). **Não** copia histórico, atividades, status, fechamento, responsável nem observações: a cópia nasce **Ativa**. O vendedor só duplica para empresas da própria carteira; a auditoria da cópia registra de qual foi duplicada (`duplicadaDeId`).
  - No celular: rolagem horizontal por coluna e mover pelo menu do card (sem depender de arrastar).
- **Visão em lista** (alternância Kanban ↔ Lista): tabela com ordenação, filtros e paginação 25/50/100 *(exportação: depois do MVP)*.
- **Filtros:** responsável, fase, status, solução, período de previsão, origem, valor, tags da empresa e campos personalizados.
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

---

## 10. Usuários, papéis e carteira

### Perfis de acesso (Fase 1, em implementação)

O papel fixo (Admin, Gestor, Vendedor) dá lugar a **perfis de acesso** configuráveis por empresa: **permissões por módulo e ação, com alcance**. Base da futura central de chamados e do portal do cliente (que não entram agora).

- **Nome e confusões a evitar:** "perfil de acesso" não é o *papel na decisão* do contato, nem o *perfil de regras* da importação, nem o `papel_conta` (dono, administrador, financeiro), que **não muda**.
- **Um perfil por membro por empresa** (`membros.perfil_id`). Sem múltiplos perfis.
- **Perfis de sistema:** **Administrador, Gestor e Vendedor** nascem com a empresa, são editáveis e **nunca se excluem**. O perfil Administrador não perde `perfis.gerir` nem `equipe.gerir`. Perfil criado pela empresa só se exclui sem membros. Há **duplicar**.
- **Catálogo:** chaves `modulo.acao` (ex.: `empresas.excluir`, `atividades.atribuir_responsavel`), versionado em `packages/shared/src/permissoes.ts`, só com módulos que existem hoje. Na partida da API, os perfis de sistema recebem as permissões novas padrão; **perfis da empresa nunca recebem permissão automaticamente**.
- **Alcance** (empresas, contatos, oportunidades e atividades): `propria`, `equipe` ou `todas`. *Equipe* = o próprio membro + subordinados diretos e indiretos pelo `gestor_id` (com proteção contra ciclo). O alcance é **por ação**, não por módulo: o Vendedor com "ver todas" fica com `ver = todas` e `editar = propria`.
- **Padrões dos perfis de sistema** (reproduzem os papéis antigos):

| Perfil | Acesso |
|---|---|
| **Administrador** | Todas as permissões, alcance `todas` |
| **Gestor** | Ver, criar, editar, excluir e transferir em toda a carteira; importação; geocodificação em lote; atribuir responsável; ver e-mail da equipe. **Sem** cadastros, regiões, legenda, equipe, perfis, segurança e regras da carteira |
| **Vendedor** | Ver, criar e editar **só a própria carteira**; sem excluir, transferir, importar, atribuir responsável nem cadastrar contato sem empresa |

- **Migração do interruptor** "Vendedores podem ver todas as empresas": ligado → perfil Vendedor da empresa com `ver = todas` e `editar = propria`; desligado → `propria` nas duas. O interruptor sai da tela Configurações → Carteira.
- **2FA** passa a ser o flag `exige_2fa` de cada perfil (Configurações → Segurança edita por perfil). A política antiga é convertida: `admin` → só o Administrador; `admin_gestor` → também o Gestor; `todos` → os três. Administrador de conta continua sempre exigido.
- **Proteções:** a empresa nunca fica sem um membro ativo com `perfis.gerir` (409); ninguém altera o próprio perfil nem tira `perfis.gerir` de si.
- **Tela** Configurações → Perfis de acesso: lista, matriz módulos × ações com seletor de alcance, aba "Usuários do perfil", duplicar, aviso de impacto ao salvar ("N usuários serão afetados") e visão "quem pode o quê". Em Equipe e convites, o seletor de perfil substitui o papel.
- **Auditoria:** criar e editar perfis (permissões antes/depois) e trocar o perfil de um membro.
- **O servidor sempre decide;** o front só esconde (`pode(chave)`, `alcanceDe(chave)`).
- **Transição:** o `papel` antigo continua gravado como legado, mas nenhuma regra nova lê o papel. A contração (remover `papel`, `perfil_id NOT NULL`, remover o interruptor) fica para depois de duas semanas de uso real (`backlog_pos_mvp.md`).

> Até a Fase 1 ser entregue e aprovada, valem as descrições por papel abaixo e nas demais seções.

### Papéis padrão (anterior à Fase 1)
| Papel | Acesso |
|---|---|
| **Admin** | Tudo, incluindo configurações, usuários e funis |
| **Gestor** | Vê e edita todas as carteiras e relatórios da equipe; sem acesso às configurações do sistema |
| **Vendedor** | Vê e edita **apenas a própria carteira** (empresas em que é responsável e o que estiver ligado a elas) |

### Regras de carteira
- Cada empresa tem **um responsável**.
- Configuração do tenant: **"Vendedores podem ver todas as empresas"** (ligado/desligado) *(sai na Fase 1: vira o alcance de `ver` do perfil Vendedor)*. Quando ligado, o vendedor vê tudo, mas edita só a própria carteira.
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
- **Convidar** por e-mail com papel (validade de 7 dias, uso único); **reenviar** cria outro convite e o anterior deixa de valer; **cancelar** invalida o link. O link inválido, vencido, cancelado ou já usado mostra a **mesma** tela "Convite inválido" (a API não revela o motivo).
- **Mudar papel, desativar e reativar:** desativar vale na próxima requisição da pessoa e mantém o histórico. Quem está com a sessão aberta recebe um aviso claro e é levado a outra empresa dela, se houver, ou ao login.
- **Proteções:** ninguém altera o próprio papel nem a própria situação; o **dono da conta** não é rebaixado nem desativado por outro administrador; a empresa nunca fica sem administrador ativo.
- **Auditoria:** criar empresa, convidar, cancelar convite, mudar papel, desativar e reativar geram registro (quem, o quê, **IP**).

### Segurança e acesso (v1.6)

**Verificação em duas etapas (2FA, app autenticador/TOTP) para todos os usuários.**

- **Ativação voluntária:** em **Meu perfil → Segurança** (folha de perfil no celular), qualquer usuário (admin, gestor ou vendedor) ativa o 2FA lendo um QR code (ou digitando a chave) e confirmando com um código; recebe **códigos de recuperação** de uso único, mostrados uma vez.
- **Desativar:** pede a **senha e um código atual** do app. Não é possível enquanto alguma regra exigir o 2FA daquele usuário (ver abaixo). A mesma tela **gera novos códigos de recuperação** (pede a senha; os antigos deixam de valer).
- **Exigência por empresa (política):** cada empresa define **quem é obrigado** a ter 2FA, em `tenant_configuracoes.dois_fatores_exigido`:

| Valor | Obriga |
|---|---|
| `admin` (padrão) | administradores da empresa |
| `admin_gestor` | administradores e gestores |
| `todos` | todos os membros (admin, gestor e vendedor) |

- **Como a regra é aplicada:** vale a política da **empresa ativa**, para o **papel que a pessoa tem nela**. Quem entra numa empresa que o exige e ainda não tem 2FA é levado à **ativação** e fica barrado nas demais telas e rotas (`403 2fa_obrigatorio`) até ativar. **Ao trocar de empresa vale a regra da nova:** a troca sempre é permitida, e o mesmo usuário pode estar livre numa empresa e barrado em outra. A mudança da política vale na próxima requisição de cada pessoa.
- **Administradores da conta** (dono ou administrador, painel consolidado) precisam de 2FA sempre, qualquer que seja a política.
- **Quem não pode desativar:** administradores da conta e qualquer usuário a quem a política de **alguma** das empresas dele obriga (o administrador não desativa enquanto a regra exigir).
- **Quem altera a política:** só o **administrador** da empresa, pela tela **Configurações → Segurança** (e pela API, `PATCH /v1/configuracoes/seguranca`).
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

- **Busca global** (barra no topo): empresas, contatos, oportunidades e tarefas.
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

**O CRM avisa o n8n (webhooks de saída)**
- O admin cadastra **webhooks** e escolhe os **eventos**:

| Grupo | Eventos |
|---|---|
| Empresa | criada · atualizada · tag alterada · responsável alterado |
| Contato | criado · atualizado |
| Atividade | criada · concluída · atrasada |
| Oportunidade | criada · fase alterada · status alterado (conquistada, perdida, cancelada, suspensa) · parada (alerta) |
| WhatsApp | conversa registrada · número não identificado |

- Payload JSON padronizado (evento, data, tenant, dados do registro e quem alterou).
- **Assinatura HMAC** para o n8n validar a origem.
- **Reenvio automático** com espera progressiva em caso de falha, além de um **log de entregas** com status e botão "reenviar".

**O n8n atua no CRM (API REST)**
- **Chaves de API por tenant**, com nome, permissões (leitura/escrita por módulo), validade e revogação.
- O n8n usa a API REST documentada (OpenAPI/Swagger) pelo nó *HTTP Request*. Futuramente pode haver um **nó próprio do CRM** para o n8n.
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
- Tela **Configurações → Integrações** prevista no menu (chaves de API, webhooks, conexões WhatsApp, logs).
- Anexos de atividades já suportados (Garage), usados para as mídias do WhatsApp e anexos de e-mail.
- E-mails de contatos normalizados (minúsculas) e **domínio** da empresa cadastrado, para identificar e-mails automaticamente.
- Atividades com **participantes** (vários contatos) e **ID externo** também para e-mail (thread) e eventos de agenda.
- Estrutura de **contas conectadas** por usuário (WhatsApp hoje; Google/Microsoft depois).
- **Central de notificações** já na Fase 1 (usada por tarefas e atividades atrasadas).

---

## 14. Fora da Fase 1 (próximas fases)

| Fase | Funcionalidade |
|---|---|
| 2 — Geolocalização | **G1 (geocodificação) e G2 (mapa) ✅ testados e aprovados pelo Ale em 22/10/2026, ver `plano_geolocalizacao.md` e a seção 3B.** Check-in de visita com GPS (G3) fica depois |
| 3 — Roteirização | Montar roteiro do dia com base em filtros (ex.: sem visita há 90 dias + cidade), otimização da ordem (VROOM) e navegação |
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

# Leadtogo — Componentes

Guia de uso de cada componente. Os componentes React de referência estão em `components/bundle.js` (`window.Leadtogo`), os estilos em `components/bundle.css` (classes `lt-`) e as props em `components/index.d.ts`. Veja todos funcionando em `catalogo.html`.


## Ações

### Button

Ação com rótulo de verbo. **Primary** (petróleo) no máximo uma vez por área, para o que a tela existe para fazer: "Nova oportunidade", "Salvar", "Concluir atividade".

**O consumidor fornece:** `children` (rótulo), `variant` = `primary` | `secondary` (padrão) | `ghost` | `danger` | `danger-ghost`, `size` = `sm` | `md` | `lg`, `icon`/`iconRight` (nome de ícone), `loading`, `block`, e os atributos normais de `<button>`.

- Rótulo: verbo no infinitivo ou imperativo + objeto, com inicial maiúscula só na primeira palavra ("Importar planilha", nunca "IMPORTAR" nem "Clique aqui").
- `secondary` para ações de apoio; `ghost` em barras de ferramentas e cabeçalhos de card.
- `danger` sólido só dentro do diálogo de confirmação; fora dele, `danger-ghost`.
- `loading` mantém a largura e desativa o clique ("Consultando Receita…").
- A altura segue a densidade do container (`data-density`: `compact` 28px, padrão 36px, `touch` 44px).

### IconButton

Botão só com ícone para ações repetidas e reconhecíveis (mais ações, editar, fechar, notificações).

**O consumidor fornece:** `icon`, `label` (obrigatório; vira `aria-label` e dica), `variant` = `ghost` (padrão) | `secondary` | `primary` | `fab`, `size` = `sm` | `md` | `lg`.

- `fab` é o botão flutuante "+" do celular para registrar atividade: um por tela, canto inferior direito, acima da área segura.
- Se a ação não é óbvia pelo ícone, use `Button` com rótulo.

### SegmentedControl

Alterna entre 2–4 visões da mesma informação: Kanban ↔ Lista, período do dashboard.

**O consumidor fornece:** `options` [`{value, label, icon?}`], `value` + `onChange` (controlado) ou `defaultValue`, `label` (nome do grupo para leitor de tela).

- Mais de 4 opções ou filtros que se combinam: use `Select` ou `Tabs`.


## Formulários

### TextField

Campo de texto com rótulo, dica e erro. Também cobre área de texto (`multiline`) e busca (`icon="search"`).

**O consumidor fornece:** `label`, `value`/`defaultValue`, `placeholder`, `hint`, `error` (texto que diz como corrigir), `required`, `icon`, `suffix` (ex.: botão "Consultar"), `mono` (CNPJ, CPF, CEP, códigos), `multiline`.

- Rótulo sempre visível acima do campo; placeholder é exemplo, nunca o rótulo.
- Erro diz o que fazer: "Informe um e-mail válido, como nome@empresa.com.br."; nunca "Campo inválido".
- No celular use `data-density="touch"`: 44px e fonte de 16px (evita o zoom do iOS).
- Documentos e códigos em `mono` para alinhar os dígitos.

### Select

Escolha única numa lista curta e fixa (vertical, motivo, origem, vendedor, faixa de faturamento).

**O consumidor fornece:** `label`, `options` (strings ou `{value, label}`), `placeholder`, `value`/`defaultValue`, `hint`, `error`, `required`.

- Listas longas ou com busca (empresas, contatos, CNAEs) pedem um combobox com busca, construído sobre `TextField` + `Menu`.

### Checkbox

Opção independente que se marca ou desmarca, em formulários e na seleção de linhas de tabela.

**O consumidor fornece:** `label`, `description` (opcional), `checked`/`defaultChecked`, `onChange`.

- Para ligar e desligar uma configuração com efeito imediato, use `Switch`.

### Switch

Liga e desliga uma configuração com efeito imediato (preferências do tenant, notificações, exibir atividades no quadro).

**O consumidor fornece:** `label`, `checked`/`defaultChecked`, `onChange`.

- O rótulo descreve o estado ligado ("Vendedores veem todas as empresas").


## Exibição

### Badge

Estado definido pelo sistema, em uma ou duas palavras: situação da atividade, situação na Receita, Matriz/Filial.

**O consumidor fornece:** `children`, `tone` = `neutral` (padrão) | `accent` | `success` | `warning` | `danger` | `info` | `outline`, `icon`.

- Cores de estado sempre com palavra (e ícone quando é alerta): nunca só a cor.
- Tags criadas pelo cliente (Lead, Cliente, Visitada) usam `Tag`, não `Badge`.

### Tag

Etiqueta criada pelo cliente (grupos Status, Visitação e outros), com a cor escolhida no cadastro de tags.

**O consumidor fornece:** `children` (nome da tag), `color` = `gray` | `red` | `orange` | `amber` | `green` | `teal` | `blue` | `indigo` | `purple` | `pink`, `onRemove` (mostra o ×), `dot` (padrão true), `variant="outline"`.

- O seletor de cor do cadastro de tags oferece exatamente estas 10 cores. Cada uma tem par fundo/texto (`tag-<cor>-bg` / `tag-<cor>-fg`) legível nos dois temas.
- Cores padrão: Lead `teal`, Prospect `amber`, Cliente `green`, Inativo `gray`, Visitada `orange`, Contactada `blue`.
- Em listas, mostre no máximo 3 tags e "+N" para o restante.

### Avatar

Iniciais (ou foto) de um membro da equipe ou contato. A cor sai do nome, então a mesma pessoa tem sempre a mesma cor.

**O consumidor fornece:** `name` (obrigatório; vira o texto alternativo), `src` (foto, opcional), `size` = `sm` | `md` | `lg`, `color` (força uma cor da paleta de tags).

- `sm` em cards do Kanban, `md` em listas e navegação, `lg` no cabeçalho da ficha.

### StatTile

Um indicador do Dashboard: rótulo, valor, variação e, opcionalmente, mini-gráfico.

**O consumidor fornece:** `label`, `value` (número vira R$ automaticamente; `currency={false}` para contagens), `delta` ("+12%"), `deltaDirection`/`deltaTone` (quando subir é ruim), `hint`, `spark` (array de números).

- Valores com dígitos tabulares (`kpi`). Use no máximo 4 por linha.
- Toda variação diz contra o que compara ("vs. mês anterior").

### StatusPill

Status da oportunidade: **Ativo · Conquistado · Perdido · Cancelado · Suspenso**, sempre com ícone e palavra.

**O consumidor fornece:** `status` = `ativo` | `conquistado` | `perdido` | `cancelado` | `suspenso`.

- Ativo usa o acento, Conquistado `success`, Perdido `danger`, Suspenso `warning` e Cancelado neutro.

### Tooltip

Dica curta ao passar o mouse ou focar: complementa, nunca guarda informação essencial (no celular não há hover).

**O consumidor fornece:** `label` (até ~60 caracteres), `children` (o gatilho focável), `open` (forçar visível).


## Atividades

### ActivityIcon

Bolha colorida do tipo de atividade, usada na linha do tempo, na agenda, nos cards e no mapa.

**O consumidor fornece:** `type` = `ligacao` | `whatsapp` | `email` | `visita` | `reuniao` | `tarefa`, `size` = `sm`.

- Cores fixas por tipo: Ligação azul, WhatsApp verde, E-mail índigo, Visita laranja, Reunião roxo, Tarefa cinza.
- Tipos novos criados pelo cliente escolhem cor e ícone da mesma paleta.

### PriorityMarks

Marcas de **Importante** (estrela, âmbar) e **Urgente** (raio, vermelho) de uma atividade ou tarefa. Juntas formam a matriz de prioridade.

**O consumidor fornece:** `importante`, `urgente` (booleanos). Não renderiza nada se ambos forem falsos.

### ActivityTimeline

Linha do tempo de atividades na ficha da empresa, do contato e da oportunidade: pendentes no topo, histórico abaixo.

**O consumidor fornece:** `items` [`{id, type, title, status, when, contact?, owner?, importante?, urgente?, repeat?, note?}`], com `status` = `pendente` | `em_execucao` | `realizada` | `cancelada` | `atrasada` (calculado pelo app).

- `note` mostra o resultado de uma atividade realizada ou a conversa resumida.
- Datas relativas até 7 dias ("Ontem, 14:00"); depois, `dd/mm`.

### TaskCard

Card do quadro de Tarefas: uma atividade (de qualquer tipo, inclusive Tarefa) com prioridade, checklist, prazo e recorrência.

**O consumidor fornece:** `title`, `type` (padrão `tarefa`), `company?`, `importante?`, `urgente?`, `labels?` [`{label, color}`], `checklist?` `{done, total}`, `due?`, `dueState?` = `late` | `today`, `repeat?`, `owner?` (só em quadros de equipe), `dragging?`.

- Prazo vencido em vermelho com ícone de alerta; hoje em âmbar.
- Mover para a coluna vinculada a "Realizada" abre o diálogo de concluir (com resultado).


## Funil

### DealCard

Card de oportunidade no Kanban do funil: título, empresa, valor total, mensalidade (MRR), próxima atividade e previsão de fechamento.

**O consumidor fornece:** `title`, `company`, `value` (total do contrato), `mrr?` (valor mensal), `owner?`, `due?` (previsão), `dueState?`, `next?` `{type, label}` ou `false`, `tags?`, `stale?` (texto do alerta de parada), `dragging?`.

- Oportunidade parada ganha contorno `warning` e a frase com os dias. Nunca use só a cor.
- `next={false}` mostra "Sem próxima atividade" em destaque: é o que o gestor mais precisa ver.

### KanbanColumn

Coluna de quadro Kanban, usada no funil (fases) e nas tarefas (colunas customizáveis).

**O consumidor fornece:** `title`, `color` (cor da paleta de tags, mostrada no ponto), `count`, `limit?` (limite de cards; passa a vermelho quando estoura), `total?` (soma em R$, só no funil), `children` (cards), `onAdd` / `addLabel` ou `onAdd={false}`.

- Largura fixa `kanban-column` (296px); o quadro rola na horizontal.
- No celular: uma coluna por vez, com deslize lateral; mover cards pelo menu do card, sem depender de arrastar.


## Dados

### DataTable

Tabela das listas (Empresas, Contatos, Oportunidades em lista): cabeçalho fixo, linhas com hover, seleção para ações em massa.

**O consumidor fornece:** `columns` [`{key, label, align?, width?, sorted?, render?}`], `rows` (com `id`), `selectable`, `defaultSelected`, `density="compact"`, `caption` (nome para leitor de tela).

- A primeira coluna leva o nome em `body-strong` e um dado secundário (CNPJ em `mono`) abaixo.
- Valores em R$ alinhados à direita, com dígitos tabulares.
- No celular, a lista vira cards (empresa, tags, cidade, ações ligar/WhatsApp/rota), não uma tabela espremida.

### Tabs

Abas das fichas (empresa, contato, oportunidade) e das telas de configuração.

**O consumidor fornece:** `items` [`{value, label, icon?, count?}`], `value` + `onChange` ou `defaultValue`, `label`.

- Rótulos curtos (uma palavra). No celular as abas rolam na horizontal.


## Navegação

### AppNav

Navegação lateral do desktop: marca, seletor de empresa, itens principais com contadores e usuário no rodapé.

**O consumidor fornece:** `tenant` (`{name, role, color}`), `groups` [`{label?, items:[{icon, label, href?, active?, count?}]}]`, `user` (`{name, role}`), `productName`.

- Ordem fixa: Dashboard, Empresas, Contatos, Oportunidades, Tarefas; depois grupos secundários.
- Tablet: vira trilho só de ícones (com dica). Celular: barra inferior com 4 itens + "Mais", e o botão flutuante "+" para registrar atividade.
- Contadores só para o que pede ação (tarefas pendentes, oportunidades paradas).

### TenantSwitcher

Seletor da empresa ativa (multiempresa): logotipo com iniciais, nome e o papel do usuário nela. Abre um `Menu` com as empresas, o painel consolidado e "Criar empresa".

**O consumidor fornece:** `current` (`{name, role, color}`), `onClick`.

- Trocar de empresa recarrega os dados e mantém a tela atual.
- Notificações de outra empresa mostram o nome dela; abrir uma notificação troca a empresa ativa.

### Menu

Lista suspensa de ações (botão "Mais ações", menu do card, seletor de empresa).

**O consumidor fornece:** `items` [`{icon?, label, shortcut?, danger?, checked?, onSelect}` | `{separator:true}` | `{heading}`], `label`.

- Ação destrutiva por último, separada, em `danger`, e sempre com confirmação.
- Até ~8 itens; acima disso, agrupe com `heading`.


## Feedback

### Alert

Aviso dentro da página, ligado ao conteúdo (situação na Receita, vínculo matriz/filial, falha de consulta).

**O consumidor fornece:** `tone` = `info` | `success` | `warning` | `danger`, `title?`, `children` (texto), `actions?`.

- Texto diz o que aconteceu e o que fazer, sem desculpas.
- Confirmação passageira de ação ("Salvo") é `Toast`, não `Alert`.

### Toast

Confirmação passageira de uma ação, no canto inferior (desktop) ou acima da barra inferior (celular). Some em 5s, ou fica até fechar se tiver ação.

**O consumidor fornece:** `tone` = `success` (padrão) | `danger` | `info` | `warning`, `title` (o fato: "Atividade concluída"), `description?`, `action?`, `onClose`.

- No modo offline, ações salvas na fila dizem isso: "Salvo no aparelho. Será enviado quando voltar a conexão."

### EmptyState

O que aparece quando uma lista ou quadro está vazio: diz o que vai aparecer ali e como começar.

**O consumidor fornece:** `icon`, `title` (o que falta), `description` (o próximo passo), `actions?`.

- Sem ilustrações; ícone em bloco `surface-sunken`.
- Filtro sem resultado: "Nenhuma empresa com esses filtros" + ação "Limpar filtros".

### Skeleton

Espaço reservado enquanto os dados carregam, com a forma do conteúdo final (linha de tabela, card, ficha).

**O consumidor fornece:** `width`, `height`, `circle`, ou `lines` (parágrafo).

- Use para cargas acima de ~300ms; abaixo disso, não mostre nada.

### Dialog

Janela modal para decisões e formulários curtos: marcar como perdida, concluir atividade, confirmar exclusão.

**O consumidor fornece:** `title` (a ação), `description?` (a consequência), `children` (campos), `footer` (botões: cancelar à esquerda, ação à direita), `onClose`, `open`, `inline` (renderiza com o véu, para protótipos).

- O botão de confirmação repete o verbo do título ("Marcar como perdida"), nunca "OK".
- No celular, vira uma folha que sobe do rodapé, em tela cheia para formulários longos.


## Base

### Icon

Ícones de traço do conjunto **Lucide** (licença ISC), desenhados em `currentColor`: a cor vem do texto ao redor.

**O consumidor fornece:** `name` (um de `Leadtogo.iconNames`), `size` em px (padrão 16) e, se o ícone estiver sozinho e carregar significado, `label` (texto para leitor de tela).

- Tamanhos: 14–16px em texto e botões, 17px na navegação, 20–22px em estados vazios e no botão flutuante.
- Traço 1.75 (2.5 só em marcas pequenas, como ✓ do checkbox).
- Ícone sozinho é decorativo (`aria-hidden`). Botão só com ícone usa `IconButton`, que exige `label`.
- Não use emoji no lugar de ícones.

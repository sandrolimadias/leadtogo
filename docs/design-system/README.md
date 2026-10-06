# Leadtogo — Design System (manual da marca)

Leadtogo é um CRM de gestão de carteira para vendedores que trabalham no escritório e em campo. As pessoas usam o sistema dezenas de vezes por dia, no computador, no tablet e no celular, para saber **quem atender agora e o que fazer em seguida**. O visual é profissional e sóbrio: neutros frios, um único acento azul-petróleo para ação e foco, informação densa e fácil de escanear.

## Princípios

1. **Próximo passo sempre visível.** Toda empresa e oportunidade mostra a próxima atividade, ou "Sem próxima atividade" em destaque.
2. **Densidade sob controle.** No desktop, listas compactas e Kanban largo. No celular, alvos de 44px e uma coisa por vez.
3. **Cor com significado.** O acento serve para ação e seleção; a cor de estado (sucesso, atenção, erro) sempre vem com palavra ou ícone; a cor das tags é escolha do cliente.
4. **Bordas antes de sombras.** As superfícies se separam por `border`. Sombra só no que flutua (menu, diálogo, card arrastado).

## Conteúdo e voz

- Português do Brasil, frases curtas, voz ativa, tratamento por "você" implícito ("Montar roteiro", não "Clique aqui para montar seu roteiro").
- Caixa de frase em tudo: títulos, botões, menus ("Nova oportunidade", "Atualizar pela Receita"). Caixa-alta só no estilo `overline`, aplicada por CSS.
- Botões dizem o que acontece: verbo + objeto. Confirmações repetem o verbo do título ("Marcar como perdida"), nunca "OK" ou "Sim".
- Erros dizem o que fazer: "A Receita não respondeu. Tente de novo em alguns minutos ou preencha à mão."
- Use os termos do produto: Empresa, Contato, Atividade, Oportunidade, Fase, Status, Carteira, Vertical, Solução. Os status da oportunidade são Ativo, Conquistado, Perdido, Cancelado e Suspenso; a situação da atividade é Pendente, Em execução, Realizada ou Cancelada (Atrasada é calculada).
- Números no padrão brasileiro: `R$ 24.600`, `R$ 1.300/mês`, `12/10/2026`, `14:30`. Documentos com máscara: `12.424.587/0001-45`.
- Sem emoji na interface.

## Cor

- Fundo da página `bg`; cards, tabelas, inputs e menus em `surface`; colunas do Kanban, cabeçalho de tabela e trilhos em `surface-sunken`; hover em `surface-hover`; seleção em `surface-selected`.
- Texto: `ink` (principal), `ink-muted` (rótulos, metadados) e `ink-subtle` (placeholder, contadores). Todos passam de 4.5:1 em qualquer superfície, nos dois temas.
- `accent` (azul-petróleo) para ação principal, link, item ativo e foco. Texto sobre fundo `accent` usa `on-accent`, nunca branco fixo (no tema escuro o acento clareia e o texto escurece).
- Estados: `success`, `warning`, `danger` e `info`, cada um com `-soft` para o fundo. Sempre com ícone ou palavra.
- Tags: 10 cores escolhíveis (`tag-<cor>-bg` / `tag-<cor>-fg`) para grupos de tags, colunas do Kanban, tipos de atividade e avatares. Padrões: Lead `teal`, Prospect `amber`, Cliente `green`, Inativo `gray`, Visitada `orange`, Contactada `blue`.
- Tipos de atividade: Ligação `blue`, WhatsApp `green`, E-mail `indigo`, Visita `orange`, Reunião `purple`, Tarefa `gray`.
- Temas **Claro** e **Escuro**, com os mesmos nomes de token. O tema escuro não é inversão: superfícies em petróleo quase preto, acento mais claro.

## Tipografia

- **Instrument Sans** (variável, 400–700) em toda a interface; **IBM Plex Mono** só para CNPJ, CPF, CEP e códigos (`mono`).
- Texto padrão do desktop é `body` (14/20). No celular e em campos com densidade de toque, `body-lg` (16/24).
- Títulos: `display` para página no desktop, `title-lg` para o nome da empresa na ficha, `title-md` para seções e diálogos, `title-sm` para cards e colunas.
- Metadados em `body-sm`; chips e dicas em `caption`; grupos da navegação em `overline`.
- Valores e datas que se comparam em coluna usam `font-variant-numeric: tabular-nums` (classe `lt-num`). O `kpi` sempre é tabular.

## Espaço, forma e densidade

- Grade de 4px: `space-1` (4) a `space-16` (64). Cards e painéis com `space-4`; cards do Kanban com `space-3`; diálogos com `space-6`.
- Cantos: `radius-sm` para controles, `radius-md` para cards e menus, `radius-lg` para diálogos e colunas do Kanban, `radius-full` para tags, avatares e switch.
- Densidade pela propriedade `data-density` no container: `compact` (`control-sm`, 28px) em tabelas e barras de filtro, padrão (`control-md`, 36px) e `touch` (`control-lg`, 44px) no celular e tablet.
- Layout: navegação lateral `sidebar-width` no desktop (≥ `bp-lg`), trilho de ícones no tablet (≥ `bp-md`), barra inferior + botão flutuante "+" no celular. A topbar (`topbar-height`) tem busca global, seletor de empresa e notificações.
- Kanban com colunas `kanban-column` (296px) e rolagem horizontal; no celular, uma coluna por vez.

## Estados e interação

- Foco de teclado: anel sólido de 2px em `focus-ring`, afastado 2px. Nunca remova sem substituir.
- Hover muda o fundo (`surface-hover`) e não o tamanho. Desativado = 45% de opacidade e cursor bloqueado.
- Carregamento: `Skeleton` com a forma do conteúdo; botão com `loading` mantém a largura.
- Movimento curto (120–150ms) e só em cor, opacidade e posição. Com `prefers-reduced-motion`, tudo para.
- Offline: ações salvas na fila mostram "Salvo no aparelho. Será enviado quando voltar a conexão."

## Iconografia

- Ícones de traço **Lucide** (licença ISC), em `currentColor`, traço 1.75, tamanhos 14–17px na interface. Pelo componente `Icon`, cerca de 55 nomes estão disponíveis (`Leadtogo.iconNames`).
- Os SVGs em `assets/Icons` são cópias com tinta `ink` (#0f2428) fixa, para usar fora do React (documentos, e-mails, protótipos).
- WhatsApp usa o ícone `message-circle` com a cor verde do tipo. O logotipo oficial do WhatsApp não é desenhado aqui.

## Marca

- O nome é **Leadtogo**: sempre assim, uma palavra, com L maiúsculo.
- A marca gráfica (`assets/Logos/leadtogo-mark.svg`) é um quadrado petróleo com um ponto (o lead) e uma seta (o próximo passo). Ao lado dela, o nome vai em Instrument Sans 700, cor `ink`.
- No tema escuro, use `leadtogo-mark-dark.svg`.

## Componentes

Os componentes React ficam em `window.Leadtogo` (React 18) e usam as classes `lt-` de `components/bundle.css`. Eles cobrem ações, formulários, exibição, atividades, funil (Kanban), dados, navegação multiempresa e feedback. Na implementação real, recrie cada um como componente shadcn/ui + Tailwind usando os mesmos tokens: estes são a referência visual e de comportamento.

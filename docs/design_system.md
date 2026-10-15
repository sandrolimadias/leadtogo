# Leadtogo — Design System

> Status: **v1.0** · Data: 05/10/2026
> Fonte oficial (navegável, com componentes ao vivo): artifact **"Leadtogo"** no claude.ai: https://claude.ai/artifact/SWeEbQZXuBUjT32Cb8uYHQ
> Este arquivo é só o resumo das decisões. Os valores exatos ficam no artifact (`tokens.json`).

## Identidade
- **Nome do produto:** Leadtogo (o nome "CRM Alessandro" era provisório). Verificar a marca no INPI e o domínio.
- **Personalidade:** profissional e sóbria (referências: Linear, Attio), com foco em densidade de informação e leitura rápida.
- **Marca gráfica:** quadrado azul-petróleo com um ponto (o lead) e uma seta (o próximo passo). O nome vai escrito em Instrument Sans 700.
- **Mote:** "O próximo passo de cada cliente, no escritório e em campo."

## Fundamentos
| Item | Decisão |
|---|---|
| Cor de acento | Azul-petróleo: `#0b5f70` (claro) / `#5ec2d6` (escuro) |
| Neutros | Frios, levemente puxados para o petróleo |
| Temas | Claro e Escuro desde o início, com os mesmos nomes de token |
| Estados | success, warning, danger, info (+ versões `-soft`), sempre com ícone ou palavra |
| Paleta de tags | 10 cores (cinza, vermelho, laranja, âmbar, verde, petróleo, azul, índigo, roxo, rosa) com par fundo/texto legível nos dois temas |
| Tipografia | Instrument Sans (interface) + IBM Plex Mono (CNPJ, CPF, CEP, códigos) |
| Base de texto | 14px no desktop, 16px no celular |
| Espaçamento | Grade de 4px |
| Cantos | 4 / 6 / 8 / 12 px e pílula |
| Densidade | Compacta 28px · Padrão 36px · Toque 44px (`data-density`) |
| Ícones | Lucide (licença ISC), traço 1.75 |
| Contraste | Todo texto ≥ 4.5:1; bordas de controle e foco ≥ 3:1, nos dois temas |

## Cores padrão do domínio
- **Status da empresa:** Lead = petróleo · Prospect = âmbar · Cliente = verde · Inativo = cinza
- **Visitação:** Visitada = laranja · Contactada = azul
- **Tipos de atividade:** Ligação = azul · WhatsApp = verde · E-mail = índigo · Visita = laranja · Reunião = roxo · Tarefa = cinza
- **Status da oportunidade:** Ativo = acento · Conquistado = success · Perdido = danger · Suspenso = warning · Cancelado = neutro

## Componentes (30 + 1 tela de exemplo)
- **Ações:** Button, IconButton (inclui o botão flutuante "+"), SegmentedControl
- **Formulários:** TextField, Select, Checkbox, Switch
- **Exibição:** Badge, Tag, Avatar, StatTile, StatusPill, Tooltip
- **Atividades:** ActivityIcon, PriorityMarks (Importante/Urgente), ActivityTimeline, TaskCard
- **Funil:** DealCard (valor total + MRR, alerta de parada, "sem próxima atividade"), KanbanColumn
- **Dados:** DataTable, Tabs, Paginacao (obrigatória em toda tabela de dados; ver "Tabelas e paginação")
- **Navegação:** AppNav, TenantSwitcher (multiempresa), Menu
- **Feedback:** Alert, Toast, EmptyState, Skeleton, Dialog
- **Exemplo:** TelaFunil (Kanban de oportunidades completo)

> Os componentes do artifact são a **referência visual e de comportamento**. Na implementação, eles serão recriados em React + Tailwind + shadcn/ui usando os mesmos tokens.

## Layout e rolagem (regra para toda tela, decidida pelo Ale em 15/10/2026)
**A página nunca rola** (computador, tablet e celular). Ficam fixos o **menu lateral** (no celular, a gaveta continua) e a **barra do topo** (busca, "Registrar atividade", notificações); no celular, o cabeçalho e a barra inferior. **Só a área central (`#conteudo`) rola, por dentro.** Nenhuma tela tem barra de rolagem horizontal na página (o rodapé do menu mostra só os 7 primeiros caracteres da versão, com o valor completo na dica).
- **Tela sem tabela** (ficha, formulário, Configurações, passos do assistente de importação): a área central rola inteira. Use um `<main>` comum, sem `flex-1`.
- **Tela com tabela ou lista de dados** (Empresas, Contatos, Importações, linhas do relatório e as próximas): use `PaginaDeTabela` e `AreaDaTabela` (`components/ui/pagina.tsx`). **Título, botões, chips e filtros ficam fixos**; só as **linhas** rolam (`CorpoRolavel`), com o **cabeçalho das colunas fixo** (`sticky top-0` no `<th>`) e a **paginação fixa embaixo**, fora da rolagem. Em janela muito baixa a tabela tem altura mínima (240 px) e a rolagem de reserva passa a ser a da área central: a página continua sem rolar.
- No celular, a lista vira cartões dentro da mesma área rolável.
- Estrutura: `html`/`body` sem rolagem no app autenticado; a casca é `h-dvh` com `overflow-hidden`; a área central é uma coluna flex (`min-h-0 flex-1 overflow-y-auto overflow-x-hidden`).

## Tabelas e paginação (regra para toda tabela de dados)
- **Um componente só: `Paginacao`** (`components/ui/paginacao.tsx`), usado por todas as tabelas, inclusive as dos próximos módulos. Mostra "1–25 de 120", **Linhas por página (25, 50 ou 100)**, "Página N de M", Anterior e Próxima.
- **Padrão 25.** A escolha fica **lembrada por tabela e por usuário**, nas preferências do usuário (`preferencias.porPagina`, guardada na conta e valendo em qualquer aparelho); o hook é `usePorPagina('<tabela>')` (`casca/preferencias.ts`). Mudar o tamanho volta para a página 1. Tabela nova entra em `TABELAS_PAGINADAS` (`packages/shared/src/paginacao.ts`).
- **A API limita o tamanho de página a 100** (`TAMANHO_MAXIMO_DE_PAGINA`; todo `porPagina` usa o `porPaginaSchema`) e o padrão é 25. A tela só busca depois de as preferências chegarem, para não pedir duas vezes.
- Listas que carregam "mais" (histórico) não são tabelas de dados paginadas e ficam de fora.

## Próximos passos
1. Revisar o design system no artifact e pedir ajustes (cores, fonte, cantos, densidade).
2. Prototipar as telas principais (Dashboard, Empresas, Ficha da empresa, Oportunidades, Tarefas, versões para celular) sobre este sistema.
3. Definir o escopo do MVP.

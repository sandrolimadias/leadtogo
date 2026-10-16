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

## Layout e rolagem (regra para toda tela, atual e futura; decidida pelo Ale em 15/10/2026)
1. **A página (`html`/`body`) nunca rola.** O app ocupa exatamente a janela (`h-dvh`, por causa do celular). A casca é `relative` para que elementos `absolute` (como `sr-only`) não vazem do `overflow-hidden`.
2. **Ficam fixos** o **menu lateral** (altura toda, com logo e seletor de empresa no topo, itens no meio e usuário e versão presos no rodapé; no celular continua a navegação fixa) e a **barra do topo** (busca, "Registrar atividade", notificações; no celular, cabeçalho e barra inferior).
3. **Só a área central (`#conteudo`) rola**, com **uma única barra de rolagem**, na borda direita dela. Título, botões, chips, filtros, tabela e paginação rolam juntos.
   - **Tabelas não têm rolagem vertical própria**: crescem com as linhas (25, 50 ou 100) e quem rola é a área central. O **cabeçalho das colunas** é `sticky top-0` e gruda no topo da área central enquanto a tabela estiver visível.
   - Para o `sticky` funcionar, nenhum ancestral do `<th>` pode ter `overflow: hidden/auto/scroll`: `AreaDaTabela` usa `overflow-clip`, e `CorpoDaTabela` só rola na **horizontal abaixo de `lg`** (colunas que não cabem; nessa faixa o cabeçalho deixa de grudar). **Nunca** rolagem horizontal na página.
4. **Conteúdo centralizado**: a casca envolve o conteúdo num contêiner de **no máximo 1440 px**, centralizado, com margens laterais iguais. Abaixo de 1440 px ocupa a largura toda, com o espaçamento lateral dos tokens (`p-6`, `p-4` no celular). As telas **não repetem** `mx-auto` nem largura máxima de 1400/1440; só formulários e passos usam uma largura de leitura menor (560, 980 ou 1080 px), encostada à esquerda do contêiner.
5. Vale para listas, fichas, formulários, Configurações, importação, Dashboard e as telas futuras: use `PaginaDeTabela`/`AreaDaTabela`/`CorpoDaTabela` (`components/ui/pagina.tsx`) nas listas e um `<main>` comum nas demais.
- Estrutura: `html`/`body` com `overflow: hidden`; casca `relative h-dvh overflow-hidden`; `#conteudo` com `min-h-0 flex-1 overflow-y-auto overflow-x-hidden` e, dentro, `mx-auto flex min-h-full w-full max-w-[1440px] flex-col`.
- Teste que protege a regra: `apps/web/e2e/layout.spec.ts` (1920×1080, 1366×768 e 390×844: janela sem rolagem, menu e topo parados, uma única barra, cabeçalho das colunas grudado, 1440 px centralizado).

## Tabelas e paginação (regra para toda tabela de dados)
- **Um componente só: `Paginacao`** (`components/ui/paginacao.tsx`), usado por todas as tabelas, inclusive as dos próximos módulos. Mostra "1–25 de 120", **Linhas por página (25, 50 ou 100)**, "Página N de M", Anterior e Próxima.
- **Padrão 25.** A escolha fica **lembrada por tabela e por usuário**, nas preferências do usuário (`preferencias.porPagina`, guardada na conta e valendo em qualquer aparelho); o hook é `usePorPagina('<tabela>')` (`casca/preferencias.ts`). Mudar o tamanho volta para a página 1. Tabela nova entra em `TABELAS_PAGINADAS` (`packages/shared/src/paginacao.ts`).
- **A API limita o tamanho de página a 100** (`TAMANHO_MAXIMO_DE_PAGINA`; todo `porPagina` usa o `porPaginaSchema`) e o padrão é 25. A tela só busca depois de as preferências chegarem, para não pedir duas vezes.
- Listas que carregam "mais" (histórico) não são tabelas de dados paginadas e ficam de fora.

## Escolha de registro em diálogo (regra, decidida pelo Ale em 16/10/2026)
Para escolher um registro que vem de uma tabela grande (a empresa, no "Registrar atividade"; vale para contato, oportunidade e o que vier):
- **Campo de pesquisa**, não lista suspensa. A busca é no servidor (a carteira passa de milhares de linhas), por todos os nomes que a pessoa conhece (nome e documento, com ou sem máscara).
- **Ao abrir a janela não aparece lista nenhuma.** Os resultados só vêm **depois de digitar**.
- Os resultados abrem **como uma camada sobre os campos de baixo** (`absolute`, com altura máxima e rolagem própria): **a janela nunca muda de tamanho nem de lugar** quando eles aparecem ou somem.
- **Nunca usar popover (`Popover`, `Select` suspenso) dentro de `Dialog` ou `Sheet`**: o diálogo fica na camada 1400 e o popover abria atrás dele (parecia travado). O campo fica dentro da própria janela.
- Escolhido o registro, o campo vira o nome com um botão **Trocar** (volta à busca). Componente: `telas/atividades/busca-de-empresa.tsx`. Teste: a janela mantém o mesmo tamanho com os resultados abertos (`apps/web/e2e/atividades.spec.ts`).

## Próximos passos
1. Revisar o design system no artifact e pedir ajustes (cores, fonte, cantos, densidade).
2. Prototipar as telas principais (Dashboard, Empresas, Ficha da empresa, Oportunidades, Tarefas, versões para celular) sobre este sistema.
3. Definir o escopo do MVP.

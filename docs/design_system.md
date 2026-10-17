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
6. **Exceções aprovadas pelo Ale:** o **quadro Kanban de Oportunidades** (largura toda, altura toda e rolagem por coluna), descrito na seção "Kanban" abaixo, e a **tela Mapa** (G2, aprovada em 16/10/2026), descrita na seção "Mapa" abaixo. Toda outra exceção precisa da aprovação do Ale e entra aqui.

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

## Kanban (regra, Módulo 6; layout revisto em 16/10/2026)
**Exceção aprovada pelo Ale à regra de "Layout e rolagem", valendo só para o quadro de Oportunidades** (a página continua sem rolagem, e o cabeçalho, os filtros e o resumo continuam como nas outras telas, centralizados em até 1440 px):
- **Largura toda.** O quadro usa a largura inteira da área central (sem o limite de 1440 px, só com o espaçamento lateral `p-6`/`p-4`). A página marca isso com `PaginaDeQuadro` (`components/ui/pagina.tsx`, atributo `data-quadro`); a casca (`has-[[data-quadro]]`) tira o `max-w-[1440px]` e dá ao conteúdo a altura toda. O topo da página fica em `CabecalhoDoQuadro` (1440 px centralizado).
- **Altura toda e rolagem por coluna.** As colunas descem até o fim da área central e **cada coluna rola os próprios cards por dentro** (`overflow-y-auto` na lista de cards). A área central e a página não rolam. Altura mínima de 420 px: abaixo disso a área central rola, e a página nunca.
- **Computador e tablet: sem rolagem horizontal.** As colunas **abertas dividem a largura por igual** (`flex-1 basis-0 min-w-0`; o token `--kanban-column` de 296 px **deixa de ser largura** do quadro). Cada fase tem o botão **Recolher**; a coluna recolhida vira uma **faixa de 44 px** com o nome na vertical, a quantidade e a soma, e o espaço liberado vai para as abertas. Também **recebe cards** soltos. A última fase aberta não tem o botão de recolher (o quadro nunca fica vazio). O estado fica **por usuário e por funil, na conta** (`preferencias.kanbanColapsadas`, vale em qualquer aparelho; hook `useFasesRecolhidas`, `casca/preferencias.ts`). O limite de **6 fases ativas por funil** garante que caibam.
- **Celular: uma coluna por vez.** Cada coluna ocupa a largura da tela e **encaixa** ao deslizar (`snap-x snap-mandatory`); abaixo do quadro, o indicador **"2 de 5"** com um ponto por fase (os pontos levam à fase). Não há recolher no celular. O card tem a **alça de arrastar** (para as zonas de fechamento, que ficam no topo) e o **menu**, que também move de fase.
- **Zonas de soltura** (Conquistada, Perdida, Cancelada, Suspensa): **no topo do quadro** (também no celular), `absolute` sobre os cabeçalhos das colunas, **só enquanto se arrasta**, sem empurrar o layout. Quem decide o destino é o ponteiro (as zonas ganham das colunas sob elas).
- **Arrastar pela alça** (ícone de seis pontos), não pelo card inteiro: o card continua clicável e o toque não briga com a rolagem. Mouse, toque (pressão curta) e **teclado** (Espaço, setas para os lados entre fases, seta para cima para as zonas, seta para baixo de volta às fases, Espaço, Esc) com `@dnd-kit/core`.
- O **menu do card** e os menus em geral nunca passam da altura da janela (rolam por dentro): com 6 fases o menu do card é longo.
- Alerta de parada: contorno `warning` **e** a frase "Parada há N dias nesta fase". Nunca só a cor.
- Valores sempre em `tabular-nums`; dinheiro em R$ com centavos nos cards e sem centavos nas somas das colunas.
- Testes que protegem a regra: `apps/web/e2e/kanban-layout.spec.ts` (1920×1080, 1366×768 e 390×844) e `apps/web/src/telas/oportunidades/kanban.test.tsx`.

## Gráficos (regra, Módulo 7)
Os gráficos do app usam **Recharts**, no padrão do **shadcn/ui Charts**: um contêiner que dá as cores das séries e um tooltip no visual dos cartões. Componente único em `apps/web/src/components/ui/grafico.tsx` (`ContainerDoGrafico`, `ConteudoDoTooltip`, `GraficoVazio`) e apoio em `apps/web/src/lib/grafico.ts` (`corDaTag`, `useReduzirMovimento`).
- **Biblioteca só onde se usa:** a rota do Dashboard é carregada com `lazy` e leva o Recharts junto; as outras telas não pagam por ele. Gráfico novo em outra tela entra no mesmo componente e também deve ser carregado sob demanda.
- **Cores só dos tokens** (`docs/design-system/tokens.css`): a série ou a fase usa `var(--tag-<cor>-fg)` (mesma cor da tag da fase ou do Status); resultado positivo `var(--success)`, perdas `var(--danger)` e `var(--tag-red-fg)`; destaque neutro `var(--accent)`. Nada de hexadecimal. Como os tokens trocam no tema escuro, o gráfico acompanha o tema sozinho.
- **Cor nunca é a única informação:** cada barra tem o rótulo (fase, status, motivo) e o valor ao lado, e o contêiner tem um `aria-label` com o resumo em palavras. Alerta usa frase, não só cor.
- **Tooltip** (mouse, toque e foco do teclado): título e linhas "rótulo: valor" com a **quantidade**, o **valor em R$** e o **percentual** quando fizer sentido; quando o elemento é clicável, termina com "Clique para ver a lista". O cursor é `pointer` nos elementos clicáveis.
- **Clique leva à lista já filtrada** (`telas/dashboard/links.ts`): fase do funil → Oportunidades do funil, na fase; status da carteira → Empresas com o status; motivo de perda → Oportunidades perdidas e canceladas com o motivo, no período; mês do MRR → Oportunidades conquistadas no mês. Para o **teclado e o leitor de tela** (o gráfico em si se clica com o mouse ou o toque), cada gráfico clicável tem uma lista de links equivalente, escondida até receber o foco.
- **Animação** ao trocar de período (500 ms), desligada quando o usuário pede menos movimento (`prefers-reduced-motion`).
- **Estados:** carregando (esqueleto do bloco), erro (alerta com "Tentar de novo") e **vazio** (`GraficoVazio`: uma frase que diz o que falta, como "Nenhuma perda neste período", nunca um gráfico em branco).
- Valores sempre em `tabular-nums`; R$ com centavos nos tooltips e sem centavos nos rótulos curtos.

## Próximos passos
1. Revisar o design system no artifact e pedir ajustes (cores, fonte, cantos, densidade).
2. Prototipar as telas principais (Dashboard, Empresas, Ficha da empresa, Oportunidades, Tarefas, versões para celular) sobre este sistema.
3. Definir o escopo do MVP.


## Mapa (G2; exceção aprovada pelo Ale em 16/10/2026)
**Exceção à regra de "Layout e rolagem", valendo só para a tela Mapa.** Referência visual: `docs/referencias/geo/mapa_referencia.png`.
- O mapa (MapLibre + PMTiles) ocupa **a área central inteira**, sem o contêiner de 1440 px e sem título de página; menu lateral e barra do topo continuam. A página continua sem rolagem.
- **Por cima do mapa:** barra de busca e chips de filtro no topo (chips gerados das tags de Status, com contagem), painel da empresa à esquerda (cartão `--surface`, 400 px), controles do mapa à direita (zoom, retângulo, raio, minha posição, camadas) e a **legenda** no canto inferior (visto = "visitada alguma vez"). O painel da direita da referência (editor de rota) é do G4 e **não entra** no G2.
- **Pins:** cores vindas da legenda do tenant (`mapa_legenda`), de uma **paleta de ~12 cores dos tokens** com contraste garantido no tema claro e no escuro; o estado nunca depende só da cor (visto de "visitada", ícone próprio de "visita tentada" e de "sem visita 60+").
- **Celular (390 px):** mapa em tela cheia, painel como **folha que sobe de baixo** e filtros numa **gaveta**.
- Teste que protege a regra: `apps/web/e2e/mapa-layout.spec.ts` (1920×1080, 1366×768 e 390×844: janela sem rolagem, mapa ocupando a área central).

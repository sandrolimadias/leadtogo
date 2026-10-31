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
- **Barra de abas (Tabs, 31/10/2026):** nunca encolhe na vertical (numa coluna de altura fixa, como o painel da empresa no mapa, ela sumia) e nunca mostra barra de rolagem; com muitas abas na tela estreita, rola na horizontal com o dedo, sem a barra. Com poucas abas (Atividades), a opção `preencher` faz as abas dividirem a largura no celular, um pouco mais justas (13 px, 6 px de respiro), para caberem inteiras a partir de 360 px.
- **Navegação:** AppNav, TenantSwitcher (multiempresa), Menu
- **Feedback:** Alert, Toast, EmptyState, Skeleton, Dialog
- **Exemplo:** TelaFunil (Kanban de oportunidades completo)

> Os componentes do artifact são a **referência visual e de comportamento**. Na implementação, eles serão recriados em React + Tailwind + shadcn/ui usando os mesmos tokens.

## Layout e rolagem (regra para toda tela, atual e futura; decidida pelo Ale em 15/10/2026)
1. **A página (`html`/`body`) nunca rola.** O app ocupa exatamente a janela (`h-dvh`, por causa do celular). A casca é `relative` para que elementos `absolute` (como `sr-only`) não vazem do `overflow-hidden`.
2. **Ficam fixos** o **menu lateral** (altura toda, com logo e seletor de empresa no topo, itens no meio e usuário e versão presos no rodapé; no celular continua a navegação fixa) e a **barra do topo** (busca, "+" para criar, "?" de ajuda, notificações; no celular, cabeçalho e barra inferior).
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


## Celular: barra inferior, folha "Mais" e aviso de nova versão (21/10/2026)
- **Barra inferior** (68 px, 5 colunas): Início, Empresas, Funil, Atividades e **Mais** (`TELAS_DA_BARRA_INFERIOR` em `casca/navegacao.ts`). A barra não mudou.
- **Folha "Mais"** (`FolhaMais`, `Sheet` de baixo, sem cabeçalho visível, título "Mais" para o leitor de tela): linhas de 48 px com ícone e nome, **geradas de `TELAS`** (todas as que não estão na barra, filtradas por `telaVisivel`, na ordem do menu lateral; tela nova entra sozinha), depois **Meu perfil** (→ Segurança), **Trocar de empresa** (só com mais de uma empresa; a ativa vem marcada) e **Sair**. A tela atual fica destacada (`aria-current="page"`, fundo `--surface-selected`, texto `--brand`, peso 600). Fecha ao navegar, ao trocar de empresa, com Esc ou tocando fora. Testes: `casca/navegacao.test.ts` (a lista gerada de `TELAS`), `casca/casca.test.tsx` e `e2e/casca.spec.ts` (390×844, abrindo o Mapa pelo "Mais").
- **Avatar do cabeçalho** continua abrindo a folha de perfil (usuário, empresa ativa, tema, versão).
- **Aviso "Nova versão disponível · Atualizar"** (`pwa/aviso-de-nova-versao.tsx`): faixa discreta (`--surface`, borda e sombra `md`, texto de 13 px, "Atualizar" em `--brand` sublinhado), centralizada no rodapé e **acima da barra inferior** no celular. Só aparece com versão nova esperando; só recarrega no clique.

## Mapa (G2; exceção aprovada pelo Ale em 16/10/2026)
**Exceção à regra de "Layout e rolagem", valendo só para a tela Mapa.** Referência visual: `docs/referencias/geo/mapa_referencia.png`.
- O mapa (MapLibre + PMTiles) ocupa **a área central inteira**, sem o contêiner de 1440 px e sem título de página; menu lateral e barra do topo continuam. A página continua sem rolagem.
- **Por cima do mapa:** barra de busca e chips de filtro no topo (chips gerados das tags de Status, com contagem), painel da empresa à esquerda (cartão `--surface`, 400 px), controles do mapa à direita (zoom, retângulo, raio, minha posição, camadas, rota e, por último, **mostrar/esconder a legenda**, ícone `list`, com `aria-pressed`) e a **legenda** no canto inferior (visto = "visitada alguma vez"; "X" no cabeçalho para fechar; começa aberta e o aparelho lembra a escolha; não aparece no celular). O painel da direita da referência (editor de rota) é do G4 e **não entra** no G2.
- **Níveis por zoom (22/10/2026, decisão do Ale):** de longe, **uma bolha por município**; aproximando, **uma por bairro**; perto, os **pins** das empresas. Os limites estão em `ZOOM_DOS_NIVEIS_DO_MAPA` (`packages/shared/src/mapa.ts`; hoje: município abaixo do zoom 10, bairro de 10 até 13, pins a partir de 13; a API e o app leem o mesmo valor, ajuste só ali). A **bolha** mostra o total de empresas (abreviado a partir de mil: "1,2 mil"), usa a cor de destaque `--accent` (a mesma das bolhas de antes) e cresce com o total (raios 16, 20, 25 e 30 px); a posição é o **centro das empresas** do grupo. O **bairro** vem do endereço da empresa, normalizado (`chaveDoBairroNoMapa`: sem acento nem pontuação, maiúsculas, espaços únicos, "Jd." = "Jardim", "Vl." = "Vila", "Sta." = "Santa"...) **dentro do mesmo município**; empresa sem bairro cai em "Sem bairro" do município. A contagem é feita **no servidor** (respeita os filtros e a carteira do vendedor) e só o nível dos pins manda pontos. **Clicar numa bolha** aproxima o mapa até as empresas dela (enquadra a caixa) e mostra o nível seguinte, sem ficar abaixo do início dele. **Clicar numa empresa** (pin ou lista) abre o painel e destaca o pin, mas **não aproxima nem centraliza**: só se o painel esconder o pin o mapa desliza o mínimo para mostrá-lo (`components/mapa/revelar.ts`), sem mudar o zoom. A aproximação é sempre manual.
- **Pins e bolhas são camadas do MapLibre, não elementos DOM (21/10/2026):** duas fontes GeoJSON (`empresas` e `bolhas`) e as camadas `pins` (símbolo com o ícone da gota e o visto, desenhado num canvas e entregue à GPU), `bolhas-circulos` e `bolhas-total` (as bolhas de município, de bairro e da cobertura). Clique, seleção (pin maior, com contorno `--ink`, por cima), legenda, visto e cores configuráveis ficam como antes. O texto das bolhas usa os glifos locais (`Noto Sans Medium`). Como o pin não é mais um botão, **não há `aria-label` por empresa**: o caminho acessível para uma empresa é a busca, a lista de próximas e a seleção por área (que listam as empresas), e o painel abre por elas. Mais de 5.000 empresas na área no nível dos pins: o mapa mostra uma amostra espalhada e o aviso "Mostrando 5.000 de N empresas desta área. Aproxime o mapa ou use os filtros".
- **Pins:** cores vindas da legenda do tenant (`mapa_legenda`), de uma **paleta de ~12 cores dos tokens** com contraste garantido no tema claro e no escuro; o estado nunca depende só da cor (visto de "visitada", ícone próprio de "visita tentada" e de "sem visita 60+").
- **Celular (390 px):** mapa em tela cheia, painel como **folha que sobe de baixo** e filtros numa **gaveta**.
- **Paleta dos pins (12 cores, só dos tokens):** Verde `--tag-green-fg`, Azul `--tag-blue-fg`, Âmbar `--tag-amber-fg`, Laranja `--tag-orange-fg`, Vermelho `--tag-red-fg`, Rosa `--tag-pink-fg`, Roxo `--tag-purple-fg`, Índigo `--tag-indigo-fg`, Verde-água `--tag-teal-fg`, Cinza `--tag-gray-fg`, Alerta `--danger` e Destaque `--accent`. Cada uma tem contraste com o contorno branco do pin nos temas claro e escuro (o web lê o token do tema que está valendo). O administrador escolhe uma por estado em Geolocalização → Legenda do mapa, com prévia; nunca uma cor livre.
- **Padrões da legenda:** a cor da tag de Status (Lead verde-água, Prospect âmbar, Cliente verde, outras pela cor da tag), **Sem visita há 60+ dias** em Alerta (vale só para o Status Cliente e prevalece sobre a cor do Status) e **Visita tentada** em Índigo.
- **Chips do topo:** gerados das tags de Status que "aparecem no mapa", com a cor da legenda e o total; Prospect e Inativo nascem desligados ao abrir (Inativo nem aparece). (O atalho "Clientes sem visita 60+ dias" saiu em 31/10/2026, a pedido do Ale; o estado continua no pin e na legenda.) Os leads só entram por lote de importação, até 500 por vez, com contador.
- **Ferramentas (coluna da direita):** selecionar por retângulo (dois toques nos cantos), por raio (toque no centro; 2, 5, 10 e 25 km) e cobertura por município (bolha no centro da cidade com quantas faltam e a lista com "N de M visitadas"). A seleção lista, abre a empresa ou aplica uma tag; por padrão exclui as já visitadas, com a opção de incluir.
- **Editor de rota (G4):** painel à **direita** do mapa (cartão `--surface`, 360 px, mesma altura do painel da empresa), como na referência: código e total de paradas no topo, dois cartões de totais (distância e tempo "com N min por visita"), nome, data, responsável, ponto de partida, "Voltar ao ponto de partida", **Ordem de visita** (linha por parada: alça de arrastar, número num círculo `--accent`, nome, bairro · cidade · "+N km" do trecho, pin com a cor da legenda, remover; aviso `--warning` na parada com coordenada aproximada) e, fixos no rodapé, **Google Maps** (secundário) e **Salvar alterações** (primário). "Otimizar ordem" é um botão `ghost` com o ícone `zap` no título da lista. No mapa, as paradas mostram o **número** no pin e o trajeto é uma linha tracejada `--accent` sobre as ruas (linha reta, com o aviso, quando a ordem veio da estimativa em linha reta). O painel da empresa e o editor podem estar abertos juntos no computador; no celular, o editor é tela cheia com as abas **Lista | Mapa**.
- **Rotas (G4):** a lista (`/rotas`) e a tela da rota (`/rotas/:id`) seguem as telas de lista (cartão com linhas, selo da situação: Planejada `outline`, Em andamento `info`, Concluída `success`, Cancelada `danger`). Na tela da rota, a próxima parada fica com fundo `--accent-soft` e as ações em botões de 40 px (Navegar, Ligar, Check-in, Pular). O card "Rota de hoje" do Dashboard usa a borda e o fundo de destaque (`brand`), como o card de relatórios pendentes usa os de aviso.
- Teste que protege a regra: `apps/web/e2e/mapa-layout.spec.ts` (1920×1080, 1366×768 e 390×844: janela sem rolagem, mapa ocupando a área central).

## Geolocalização (G1)
- **Selo de precisão** (`SeloDePosicao`, `Badge` com ícone e palavra, nunca só a cor): **Posição exata** (verde, `CircleCheck`), **Posição aproximada** (âmbar, `MapPin`), **Sem coordenada** (neutro, `CircleDashed`) e **Endereço a confirmar** (vermelho, `CircleAlert`). Ao lado, a origem em texto ("Censo 2022 do IBGE (CNEFE)", "OpenStreetMap", "CEP ou cidade", "Ajustada à mão", "Check-in da visita").
- **Cartão "Localização" da ficha** (coluna da direita do Resumo): selo, origem, o raio de incerteza em palavras ("cerca de 100 m da porta", "até 1 km da porta"), o que falta no endereço e as ações **Ajustar posição** e **Procurar de novo**. Quando o endereço muda depois de um ajuste à mão, um aviso com **Manter a posição** e **Procurar o endereço novo**.
- **Ajustar posição:** diálogo de 640 px com um mapa de 360 px (300 px no celular). O pin da empresa (40 px, contorno forte) se arrasta ou se toca no mapa; um círculo tracejado mostra a incerteza atual. "Confirmar posição" só habilita depois de mexer. Sem o PMTiles instalado, o mapa vira um fundo liso com o aviso "O mapa base ainda não foi instalado" e o pin continua valendo.
- **Tela Geolocalização** (menu Carteira e seção das Configurações; mesma tela): abas **Resumo e lotes** (administrador e gestor), **Confirmar endereço** (todos; cada um vê a sua carteira) e **Regiões** (administrador edita; gestor lê). Lote: "Por cidade/região" + "Ver quantas são" mostra o total e quantas já têm coordenada antes de "Iniciar o lote"; a lista de lotes atualiza a cada 3 s enquanto algum anda e traz o relatório por resultado.
- **Créditos do mapa (31/10/2026):** a fonte dos dados dos pins ("Fonte: IBGE – CNEFE 2022", só quando algum pin veio do CNEFE) entra na linha de créditos do MapLibre, logo antes do "© OpenStreetMap contributors"; o zoom (+ e −) fica em cima dos créditos, sem cobrir nada (`components/mapa/atribuicao.ts`).
- **Mapa (componente `MapaBase`):** MapLibre + PMTiles do estado, **carregados sob demanda** (a biblioteca tem ~1 MB, num chunk à parte que só baixa quando alguém abre um mapa, mas **fica no precache do PWA**: o `validar-dist` exige todo `.js` de `assets/` na lista, e é o precache que evita o erro de arquivo inexistente para quem está com o app aberto durante um deploy. Decisão do Ale em 17/10/2026, depois de o push do mapa falhar no build da esteira por tentarmos tirá-lo do precache); glifos dos rótulos em `public/mapa/fontes` (Noto Sans, OFL), sem nenhum serviço externo; tema claro e escuro acompanham o `data-theme`.

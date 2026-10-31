# Plano: ajustes de Atividades, Chamados e Mapa

*Proposta de 31/10/2026, **aprovada pelo Ale em 31/10/2026** (as três decisões da seção 10 como recomendado, com o "X" dentro da legenda). Sete ajustes pedidos, todos **só no front** (`apps/web` e `packages/ui`): nenhuma migração, nenhuma rota de API nova, nenhuma variável de ambiente nova. Cada item vira um commit pequeno, com o teste da mudança, na ordem da seção 9.*

## 1. Resumo

| # | Tela | Pedido | Causa encontrada | Onde mexe |
|---|---|---|---|---|
| A1 | Atividades | Barra de rolagem aparecendo na barra de abas e a aba às vezes some | Componente `Tabs` compartilhado: a lista de abas é um item flex que pode **encolher** na vertical (com `overflow` diferente de `visible`, o mínimo dela vira 0) e depende só de `scrollbar-width`/`::-webkit-scrollbar` para esconder a barra | `packages/ui/src/tabs.tsx`, `apps/web/src/styles/globals.css` |
| C1 | Chamados | A primeira mensagem da conversa sai do balão | O texto usa `whitespace-pre-wrap` **sem quebra de palavra longa** (URL, código, e-mail): a palavra não quebra e vaza | `apps/web/src/telas/chamados/detalhe.tsx` |
| M1 | Mapa | Tirar o filtro rápido "Clientes sem visita 60+ dias" | Chip fixo no fim dos chips de Status | `telas/mapa/filtros.tsx`, `estado.ts` |
| M2 | Mapa | "Fonte: IBGE – CNEFE 2022" em cima do zoom (+/−) | O aviso é um `<p>` absoluto em `right-0 bottom-5`, no mesmo canto do `NavigationControl` (`bottom-right`) | `components/mapa/mapa-base.tsx` |
| M3 | Mapa | Legenda poder fechar e abrir, com botão abaixo do botão de Rotas | Legenda sempre aberta no rodapé | `telas/mapa/pagina.tsx`, `legenda.tsx` |
| M4 | Mapa | Barra de rolagem nas abas do painel da empresa | Mesma causa do A1 (o painel é uma coluna de altura fixa: `flex min-h-0 flex-1 flex-col`, onde a lista de abas encolhe) | Resolvido pelo A1 + teste próprio |

A1 e M4 são o **mesmo defeito**, no componente `Tabs` de `packages/ui`. A correção vale para as 14 telas que usam abas (Empresa, Contato, Oportunidade, Chamados, Visitas, Perfis, Geolocalização, Tags, Integrações, Portal, Dashboard etc.).

## 2. A1 + M4: barra de abas sem rolagem visível

### 2.1 Diagnóstico

Hoje (`packages/ui/src/tabs.tsx`), a lista é:

```
flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)]
[scrollbar-width:none] [&::-webkit-scrollbar]:hidden
```

1. **Encolhimento na vertical.** O `Tabs.Root` é usado como coluna flex (`flex flex-col` em Atividades; `flex min-h-0 flex-1 flex-col` no painel do mapa). A lista não tem `flex-none`. Como ela tem `overflow` ≠ `visible`, o `min-height: auto` vira 0 e, quando falta altura (painel do mapa com cabeçalho alto, tela baixa de notebook, teclado aberto no celular), **só a lista encolhe** (o conteúdo ao lado tem `flex-1`, base 0). Resultado: a aba aparece cortada ou some ("às vezes aparece a aba") e, com o conteúdo maior que a caixa, o navegador mostra a barra.
2. **Barra escondida só por duas regras.** `scrollbar-width: none` e `::-webkit-scrollbar { display: none }` cobrem Chrome, Edge, Firefox e Safari atuais; em navegadores mais antigos (Safari do iPad antes do 18.2, WebView de Android antigo) ou com **zoom do Windows em 125%/150%** (arredondamento de subpixel cria 1 px de "sobra" de altura), a barra pode voltar a aparecer.

**Passo 0 (antes de mexer):** reproduzir no Playwright, em Atividades (1280×800 e 390×844) e no painel do mapa (1280×720), medindo `scrollHeight > clientHeight` e `offsetHeight` da `tablist` e tirando captura. Se a medição apontar outra causa, o plano é ajustado antes do commit.

### 2.2 Correção (no componente compartilhado)

*Feita em 31/10/2026. A reprodução no navegador (Chromium, CSS do build) confirmou duas causas:* no painel do mapa, com o cabeçalho alto, a lista de abas encolhia até **0 px**; em Atividades no celular, as três abas com contador somavam **371 px numa faixa de 358 px** (390 px de tela), a última ficava cortada e a faixa rolava na horizontal.

- Lista de abas: **`flex-none`** (não encolhe nunca) e **`min-w-0`**. As regras que escondem a barra (`scrollbar-width: none` e `::-webkit-scrollbar`) ficam como estavam: a medição não mostrou barra nem sobra de altura com zoom de 125% e 150%, então a utilidade nova e a altura fixa `h-10` previstas na proposta não foram necessárias.
- Opção nova **`preencher`** no `Tabs`: abaixo de `md`, as abas dividem a largura (`flex-1`, centralizadas) e ficam mais justas (`px-1.5`, `gap-1`, 13 px). Usada em Atividades: as três abas cabem inteiras de 360 px para cima; abaixo disso (ou com contadores muito grandes) a faixa ainda rola com o dedo, sem barra.
- Nada muda em cores ou tokens; as outras telas com abas só ganham o `flex-none`.

### 2.3 Testes

- **Vitest** (`packages/ui`): a `tablist` tem `flex-none` e as regras sem barra; com `preencher`, as abas dividem a largura no celular.
- **E2E novo** `apps/web/e2e/abas-layout.spec.ts`: em Atividades (desktop, tablet, celular) e no painel da empresa do mapa (desktop 1280×720 e celular), a `tablist` tem `scrollHeight === clientHeight`, altura de 40 px, e todas as abas estão visíveis (dentro da caixa, ou alcançáveis rolando na horizontal no celular). Captura de tela com `CAPTURAS_DIR`, como em `mapa-layout.spec.ts`.
- Rodar os E2E de layout existentes (`empresas-layout`, `contatos-layout`, `layout`, `mapa-layout`) para garantir que as outras telas com abas não mudaram.

### 2.4 Docs

- `docs/design_system.md`, item "Barra de abas": não encolhe, não mostra barra e a opção `preencher`.

## 3. C1: mensagem que vaza do balão em Chamados

### 3.1 Diagnóstico

Em `apps/web/src/telas/chamados/detalhe.tsx`, a primeira mensagem (a descrição de quem abriu o chamado, linha ~694) é `<p className="m-0 text-sm whitespace-pre-wrap">`. `pre-wrap` preserva quebras, mas **não quebra uma palavra maior que o balão** (link colado, número de nota, caminho de arquivo, e-mail). As mensagens seguintes (`Bolha`, linha ~154) e as notas internas (linha ~431) têm o mesmo problema; a primeira é a que mais aparece porque é onde o cliente cola o link ou o erro. O Portal (`portal/publicacoes.tsx`) já usa `break-words`.

### 3.2 Correção

- Nas três `<p>` (descrição, `Bolha`, nota interna): acrescentar `[overflow-wrap:anywhere]` (o mesmo usado em `atividades/lista.tsx`) e `min-w-0` no `<li>` do balão.
- Conferir a tela de chamado do **Portal do cliente** (mesma conversa vista pelo cliente) e aplicar o mesmo se tiver o problema.

### 3.3 Testes

- **Vitest** (`chamados/detalhe.test.tsx`): o parágrafo da descrição e o da mensagem têm a classe de quebra.
- **E2E** (`chamados.spec.ts`): chamado com descrição de uma "palavra" de 300 caracteres; `scrollWidth <= clientWidth` do balão no desktop e no celular.

## 4. M1: tirar "Clientes sem visita 60+ dias"

### 4.1 O que sai

- O botão-chip em `telas/mapa/filtros.tsx` (e o ícone `TriangleAlert` se não for mais usado).
- O campo `semVisita60` de `FiltrosDaTela` e a linha `semVisitaDias: 60` de `filtrosDaApi` (`telas/mapa/estado.ts`). O filtro não está na URL (a rota do mapa só lê `rota`), então não há link antigo para tratar.

### 4.2 O que **não** sai

- O **estado** "Sem visita há 60+ dias" dos pins e da legenda (cor vermelha nos Clientes sem visita há 60+ dias) continua: é regra de `funcionalidades.md` e da legenda configurável.
- O parâmetro `semVisitaDias` da API `/v1/mapa/pontos` continua (é o filtro pronto "Sem visita há X dias" da seção 3 de `funcionalidades.md` e o servidor já o trata em `apps/api/src/mapa/filtros.ts`). Só o atalho da tela sai.

### 4.3 Testes e docs

- `mapa.test.tsx`: trocar o teste "Clientes sem visita 60+ dias liga o atalho" por "o chip Clientes sem visita 60+ dias não existe" e conferir que a consulta não manda `semVisitaDias`.
- `docs/design_system.md` (item "Chips do topo"): tirar "Mais o atalho 'Clientes sem visita 60+ dias'". `docs/revisao_prototipo.md`: anotar que o protótipo tem o chip e que ele saiu a pedido do Ale em 31/10/2026.

## 5. M2: "Fonte: IBGE" ao lado do "© OpenStreetMap contributors"

### 5.1 Correção

Em `components/mapa/mapa-base.tsx`:

- Criar o mapa com `attributionControl: false` e adicionar o controle à mão: `new maplibre.AttributionControl({ compact: false, customAttribution })`, no canto `bottom-right`, como hoje.
- Quando `fonteDosDados` mudar (aparece só quando algum pin veio do CNEFE), remover o controle e adicionar de novo com `customAttribution: props.fonteDosDados` (o MapLibre não troca a atribuição personalizada depois de criado). Sem fonte, o controle volta só com a do mapa base.
- Remover o `<p>` absoluto de `right-0 bottom-5`.

Resultado no rodapé: `Fonte: IBGE – CNEFE 2022 | © OpenStreetMap contributors` numa linha só, abaixo do + e −, sem sobrepor nada. A atribuição continua visível (obrigação da licença do OSM e da citação do IBGE).

### 5.2 Testes e docs

- Os testes da página (`mapa.test.tsx`) usam um `MapaBase` falso e seguem valendo (continuam conferindo que a página manda `fonteDosDados` só com pin do CNEFE).
- `components/mapa/mapa.test.ts`: o controle de atribuição recebe `customAttribution` com a fonte e é recriado quando ela muda.
- **E2E** (`mapa-layout.spec.ts`): com pin do CNEFE, `.maplibregl-ctrl-attrib` contém "IBGE" e a caixa dela **não intersecta** a caixa do `.maplibregl-ctrl-group` (zoom), no desktop e no celular.
- `docs/design_system.md`, seção do mapa: "a fonte dos dados (IBGE – CNEFE 2022) entra na atribuição do mapa, ao lado do OpenStreetMap".

## 6. M3: legenda que abre e fecha

### 6.1 Comportamento

- Novo `IconButton` na barra **Ferramentas do mapa**, **logo abaixo do botão de Rotas** (último da coluna; sem permissão de rota, fica logo abaixo de Camadas). Ícone `List` (lucide), estilo igual aos vizinhos (`bg-surface shadow-md`, `ring-2 ring-brand` quando a legenda está aberta).
- `aria-pressed` e rótulo: "Esconder a legenda" / "Mostrar a legenda"; `aria-controls` apontando para a seção da legenda.
- Fechada, a legenda some do rodapé (o total "N empresas nesta área" continua). Aberta, igual a hoje.
- **Começa aberta** e a escolha fica salva no aparelho (`localStorage`, chave `leadtogo:mapa:legenda`), como uma preferência de tela: quem fechou não precisa fechar de novo a cada visita.
- **Celular:** hoje a legenda não aparece no celular. Recomendo **manter assim** nesta entrega e não mostrar o botão no celular; mostrar a legenda no celular (por exemplo numa folha que sobe de baixo) fica no backlog, se o Ale quiser.
- Um `IconButton` "Fechar legenda" (`X`) no cabeçalho da própria legenda, que faz o mesmo que o botão da barra e devolve o foco para ele.

### 6.2 Testes e docs

- `mapa.test.tsx`: o botão aparece depois do de Rotas; começa com a legenda visível; clicar esconde a região "Legenda do mapa" e troca o rótulo; clicar de novo mostra; a preferência é lida do `localStorage` ao abrir.
- `mapa-layout.spec.ts`: o botão fica abaixo do de Rotas (coordenada `y` maior, mesma coluna) e a legenda some e volta.
- `docs/design_system.md` (controles do mapa à direita): incluir "legenda (mostrar/esconder)". `docs/funcionalidades.md`, item Mapa: "a legenda abre e fecha pelo botão da barra de ferramentas; a escolha fica salva no aparelho".

## 7. O que não entra

- Nenhuma mudança de banco, API, permissões ou regra de carteira.
- Legenda no celular (ver 6.1), se o Ale não pedir agora.
- Revisar as outras listas com carrossel à mão (chips de Empresas etc.) além de passar a usar a utilidade nova, só se o teste mostrar o mesmo defeito.

## 8. Riscos

| Risco | Como fica coberto |
|---|---|
| A mudança no `Tabs` afetar as outras 13 telas | Mudança só de layout (não encolher, mesma altura visual de 40 px); E2E de layout existentes + o novo de abas |
| Recriar o controle de atribuição piscar o rodapé | Só recria quando `fonteDosDados` muda (raro: ao entrar/sair de área com CNEFE) |
| Alguém sentir falta do atalho "60+ dias" | O estado continua no pin e na legenda (os Clientes sem visita há 60+ dias seguem vermelhos); o parâmetro da API fica, então voltar com o atalho é um commit pequeno |

## 9. Ordem de implantação

Cada passo é um commit com o próprio teste, depois de `pnpm lint && pnpm typecheck && pnpm test` (e dos E2E citados) verdes:

1. `fix(ui): barra de abas não encolhe nem mostra barra de rolagem` (A1 + M4, com o E2E de abas e o `design_system.md`).
2. `fix(web): mensagens do chamado quebram palavras longas dentro do balão` (C1).
3. `feat(web): mapa sem o atalho "Clientes sem visita 60+ dias"` (M1, com `design_system.md` e `revisao_prototipo.md`).
4. `fix(web): fonte do IBGE na atribuição do mapa, longe do zoom` (M2).
5. `feat(web): botão para mostrar e esconder a legenda do mapa` (M3, com `funcionalidades.md` e `design_system.md`).

**Depois do deploy** (roteiro curto de conferência no navegador real, inclusive no celular/PWA e num notebook Windows com zoom de 125%):

- Atividades: trocar de aba várias vezes, redimensionar a janela: nenhuma barra, abas sempre inteiras.
- Mapa: abrir o painel de uma empresa numa tela baixa: abas inteiras, sem barra; conteúdo rola por dentro.
- Chamados: chamado com link longo na descrição: texto quebra dentro do balão.
- Mapa: com pins do CNEFE, "Fonte: IBGE – CNEFE 2022" na linha do OpenStreetMap, sem tocar no + e −; chip "60+ dias" não aparece; legenda fecha, abre e lembra a escolha ao recarregar.

**Rollback:** como são só mudanças de front, basta reverter o commit do item com problema (`git revert`) e o deploy volta a versão anterior; não há dado nem migração para desfazer.

## 10. Decisões (aprovadas pelo Ale em 31/10/2026)

1. **Legenda no celular:** manter sem legenda e sem botão no celular (recomendado) ou já levar a legenda para o celular? **Aprovado: manter sem legenda no celular.**
2. **Estado inicial da legenda:** começar aberta e lembrar a escolha no aparelho (recomendado) ou começar sempre aberta? **Aprovado: aberta e lembrando a escolha.**
3. **Botão "X" dentro da legenda**, além do botão da barra: incluir (recomendado) ou só o da barra? **Aprovado: incluir.**

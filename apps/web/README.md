# apps/web

Front-end React + Vite (PWA), TanStack Router/Query, Tailwind v4 + shadcn/ui com os tokens de `docs/design-system`.
Offline: leitura + fila (Dexie). Empacotável com Capacitor para iOS/Android.
Ver `docs/configuracao_tecnologia.md` (seção 8) e `docs/design_system.md`.

## Estado atual (E9a, fundação)

Vite + React 19, TanStack Router (rotas por arquivo em `src/routes`, `routeTree.gen.ts` gerado) e Query, cliente da API (`src/api`), Tailwind v4 com os tokens, e os componentes base em `src/components/ui`. As telas de acesso e a camada de autenticação (E9b, aguardando aprovação) estão em `src/auth` e `src/telas/acesso`; a casca (E9c) e o PWA entram nas próximas partes.

## Design system: fonte única

`docs/design-system/` é a única fonte. O script `scripts/sincronizar-design-system.mjs` copia `tokens.css`, `tailwind-theme.css` e as fontes `.woff2` para `src/styles/` (cópias **fora do Git**) antes do `dev`, do `build` e dos `test`. Nunca edite as cópias. As fontes são servidas pelo próprio app (sem CDN). O Dockerfile do web precisa copiar `docs/design-system/` antes do build (E11).

Regras: nada de cor, fonte ou espaçamento fora dos tokens; a altura dos controles vem de `data-density` (`compact` 28 px, padrão 36 px, `touch` 44 px); foco visível em tudo; todo botão só com ícone leva `label`.

## Catálogo de componentes (só em desenvolvimento)

`pnpm dev` e abra `http://localhost:5173/dev/catalogo`: todos os componentes, com troca de tema e de densidade. Fica fora do build de produção (alias para um módulo vazio; um teste garante).

## Scripts

- `pnpm dev`: Vite em `http://localhost:5173` (escuta em `0.0.0.0` para o navegador do Windows alcançar o WSL). Chamadas a `/v1/*` e `/health` vão por **proxy** para a API em `http://localhost:3000` (`VITE_API_PROXY` muda o destino): o navegador só fala com a origem do front, sem CORS e sem cookie entre origens. Suba a API com `pnpm --filter @leadtogo/api dev`.
- `pnpm build` (sincroniza, typecheck e build) · `pnpm preview`
- `pnpm e2e`: Playwright contra API, worker, banco e Mailpit reais (suba `pnpm dev:up` e `pnpm db:migrate` antes; sobe a própria API em :3100 e o Vite em :5183)
- `pnpm comparar:catalogos` e `pnpm capturar:acesso`: capturas de conferência visual em `~/projetos/leadtogo-capturas/`
- `pnpm test`: Vitest com jsdom e Testing Library (inclui testes de teclado e rótulos acessíveis)

Os pacotes internos (`@leadtogo/shared`, `@leadtogo/api-client`) são lidos direto do código-fonte pela condição `@leadtogo/source`, sem precisar de build.

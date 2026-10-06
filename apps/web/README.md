# apps/web

Front-end React + Vite (PWA), TanStack Router/Query, Tailwind v4 + shadcn/ui com os tokens de `docs/design-system`.
Offline: leitura + fila (Dexie). Empacotável com Capacitor para iOS/Android.
Ver `docs/configuracao_tecnologia.md` (seção 8) e `docs/design_system.md`.

## Estado atual

Só o esqueleto: Vite + React 19 com `src/main.tsx` e `src/App.tsx`. Router, Query, Tailwind/shadcn, PWA e Capacitor entram nas próximas etapas.

## Scripts

- `pnpm dev`: Vite em `http://localhost:5173` (escuta em `0.0.0.0` para o navegador do Windows alcançar o WSL)
- `pnpm build` (typecheck + build) · `pnpm preview`
- `pnpm test`: Vitest com jsdom e Testing Library

Os pacotes internos (`@leadtogo/shared`, `@leadtogo/api-client`) são lidos direto do código-fonte pela condição `@leadtogo/source`, sem precisar de build.

# apps/api

API NestJS (REST + OpenAPI em `/docs`) e o processo **worker** (mesma imagem, comando `node dist/worker.js`).
Módulos por domínio: tenants, membros, empresas, contatos, atividades, oportunidades, funis, tags, prospecção, integrações.
Ver `docs/configuracao_tecnologia.md` (seções 4 e 11.3).

## Estrutura

| Arquivo                                      | Papel                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/main.ts`                                | Entrypoint HTTP (`dist/main.js`): rotas em `/v1`, Swagger em `/docs` (desligado em produção por enquanto) |
| `src/worker.ts`                              | Entrypoint do worker (`dist/worker.js`): contexto Nest sem HTTP, para filas BullMQ e sincronizações       |
| `src/app.ts`                                 | `criarApp()` e `criarDocumentoOpenApi()`, usados pelo main, pelos testes e pela geração do OpenAPI        |
| `src/app.module.ts` · `src/worker.module.ts` | Módulos raiz da API e do worker                                                                           |
| `src/health/`                                | `GET /health` → `{ status, version }` (fora do prefixo `/v1`; usado pelo smoke test do deploy)            |
| `src/gerar-openapi.ts`                       | Gera `openapi.json`, de onde sai o `packages/api-client`                                                  |

## Scripts

- `pnpm dev`: compila em modo watch e sobe API (porta `PORT`, padrão 3000) e worker com recarga, lendo o `.env` da raiz
- `pnpm build` · `pnpm start` · `pnpm start:worker`
- `pnpm openapi`: atualiza `openapi.json` (depois rode `pnpm --filter @leadtogo/api-client generate`)
- `pnpm test`: Vitest (SWC para os metadados de decorators do Nest). Usa o banco `leadtogo_api_test` e o Valkey `db 1` (`TEST_API_*` e `TEST_REDIS_URL` no `.env`), zerados e migrados no setup global; precisa de `pnpm dev:up`. O setup global lê `@leadtogo/db` pelo `dist`, então rode pela raiz (`pnpm test`, que compila as dependências antes) ou faça `pnpm --filter @leadtogo/db build` antes de `pnpm --filter @leadtogo/api test`.

ESM puro (`"type": "module"`): imports relativos levam a extensão `.js`.
Em runtime, os pacotes internos (`@leadtogo/db`, `@leadtogo/shared`) são lidos do `dist` deles; o `pnpm dev` da raiz compila-os antes.

# packages/api-client

Cliente TypeScript gerado a partir do OpenAPI da API (não editar `src/gerado/` à mão).

- `criarApiClient(baseUrl)` devolve um cliente `openapi-fetch` tipado pelas rotas da API (envia cookies de sessão).
- Para atualizar depois de mudar a API:
  ```bash
  pnpm --filter @leadtogo/api openapi          # gera apps/api/openapi.json
  pnpm --filter @leadtogo/api-client generate  # gera src/gerado/schema.ts
  ```

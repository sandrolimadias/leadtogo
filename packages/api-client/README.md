# packages/api-client

Cliente TypeScript gerado a partir do OpenAPI da API (não editar `src/gerado/` à mão).

- `criarApiClient(baseUrl)` devolve um cliente `openapi-fetch` tipado pelas rotas do CRM (envia o cookie de sessão: `credentials: 'include'`). Exemplo:
  ```ts
  const api = criarApiClient('https://api.crm.aledias.com.br')
  const { data, error } = await api.GET('/v1/me') // data: Me
  await api.POST('/v1/sessao/empresa-ativa', { body: { empresaId } })
  ```
  Em `error` vem o formato padrão `Erro` (`{ statusCode, erro, mensagem, request_id, detalhes? }`); trate pelo código estável em `erro`.
- **Login, logout, 2FA, recuperação de senha e verificação de e-mail** (`/v1/auth/*`) são do Better Auth e **não** estão neste cliente: use `better-auth/client` (`createAuthClient`) para elas.
- Para atualizar depois de mudar a API:
  ```bash
  pnpm --filter @leadtogo/api openapi          # gera apps/api/openapi.json
  pnpm --filter @leadtogo/api-client generate  # gera src/gerado/schema.ts
  ```
  Os testes falham se o `openapi.json` ou o `schema.ts` ficarem desatualizados em relação ao código.

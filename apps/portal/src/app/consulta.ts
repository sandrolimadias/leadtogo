import { QueryClient } from '@tanstack/react-query'

/** Cliente do TanStack Query: dados da API ficam "frescos" por 30 s; erros 4xx não são repetidos. */
export function criarQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (tentativas, erro) => {
          const status = (erro as { status?: number }).status
          if (status !== undefined && status >= 400 && status < 500) return false
          return tentativas < 2
        },
      },
    },
  })
}

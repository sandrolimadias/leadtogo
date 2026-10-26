import { redirect } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import type { SessaoDoPortal } from '@leadtogo/api-client'

import type { ServicosDoPortal } from '@/servicos/tipos'

export interface ContextoDoRoteador {
  queryClient: QueryClient
  servicos: ServicosDoPortal
}

export const CHAVE_DA_SESSAO = ['sessao'] as const

/** Erro com o status HTTP, para o roteador e o TanStack Query decidirem (4xx não se repete). */
export class ErroDeServico extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    readonly codigo: string,
  ) {
    super(mensagem)
  }
}

/** A sessão do portal, ou `null` se a pessoa não está logada (401). Outros erros (rede, 5xx) sobem. */
export async function obterSessao(ctx: ContextoDoRoteador): Promise<SessaoDoPortal | null> {
  try {
    return await ctx.queryClient.fetchQuery({
      queryKey: CHAVE_DA_SESSAO,
      staleTime: 30_000,
      retry: false,
      queryFn: async () => {
        const r = await ctx.servicos.sessao.atual()
        if (!r.ok) throw new ErroDeServico(r.erro.mensagem, r.erro.status, r.erro.codigo)
        return r.dados
      },
    })
  } catch (erro) {
    if (erro instanceof ErroDeServico && erro.status === 401) return null
    throw erro
  }
}

/** Rota que exige login. Com o 2FA pendente, só a tela de verificação passa. */
export async function exigirSessao(
  ctx: ContextoDoRoteador,
  opcoes: { permitePendente?: boolean } = {},
): Promise<SessaoDoPortal> {
  const sessao = await obterSessao(ctx)
  if (!sessao) throw redirect({ to: '/entrar' })
  if (sessao.segundoFatorPendente && !opcoes.permitePendente) throw redirect({ to: '/verificacao' })
  return sessao
}

/** Rota só para quem ainda não entrou (a tela de entrada). */
export async function exigirVisitante(ctx: ContextoDoRoteador): Promise<void> {
  const sessao = await obterSessao(ctx)
  if (sessao) throw redirect({ to: sessao.segundoFatorPendente ? '/verificacao' : '/' })
}

import type { Me } from '@leadtogo/api-client'
import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import type { ServicosDeAcesso } from './tipos'

export const chaveDoMe = ['me'] as const

export interface ContextoDoRoteador {
  queryClient: QueryClient
  servicos: ServicosDeAcesso
}

/** A sessão de agora (sempre confere no servidor: o guarda não confia em cache). */
export const buscarMe = (ctx: ContextoDoRoteador): Promise<Me | null> =>
  ctx.queryClient.fetchQuery({ queryKey: chaveDoMe, queryFn: ctx.servicos.me, staleTime: 0 })

/** Só aceita caminhos internos como destino (evita redirecionar para outro site). */
export function destinoSeguro(destino: string | undefined): string {
  if (destino && destino.startsWith('/') && !destino.startsWith('//') && !destino.includes('\\')) {
    return destino
  }
  return '/'
}

/** Telas que exigem login: sem sessão vai para o login, lembrando para onde voltar. */
export async function exigirSessao(ctx: ContextoDoRoteador, destino: string): Promise<Me> {
  const me = await buscarMe(ctx)
  if (!me) throw redirect({ to: '/login', search: { redirect: destino } })
  return me
}

/** A casca do app: além da sessão, o administrador sem 2FA fica preso na ativação até ativar. */
export async function exigirAplicativo(ctx: ContextoDoRoteador, destino: string): Promise<Me> {
  const me = await exigirSessao(ctx, destino)
  if (me.doisFatoresPendente) throw redirect({ to: '/ativar-2fa' })
  return me
}

/** Telas de quem ainda não entrou (login, esqueci a senha): com sessão, vai para o app. */
export async function exigirVisitante(ctx: ContextoDoRoteador): Promise<void> {
  const me = await buscarMe(ctx)
  if (me) throw redirect({ to: me.doisFatoresPendente ? '/ativar-2fa' : '/' })
}

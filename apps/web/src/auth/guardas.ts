import type { Me } from '@leadtogo/api-client'
import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'

import { meOffline } from '@/lib/offline/visitas'

import type { ServicosDeAcesso } from './tipos'

export const chaveDoMe = ['me'] as const

export interface ContextoDoRoteador {
  queryClient: QueryClient
  servicos: ServicosDeAcesso
}

/**
 * A sessão de agora: sempre confere no servidor (o guarda não confia em cache). Só SEM REDE (o fetch nem
 * chegou ao servidor) vale a última sessão conferida: a desta aba ou, com o app aberto sem sinal, a guardada
 * no aparelho para as visitas offline (G3b; cifrada, 7 dias, apagada ao sair).
 */
export async function buscarMe(ctx: ContextoDoRoteador): Promise<Me | null> {
  // sem rede, o React Query PAUSA a consulta (espera a rede voltar): nem tenta, vai direto à sessão guardada
  if (!navigator.onLine) {
    const guardada = await sessaoSemRede(ctx)
    if (guardada) return guardada
  }
  try {
    return await ctx.queryClient.fetchQuery({
      queryKey: chaveDoMe,
      queryFn: ctx.servicos.me,
      staleTime: 0,
    })
  } catch (erro) {
    const semRede = erro instanceof TypeError || !navigator.onLine
    if (!semRede) throw erro
    const guardada = await sessaoSemRede(ctx)
    if (guardada) return guardada
    throw erro
  }
}

/** A última sessão conferida: a desta aba ou a guardada no aparelho (visitas offline, G3b). */
async function sessaoSemRede(ctx: ContextoDoRoteador): Promise<Me | null> {
  const daAba = ctx.queryClient.getQueryData<Me | null>(chaveDoMe)
  if (daAba) return daAba
  const doAparelho = await meOffline().catch(() => null)
  if (doAparelho) ctx.queryClient.setQueryData(chaveDoMe, doAparelho)
  return doAparelho
}

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

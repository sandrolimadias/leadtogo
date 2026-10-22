import type { Me } from '@leadtogo/api-client'
import type { Alcance } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'

import { useServicos } from './contexto'
import { chaveDoMe } from './guardas'

/**
 * Permissões do perfil de acesso na empresa ativa (vêm do GET /v1/me). O servidor sempre decide; o
 * front só esconde o que a pessoa não pode usar. Sem empresa ativa ou sem perfil: nenhuma.
 */
export type Permissoes = Record<string, Alcance | true>

export const permissoesDaAtiva = (me: Me | null | undefined): Permissoes =>
  me?.empresas.find((e) => e.ativa)?.permissoes ?? {}

/** Tem ao menos UMA das permissões (como o `@Permissao` da API). */
export const podeCom = (permissoes: Permissoes, chave: string | readonly string[]): boolean =>
  (typeof chave === 'string' ? [chave] : chave).some((c) => permissoes[c] !== undefined)

export const alcanceCom = (permissoes: Permissoes, chave: string): Alcance | undefined => {
  const v = permissoes[chave]
  return v === undefined || v === true ? undefined : v
}

export function usePermissoes(): {
  pode: (chave: string | readonly string[]) => boolean
  alcanceDe: (chave: string) => Alcance | undefined
  carregando: boolean
} {
  const servicos = useServicos()
  const me = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me })
  const permissoes = permissoesDaAtiva(me.data)
  return {
    pode: (chave) => podeCom(permissoes, chave),
    alcanceDe: (chave) => alcanceCom(permissoes, chave),
    carregando: me.isPending,
  }
}

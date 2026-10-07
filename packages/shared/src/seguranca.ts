import { z } from 'zod'

import type { PapelMembro } from './me.js'

/**
 * Quem a empresa obriga a ter 2FA (`tenant_configuracoes.dois_fatores_exigido`):
 * `admin` (padrão), `admin_gestor` ou `todos`.
 */
export const politicaDoisFatoresSchema = z.enum(['admin', 'admin_gestor', 'todos'])
export type PoliticaDoisFatores = z.infer<typeof politicaDoisFatoresSchema>

/** A política obriga este papel a ter 2FA? */
export function politicaExige(politica: PoliticaDoisFatores, papel: PapelMembro): boolean {
  if (politica === 'todos') return true
  if (politica === 'admin_gestor') return papel === 'admin' || papel === 'gestor'
  return papel === 'admin'
}

/** GET /v1/configuracoes/seguranca. */
export const segurancaSchema = z
  .object({ doisFatoresExigido: politicaDoisFatoresSchema })
  .meta({ id: 'ConfiguracaoDeSeguranca' })
export type Seguranca = z.infer<typeof segurancaSchema>

/** PATCH /v1/configuracoes/seguranca (somente administrador da empresa ativa). */
export const segurancaPatchSchema = z
  .object({ doisFatoresExigido: politicaDoisFatoresSchema })
  .strict()
  .meta({ id: 'ConfiguracaoDeSegurancaEntrada' })
export type SegurancaPatch = z.infer<typeof segurancaPatchSchema>

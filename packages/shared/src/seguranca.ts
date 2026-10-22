import { z } from 'zod'

import type { PapelMembro } from './me.js'

/**
 * Política ANTIGA de 2FA por papel (`tenant_configuracoes.dois_fatores_exigido`): `admin` (padrão),
 * `admin_gestor` ou `todos`. Desde a Fase 1 vale o flag `exige_2fa` do perfil de acesso; a política só
 * decide para o membro que ainda não tem perfil (transição até a contração).
 */
export const politicaDoisFatoresSchema = z.enum(['admin', 'admin_gestor', 'todos'])
export type PoliticaDoisFatores = z.infer<typeof politicaDoisFatoresSchema>

/** A política obriga este papel a ter 2FA? */
export function politicaExige(politica: PoliticaDoisFatores, papel: PapelMembro): boolean {
  if (politica === 'todos') return true
  if (politica === 'admin_gestor') return papel === 'admin' || papel === 'gestor'
  return papel === 'admin'
}

/** GET /v1/configuracoes/seguranca: quem precisa de 2FA, perfil por perfil. */
export const segurancaSchema = z
  .object({
    perfis: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        sistema: z.boolean(),
        chaveSistema: z.enum(['admin', 'gestor', 'vendedor']).nullable(),
        ativo: z.boolean(),
        /** Membros não excluídos com o perfil */
        membros: z.number().int(),
        exige2fa: z.boolean(),
      }),
    ),
  })
  .meta({ id: 'ConfiguracaoDeSeguranca' })
export type Seguranca = z.infer<typeof segurancaSchema>

/** PATCH /v1/configuracoes/seguranca (`seguranca.gerir`): `{ perfis: { [perfilId]: exige2fa } }`. */
export const segurancaPatchSchema = z
  .object({
    perfis: z
      .record(z.uuid(), z.boolean())
      .refine((v) => Object.keys(v).length > 0, 'informe ao menos um perfil'),
  })
  .strict()
  .meta({ id: 'ConfiguracaoDeSegurancaEntrada' })
export type SegurancaPatch = z.infer<typeof segurancaPatchSchema>

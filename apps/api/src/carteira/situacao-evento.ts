import { novoId, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'

/** Tipo do evento do outbox que reconsulta a situação de uma empresa salva sem poder consultar a Receita. */
export const EVENTO_VERIFICAR_SITUACAO = 'empresa.verificar_situacao'

/** Quantas vezes reconsultar (de hora em hora: um dia) antes de desistir e avisar. */
export const MAX_TENTATIVAS_DA_SITUACAO = 24
export const ESPERA_ENTRE_TENTATIVAS_DA_SITUACAO_S = 3600

/**
 * Agenda a reconsulta, na mesma transação do dado. `esperaS` > 0 adia a primeira entrega do evento
 * (o relay só reserva eventos com `proxima_tentativa_em` vencida).
 */
export async function agendarVerificacaoDaSituacao(
  tx: Transacao,
  tenantId: string,
  empresaId: string,
  tentativa: number,
  esperaS: number,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload, proxima_tentativa_em)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_VERIFICAR_SITUACAO}, ${empresaId},
            ${JSON.stringify({ empresaId, tentativa })}::jsonb,
            ${esperaS > 0 ? sql`now() + ${`${esperaS} seconds`}::interval` : null})`)
}

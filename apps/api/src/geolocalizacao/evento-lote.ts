import { novoId, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'

/** Tipo do evento do outbox que manda o worker executar um lote de geocodificação. */
export const EVENTO_EXECUTAR_LOTE_GEO = 'geo.lote.executar'

/** Grava o evento na mesma transação que cria (ou retoma) o lote. */
export async function agendarExecucaoDoLote(
  tx: Transacao,
  tenantId: string,
  loteId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_EXECUTAR_LOTE_GEO}, ${loteId},
            ${JSON.stringify({ loteId })}::jsonb)`)
}

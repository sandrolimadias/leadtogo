import { novoId, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'

/** Tipo do evento do outbox que manda o worker executar um lote de importação. */
export const EVENTO_EXECUTAR_IMPORTACAO = 'importacao.executar'

/** Grava o evento na mesma transação que marca o lote como em andamento. */
export async function agendarExecucao(
  tx: Transacao,
  tenantId: string,
  importacaoId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_EXECUTAR_IMPORTACAO}, ${importacaoId},
            ${JSON.stringify({ importacaoId })}::jsonb)`)
}

import { novoId, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'

/** Tipo do evento do outbox que manda o worker varrer um anexo no ClamAV. */
export const EVENTO_VARRER_ANEXO = 'chamado.varrer_anexo'

/** Grava o evento na mesma transação que confirma o envio do arquivo. */
export async function agendarVarredura(
  tx: Transacao,
  tenantId: string,
  anexoId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_VARRER_ANEXO}, ${anexoId},
            ${JSON.stringify({ anexoId })}::jsonb)`)
}

/** Tipo do evento do outbox que manda o worker varrer o arquivo de um documento do portal. */
export const EVENTO_VARRER_DOCUMENTO = 'portal.varrer_documento'
export const EVENTO_VARRER_MIDIA = 'portal.varrer_midia'

/** Imagem de publicação enviada ao Garage (Fase 4D): o mesmo antivírus dos documentos. */
export async function agendarVarreduraDeMidia(
  tx: Transacao,
  tenantId: string,
  midiaId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_VARRER_MIDIA}, ${midiaId}, ${JSON.stringify({ midiaId })}::jsonb)`)
}

export async function agendarVarreduraDeDocumento(
  tx: Transacao,
  tenantId: string,
  documentoId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_VARRER_DOCUMENTO}, ${documentoId},
            ${JSON.stringify({ documentoId })}::jsonb)`)
}

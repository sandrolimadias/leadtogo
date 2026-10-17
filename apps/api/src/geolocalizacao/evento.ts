import { novoId, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'

/** Tipo do evento do outbox que manda geocodificar UMA empresa (nova ou com o endereço alterado). */
export const EVENTO_GEOCODIFICAR_EMPRESA = 'empresa.geocodificar'

/**
 * Agenda a geocodificação automática da empresa, na mesma transação do cadastro ou da alteração.
 * Quem entrega o evento é o relay; quem geocodifica é o worker, uma empresa por vez e com
 * concorrência baixa (`GEO_CONCORRENCIA`), nunca na requisição da tela.
 */
export async function agendarGeocodificacao(
  tx: Transacao,
  tenantId: string,
  empresaId: string,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${novoId()}, ${tenantId}, ${EVENTO_GEOCODIFICAR_EMPRESA}, ${empresaId},
            ${JSON.stringify({ empresaId })}::jsonb)`)
}

/**
 * O endereço mudou: a coordenada antiga deixa de valer (a empresa sai do mapa até ser geocodificada de
 * novo). O ajuste manual do usuário é PRESERVADO: só some quando ele confirma a troca. Devolve se
 * invalidou (se não, não há o que agendar).
 */
export async function invalidarCoordenada(tx: Transacao, empresaId: string): Promise<boolean> {
  const l = await tx.execute(sql`
    UPDATE empresas SET localizacao = NULL, geo_precisao = NULL, geo_aproximacao = NULL,
      geo_origem = NULL, geo_endereco_consultado = NULL, geo_atualizado_em = now()
    WHERE id = ${empresaId} AND NOT geo_ajuste_manual
    RETURNING id`)
  return l.length > 0
}

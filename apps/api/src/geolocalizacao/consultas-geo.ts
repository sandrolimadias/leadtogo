import { novoId, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import type { CacheDeConsulta } from './geocodificador.js'
import type { ConsultaFeita } from './tipos.js'

/**
 * Cache das consultas externas (Nominatim e CEP): a última resposta do tenant para o mesmo texto, se
 * ainda estiver dentro da validade. Consulta com erro de rede NUNCA vale como cache.
 */
export async function obterDoCache(
  tx: Transacao,
  provedor: 'nominatim' | 'cep',
  consulta: string,
  diasDeValidade: number,
): Promise<CacheDeConsulta | null> {
  if (diasDeValidade <= 0) return null
  const linhas = await tx.execute<{
    resultado: 'achou' | 'nao_achou'
    resposta: Record<string, unknown> | null
    latitude: number | null
    longitude: number | null
  }>(sql`
    SELECT resultado, resposta, ST_Y(localizacao::geometry) AS latitude, ST_X(localizacao::geometry) AS longitude
    FROM geo_consultas
    WHERE provedor = ${provedor} AND consulta = ${consulta} AND excluido_em IS NULL
      AND resultado IN ('achou', 'nao_achou')
      AND criado_em > now() - make_interval(days => ${diasDeValidade})
    ORDER BY criado_em DESC LIMIT 1`)
  return linhas[0] ?? null
}

export interface OrigemDoRegistro {
  tenantId: string
  empresaId: string | null
  loteId: string | null
  /** `membros.id`; nulo = o sistema (automático ou lote sem usuário) */
  acionadoPor: string | null
}

/** Grava as consultas feitas (as que vieram do cache não viram linha nova). Devolve quantas gravou. */
export async function registrarConsultas(
  tx: Transacao,
  origem: OrigemDoRegistro,
  consultas: ConsultaFeita[],
): Promise<number> {
  let gravadas = 0
  for (const c of consultas) {
    if (c.doCache) continue
    await tx.execute(sql`
      INSERT INTO geo_consultas
        (id, tenant_id, empresa_id, lote_id, provedor, consulta, resultado, precisao, aproximacao,
         localizacao, resposta, acionado_por, criado_por, atualizado_por)
      VALUES (${novoId()}, ${origem.tenantId}, ${origem.empresaId}, ${origem.loteId}, ${c.provedor},
        ${c.consulta}, ${c.resultado}, ${c.precisao}, ${c.aproximacao},
        ${
          c.latitude !== null && c.longitude !== null
            ? sql`ST_SetSRID(ST_MakePoint(${c.longitude}, ${c.latitude}), 4326)::geography`
            : sql`NULL`
        },
        ${c.resposta === null ? null : JSON.stringify(c.resposta)}::jsonb,
        ${origem.acionadoPor}, ${origem.acionadoPor}, ${origem.acionadoPor})`)
    gravadas += 1
  }
  return gravadas
}

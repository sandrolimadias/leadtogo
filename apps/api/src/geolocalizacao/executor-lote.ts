import { type Conexao, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import {
  type DesfechoDaEmpresa,
  geocodificarEmpresa,
  type ServicosDeGeo,
} from './geocodificar-empresa.js'

/** Empresas por bloco: curto, para o SIGTERM e o cancelamento terem efeito logo. */
export const EMPRESAS_POR_BLOCO = 20

export type DesfechoDoBloco = 'continua' | 'concluido' | 'cancelado' | 'interrompido' | 'nao_existe'

const resultadoDoLote = (d: DesfechoDaEmpresa): string => {
  switch (d) {
    case 'exata':
    case 'aproximada':
    case 'a_confirmar':
    case 'ja_tinha':
      return d
    case 'preservada':
    case 'ignorada':
      return 'ja_tinha'
    case 'indisponivel':
      return 'falhou'
  }
}

const motivoDoLote = (d: DesfechoDaEmpresa): string | null => {
  switch (d) {
    case 'preservada':
      return 'A posição foi ajustada à mão e não muda.'
    case 'ignorada':
      return 'A empresa foi excluída ou o endereço mudou durante o lote.'
    case 'indisponivel':
      return 'Os serviços de endereço estavam fora do ar; retome o lote para tentar de novo.'
    default:
      return null
  }
}

/**
 * Executa um bloco de um lote de geocodificação (mesmo desenho do lote de importação): pega as
 * próximas empresas pendentes, geocodifica uma a uma (concorrência e limite por minuto vêm da fila),
 * grava o resultado de cada uma e fecha o lote quando não sobra pendente. Idempotente por empresa: o
 * UPDATE do resultado só vale enquanto a linha está `pendente`, então repetir um bloco não duplica.
 */
export class ExecutorDoLoteGeo {
  constructor(
    private readonly svc: ServicosDeGeo,
    private readonly deveParar: () => boolean = () => false,
  ) {}

  private noTenant<T>(tenantId: string, fn: (tx: Transacao) => Promise<T>): Promise<T> {
    const banco: Conexao = this.svc.banco
    return banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx)
    })
  }

  async executarBloco(tenantId: string, loteId: string): Promise<DesfechoDoBloco> {
    const lote = await this.noTenant(tenantId, async (tx) => {
      const [l] = await tx.execute<{
        situacao: string
        refazer: boolean
        criado_por: string | null
      }>(sql`
        SELECT situacao, refazer_com_coordenada AS refazer, criado_por FROM geo_lotes
        WHERE id = ${loteId} AND excluido_em IS NULL`)
      return l ?? null
    })
    if (!lote) return 'nao_existe'
    if (lote.situacao === 'cancelado') return 'cancelado'
    if (lote.situacao !== 'em_andamento') return 'concluido'

    const pendentes = await this.noTenant(tenantId, (tx) =>
      tx.execute<{ id: string; empresa_id: string }>(sql`
        SELECT id, empresa_id FROM geo_lote_empresas
        WHERE lote_id = ${loteId} AND resultado = 'pendente'
        ORDER BY empresa_id LIMIT ${EMPRESAS_POR_BLOCO}`),
    )
    for (const p of pendentes) {
      // O cancelamento e o SIGTERM valem antes de CADA empresa
      if (this.deveParar()) return 'interrompido'
      const situacao = await this.noTenant(tenantId, async (tx) => {
        const [l] = await tx.execute<{ situacao: string }>(
          sql`SELECT situacao FROM geo_lotes WHERE id = ${loteId}`,
        )
        return l?.situacao
      })
      if (situacao !== 'em_andamento') return 'cancelado'

      const desfecho = await geocodificarEmpresa(this.svc, {
        tenantId,
        empresaId: p.empresa_id,
        acionadoPor: lote.criado_por,
        loteId,
        refazerComCoordenada: lote.refazer,
      })
      await this.noTenant(tenantId, async (tx) => {
        await tx.execute(sql`
          UPDATE geo_lote_empresas SET resultado = ${resultadoDoLote(desfecho)}::resultado_geo_empresa,
            motivo = ${motivoDoLote(desfecho)}, processada_em = now(), atualizado_em = now()
          WHERE id = ${p.id} AND resultado = 'pendente'`)
        await tx.execute(
          sql`UPDATE geo_lotes SET ultimo_progresso_em = now(), atualizado_em = now() WHERE id = ${loteId}`,
        )
      })
    }

    return this.noTenant(tenantId, async (tx) => {
      const [r] = await tx.execute<{ pendentes: number }>(sql`
        SELECT count(*)::int AS pendentes FROM geo_lote_empresas WHERE lote_id = ${loteId} AND resultado = 'pendente'`)
      if ((r?.pendentes ?? 0) > 0) return 'continua' as const
      await tx.execute(sql`
        UPDATE geo_lotes SET situacao = 'concluido', concluido_em = now(), atualizado_em = now(),
          totais = (SELECT coalesce(jsonb_object_agg(resultado, n), '{}'::jsonb)
                    FROM (SELECT resultado, count(*) AS n FROM geo_lote_empresas WHERE lote_id = ${loteId} GROUP BY resultado) t)
        WHERE id = ${loteId} AND situacao = 'em_andamento'`)
      return 'concluido' as const
    })
  }
}

import { schema, sql } from '@leadtogo/db'

import {
  type DepsDoExecutor,
  type DesfechoDaExecucao,
  type Lote,
  type ResultadoDoBloco,
  dormirAte,
  ExecutorBase,
  LIMITES_DO_BLOCO,
  type LimitesDoBloco,
} from './executor-base.js'
import { ExecutorDeAtividades } from './executor-atividades.js'
import { ExecutorDeContatos } from './executor-contatos.js'
import {
  ESPERAS_DA_RECEITA_MS,
  ExecutorDeEmpresas,
  LIMITE_DE_FALHAS_SEGUIDAS,
} from './executor-empresas.js'

const { importacoes } = schema

export { ESPERAS_DA_RECEITA_MS, LIMITE_DE_FALHAS_SEGUIDAS, LIMITES_DO_BLOCO }
export type { DepsDoExecutor, DesfechoDaExecucao, LimitesDoBloco, ResultadoDoBloco }

/**
 * Executa lotes de importação, um bloco por vez. O envelope (conferir o lote e quem importa, blocos
 * curtos, cancelamento, progresso, totais e encerramento) é de `ExecutorBase`; o que muda de um tipo de
 * lote para outro (empresas, contatos, atividades) fica no executor do tipo.
 */
export class ExecutorDaImportacao {
  private readonly esperar: (ms: number) => Promise<void>
  private readonly porTipo: Partial<Record<Lote['tipo'], ExecutorBase<never>>>

  constructor(private readonly deps: DepsDoExecutor) {
    this.esperar = deps.esperar ?? ((ms) => dormirAte(ms, deps.deveParar))
    this.porTipo = {
      empresas: new ExecutorDeEmpresas(deps) as ExecutorBase<never>,
      contatos: new ExecutorDeContatos(deps) as ExecutorBase<never>,
      atividades: new ExecutorDeAtividades(deps) as ExecutorBase<never>,
    }
  }

  /**
   * O lote inteiro, bloco após bloco, num só processo (sem fila). Os testes e a reexecução manual usam;
   * em produção quem encadeia os blocos é o worker, um job por bloco.
   */
  async executar(tenantId: string, importacaoId: string): Promise<DesfechoDaExecucao> {
    for (;;) {
      const r = await this.executarBloco(tenantId, importacaoId)
      if (r.desfecho !== 'continua') return r.desfecho
      if (r.proximoEmMs > 0) await this.esperar(r.proximoEmMs)
    }
  }

  /**
   * Um bloco: até `limites.linhas` linhas ou `limites.duracaoMs`, o que vier primeiro. Devolve
   * `continua` quando ainda há linhas pendentes. Tudo o que importa fica no banco (linhas, totais,
   * `proxima_consulta_em`, `ultimo_progresso_em`), então qualquer worker retoma de onde o outro parou.
   */
  async executarBloco(tenantId: string, importacaoId: string): Promise<ResultadoDoBloco> {
    const lote = await this.deps.banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      const [l] = await tx
        .select()
        .from(importacoes)
        .where(sql`${importacoes.id} = ${importacaoId}`)
      return l
    })
    if (!lote || lote.situacao !== 'em_andamento') return { desfecho: 'ignorada', proximoEmMs: 0 }
    const executor = this.porTipo[lote.tipo]
    if (!executor) return { desfecho: 'ignorada', proximoEmMs: 0 }
    return executor.executarBloco(tenantId, lote)
  }
}

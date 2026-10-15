import { and, eq, inArray, schema, sql } from '@leadtogo/db'
import type { AndamentoDaImportacao, LoteDeImportacao } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { agendarExecucao } from './evento.js'
import { LotesDeImportacaoService } from './lotes.service.js'

const { importacaoLinhas, importacoes } = schema

/** Iniciar, retomar, cancelar e acompanhar a execução de um lote (quem executa é o worker). */
@Injectable()
export class ExecucaoDaImportacaoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly lotes: LotesDeImportacaoService,
  ) {}

  /**
   * Vira `em_andamento` e agenda a execução (pelo outbox, na mesma transação). Vale para o lote
   * `pronta` e também para retomar um que `falhou` ou foi `cancelada`: a execução só faz as linhas
   * pendentes. Dois cliques juntos não duplicam: só um UPDATE acerta a situação.
   */
  async iniciar(id: string): Promise<LoteDeImportacao> {
    this.exigirQuemImporta()
    const db = this.ctx.db()
    const [lote] = await db
      .update(importacoes)
      .set({
        situacao: 'em_andamento',
        iniciadoEm: sql`coalesce(${importacoes.iniciadoEm}, now())`,
        concluidoEm: null,
        atualizadoPor: this.ctx.membro.id,
      })
      .where(
        and(
          eq(importacoes.id, id),
          inArray(importacoes.situacao, ['pronta', 'falhou', 'cancelada']),
        ),
      )
      .returning({ id: importacoes.id })
    if (!lote) await this.recusar(id)
    await agendarExecucao(db, this.ctx.tenantId, id)
    await this.auditoria.registrar({ entidade: 'importacao', entidadeId: id, acao: 'iniciar' })
    return this.lotes.detalhar(id)
  }

  /** Para a execução: o worker vê a mudança antes da próxima linha. Pode ser retomada. */
  async cancelar(id: string): Promise<LoteDeImportacao> {
    this.exigirQuemImporta()
    const [lote] = await this.ctx
      .db()
      .update(importacoes)
      .set({ situacao: 'cancelada', atualizadoPor: this.ctx.membro.id })
      .where(and(eq(importacoes.id, id), eq(importacoes.situacao, 'em_andamento')))
      .returning({ id: importacoes.id })
    if (!lote) {
      await this.lotes.detalhar(id) // 404 se não existe
      throw new ErroApi(
        'importacao_nao_cancelavel',
        'Só dá para cancelar uma importação em andamento.',
        409,
      )
    }
    await this.auditoria.registrar({ entidade: 'importacao', entidadeId: id, acao: 'cancelar' })
    return this.lotes.detalhar(id)
  }

  /** Quantas linhas já têm resultado e quantas há em cada um (para a barra de progresso e o relatório). */
  async andamento(id: string): Promise<AndamentoDaImportacao> {
    this.exigirQuemImporta()
    const db = this.ctx.db()
    const [lote] = await db.select().from(importacoes).where(eq(importacoes.id, id))
    if (!lote || lote.excluidoEm) {
      throw new ErroApi('importacao_nao_encontrada', 'Importação não encontrada.', 404)
    }
    const contagens = await db
      .select({ resultado: importacaoLinhas.resultado, n: sql<number>`count(*)::int` })
      .from(importacaoLinhas)
      .where(eq(importacaoLinhas.importacaoId, id))
      .groupBy(importacaoLinhas.resultado)
    const porResultado = Object.fromEntries(contagens.map((c) => [c.resultado, c.n]))
    const pendentes = porResultado['pendente'] ?? 0
    return {
      situacao: lote.situacao,
      totalLinhas: lote.totalLinhas,
      processadas: lote.totalLinhas - pendentes,
      porResultado,
      estimativaRestanteSegundos: Math.ceil((pendentes * lote.intervaloMs) / 1000),
      iniciadoEm: lote.iniciadoEm?.toISOString() ?? null,
      concluidoEm: lote.concluidoEm?.toISOString() ?? null,
    }
  }

  private exigirQuemImporta(): void {
    if (this.ctx.membro.papel !== 'admin' && this.ctx.membro.papel !== 'gestor') {
      throw new ErroApi('acesso_negado', 'Só administradores e gestores importam planilhas.', 403)
    }
  }

  /** Por que o lote não pôde iniciar. */
  private async recusar(id: string): Promise<never> {
    const lote = await this.lotes.detalhar(id) // 404 se não existe
    if (lote.situacao === 'em_andamento') {
      throw new ErroApi('importacao_em_andamento', 'Esta importação já está em andamento.', 409)
    }
    if (lote.situacao === 'rascunho') {
      throw new ErroApi(
        'importacao_incompleta',
        lote.pendencias[0] ?? 'Falta preencher as escolhas da importação.',
        409,
        lote.pendencias.map((mensagem) => ({ campo: 'importacao', mensagem })),
      )
    }
    throw new ErroApi('importacao_encerrada', 'Esta importação já foi encerrada.', 409)
  }
}

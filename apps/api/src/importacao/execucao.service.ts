import { and, eq, inArray, isNull, schema, sql } from '@leadtogo/db'
import {
  type AndamentoDaImportacao,
  DIAS_PARA_DESFAZER,
  type LoteDeImportacao,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { agendarExecucao } from './evento.js'
import { LotesDeImportacaoService } from './lotes.service.js'

const { empresaContatos, empresas, importacaoLinhas, importacoes } = schema

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
        // começa (ou recomeça) sem espera antiga e com o relógio do "parado" zerado
        proximaConsultaEm: null,
        ultimoProgressoEm: sql`now()`,
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

  /**
   * Desfaz o lote (`concluida` ou `cancelada`, até `DIAS_PARA_DESFAZER` dias depois de terminar): as
   * empresas que ELE criou e que ninguém mexeu depois saem da carteira (exclusão lógica, como a manual:
   * vínculos de contato inativos e filiais soltas da matriz). Ficam, e são contadas em `desfeito.mantidas`,
   * as que alguém alterou depois (qualquer registro de auditoria além do `criar`: editar, tags, Receita)
   * ou que têm contato vinculado; a que já estava na carteira antes nunca é tocada. As linhas e o relatório
   * ficam. Dois cliques juntos não duplicam: só um UPDATE acerta a situação.
   */
  async desfazer(id: string): Promise<LoteDeImportacao> {
    this.exigirQuemImporta()
    const db = this.ctx.db()
    const lote = await this.lotes.detalhar(id) // 404 se não existe
    if ((lote.situacao !== 'concluida' && lote.situacao !== 'cancelada') || !lote.desfazerAte) {
      throw new ErroApi(
        'importacao_nao_desfazivel',
        'Só dá para desfazer uma importação concluída ou cancelada.',
        409,
      )
    }
    if (new Date(lote.desfazerAte).getTime() < Date.now()) {
      throw new ErroApi(
        'prazo_de_desfazer_vencido',
        `O prazo de ${DIAS_PARA_DESFAZER} dias para desfazer esta importação já passou. Exclua as empresas pela carteira.`,
        409,
      )
    }
    const [mudou] = await db
      .update(importacoes)
      .set({ situacao: 'desfeita', desfeitaEm: sql`now()`, atualizadoPor: this.ctx.membro.id })
      .where(and(eq(importacoes.id, id), inArray(importacoes.situacao, ['concluida', 'cancelada'])))
      .returning({ id: importacoes.id })
    if (!mudou) {
      throw new ErroApi(
        'importacao_nao_desfazivel',
        'Só dá para desfazer uma importação concluída ou cancelada.',
        409,
      )
    }
    const removidas = await db
      .update(empresas)
      .set({ excluidoEm: new Date(), atualizadoPor: this.ctx.membro.id })
      .where(
        and(
          eq(empresas.importacaoId, id),
          isNull(empresas.excluidoEm),
          // ninguém mexeu depois: nenhum registro de auditoria além da criação...
          sql`NOT EXISTS (SELECT 1 FROM auditoria a WHERE a.entidade = 'empresa'
                AND a.entidade_id = ${empresas.id} AND a.acao <> 'criar')`,
          // ...e nenhum contato vinculado
          sql`NOT EXISTS (SELECT 1 FROM empresa_contatos ec
                WHERE ec.empresa_id = ${empresas.id} AND ec.ativo)`,
        ),
      )
      .returning({ id: empresas.id })
    const [{ mantidas } = { mantidas: 0 }] = await db
      .select({ mantidas: sql<number>`count(*)::int` })
      .from(empresas)
      .where(and(eq(empresas.importacaoId, id), isNull(empresas.excluidoEm)))
    const saidas = sql`(SELECT id FROM empresas WHERE importacao_id = ${id} AND excluido_em IS NOT NULL)`
    await db
      .update(empresaContatos)
      .set({ ativo: false, principal: false })
      .where(inArray(empresaContatos.empresaId, saidas))
    await db.update(empresas).set({ matrizId: null }).where(inArray(empresas.matrizId, saidas))
    await db
      .update(importacoes)
      .set({
        totais: sql`${importacoes.totais} || ${JSON.stringify({ desfeitas: removidas.length, mantidas })}::jsonb`,
      })
      .where(eq(importacoes.id, id))
    await this.auditoria.registrar({
      entidade: 'importacao',
      entidadeId: id,
      acao: 'desfazer',
      alteracoes: { empresasRemovidas: removidas.length, empresasMantidas: mantidas },
    })
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

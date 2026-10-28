import { and, eq, inArray, isNull, schema } from '@leadtogo/db'
import { inicioDoDiaNoFuso, MESES_PADRAO, type StatusDeFechamento } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { recalcularCarteira } from './atividades-efeitos.js'
import { empresaViraCliente, recalcularOportunidade } from './oportunidades-efeitos.js'

const { atividades, oportunidadeHistorico, oportunidades, tiposAtividade } = schema

export type LinhaDeOportunidade = typeof oportunidades.$inferSelect

// Gravação de oportunidade compartilhada pelo cadastro manual (OportunidadesService) e pela importação por
// planilha: as duas chegam ao mesmo resultado (colunas, histórico, retomada, empresa vira Cliente). Quem
// chama já validou empresa, funil, fase, cadastros e responsável.

export interface NovaOportunidade {
  titulo: string
  empresaId: string
  contatoId: string | null
  solucaoId: string | null
  origemId: string | null
  funilId: string
  fase: { id: string; probabilidadePadrao: number }
  responsavelId: string
  valorUnico: number
  valorMensal: number
  /** Sem meses e com valor mensal, valem 12 */
  meses?: number | undefined
  /** Sem probabilidade, vale a da fase; diferente da fase, fica marcada como editada à mão */
  probabilidade?: number | undefined
  dataPrevistaFechamento: string | null
  observacoes: string | null
}

/** Insere a oportunidade (Ativa) e o histórico `criada`; devolve o id. */
export async function inserirOportunidade(
  db: Transacao,
  tenantId: string,
  membroId: string,
  d: NovaOportunidade,
): Promise<string> {
  const meses = d.meses ?? (d.valorMensal > 0 ? MESES_PADRAO : 0)
  const manual = d.probabilidade !== undefined && d.probabilidade !== d.fase.probabilidadePadrao
  const [criada] = await db
    .insert(oportunidades)
    .values({
      tenantId,
      titulo: d.titulo,
      empresaId: d.empresaId,
      contatoId: d.contatoId,
      solucaoId: d.solucaoId,
      origemId: d.origemId,
      funilId: d.funilId,
      faseId: d.fase.id,
      responsavelId: d.responsavelId,
      valorUnico: d.valorUnico.toFixed(2),
      valorMensal: d.valorMensal.toFixed(2),
      meses,
      probabilidade: manual ? (d.probabilidade ?? 0) : d.fase.probabilidadePadrao,
      probabilidadeManual: manual,
      dataPrevistaFechamento: d.dataPrevistaFechamento,
      observacoes: d.observacoes,
      criadoPor: membroId,
      atualizadoPor: membroId,
    })
    .returning({ id: oportunidades.id })
  if (!criada) throw new Error('INSERT de oportunidade sem retorno')
  await db.insert(oportunidadeHistorico).values({
    tenantId,
    oportunidadeId: criada.id,
    acao: 'criada',
    faseParaId: d.fase.id,
    statusPara: 'ativo',
    por: membroId,
  })
  return criada.id
}

export interface Fechamento {
  status: StatusDeFechamento
  /** Já conferido (existe, ativo e vale para o status); ignorado em Conquistado */
  motivoId: string | null
  detalhe: string | null
  /** Suspenso: o dia (AAAA-MM-DD) da atividade de retomada */
  retomarEm: string | null
  /** Conquistado: troca o Status da empresa para Cliente */
  viraCliente: boolean
}

/**
 * Fecha uma oportunidade Ativa: status, fase em que parou, motivo, data de fechamento e histórico;
 * Conquistado pode mudar a empresa para Cliente; Suspenso cria a atividade de retomada e recalcula a
 * carteira da empresa. Devolve o nome da tag de Cliente quando a empresa mudou.
 */
export async function registrarFechamento(
  db: Transacao,
  tenantId: string,
  membroId: string,
  o: LinhaDeOportunidade,
  f: Fechamento,
  fuso: string,
): Promise<{ virouCliente: string | null }> {
  const motivoId = f.status === 'conquistado' ? null : f.motivoId
  await db
    .update(oportunidades)
    .set({
      status: f.status,
      faseParouEmId: o.faseId,
      motivoId,
      motivoDetalhe: f.detalhe,
      suspensaAte: f.status === 'suspenso' ? f.retomarEm : null,
      dataFechamento: new Date(),
      atualizadoPor: membroId,
    })
    .where(eq(oportunidades.id, o.id))
  await db.insert(oportunidadeHistorico).values({
    tenantId,
    oportunidadeId: o.id,
    acao: 'status',
    faseDeId: o.faseId,
    statusDe: 'ativo',
    statusPara: f.status,
    motivoId,
    detalhe: f.detalhe,
    por: membroId,
  })

  let virouCliente: string | null = null
  if (f.status === 'conquistado' && f.viraCliente) {
    const r = await empresaViraCliente(db, tenantId, o.empresaId, membroId)
    if (r.mudou) virouCliente = r.nomeDaTag
  }
  if (f.status === 'suspenso' && f.retomarEm) {
    await criarRetomada(db, tenantId, o, f.retomarEm, fuso, membroId)
    await recalcularCarteira(db, tenantId, o.empresaId, membroId)
    await recalcularOportunidade(db, tenantId, o.id)
  }
  return { virouCliente }
}

/** Suspensa: cria a atividade de retomada (Tarefa de dia inteiro na data), com a mesma empresa e o mesmo responsável. */
export async function criarRetomada(
  db: Transacao,
  tenantId: string,
  o: LinhaDeOportunidade,
  retomarEm: string,
  fuso: string,
  membroId: string,
): Promise<void> {
  const [tipo] = await db
    .select({ id: tiposAtividade.id })
    .from(tiposAtividade)
    .where(and(eq(tiposAtividade.chaveSistema, 'tarefa'), isNull(tiposAtividade.excluidoEm)))
  if (!tipo) {
    throw new ErroApi('tipo_tarefa_ausente', 'O tipo de atividade Tarefa não existe.', 409)
  }
  const [criada] = await db
    .insert(atividades)
    .values({
      tenantId,
      tipoAtividadeId: tipo.id,
      titulo: `Retomar: ${o.titulo}`,
      empresaId: o.empresaId,
      contatoId: o.contatoId,
      oportunidadeId: o.id,
      responsavelId: o.responsavelId,
      dataInicio: inicioDoDiaNoFuso(retomarEm, fuso),
      diaInteiro: true,
      situacao: 'pendente',
      origem: 'manual',
      criadoPor: membroId,
      atualizadoPor: membroId,
    })
    .returning({ id: atividades.id })
  await db
    .update(oportunidades)
    .set({ atividadeRetomadaId: criada?.id ?? null })
    .where(eq(oportunidades.id, o.id))
}

/** Cancela a atividade de retomada que ainda está aberta (a oportunidade voltou a Ativa ou saiu). */
export async function cancelarRetomada(db: Transacao, o: LinhaDeOportunidade): Promise<void> {
  if (!o.atividadeRetomadaId) return
  await db
    .update(atividades)
    .set({ situacao: 'cancelada', realizadaEm: null })
    .where(
      and(
        eq(atividades.id, o.atividadeRetomadaId),
        inArray(atividades.situacao, ['pendente', 'em_execucao']),
      ),
    )
  await db
    .update(oportunidades)
    .set({ atividadeRetomadaId: null })
    .where(eq(oportunidades.id, o.id))
}

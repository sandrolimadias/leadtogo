import { and, eq, isNull, schema, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { gravarDiferencaDeTags, tagsAtuaisDaEmpresa } from './empresa-tags.js'

const { oportunidades, tagGrupos, tags } = schema

/**
 * Recalcula na oportunidade a última atividade realizada e a próxima atividade aberta (o alerta de
 * parada e o card do Kanban leem daqui). Chamado por quem cria, edita, conclui, cancela ou exclui uma
 * atividade ligada à oportunidade. Não mexe em `atualizado_em`: são campos calculados.
 */
export async function recalcularOportunidade(
  db: Transacao,
  tenantId: string,
  oportunidadeId: string,
): Promise<void> {
  const resumo = (await db.execute(sql`
    SELECT
      max(a.realizada_em) FILTER (WHERE a.situacao = 'realizada') AS ultima
    FROM atividades a
    WHERE a.oportunidade_id = ${oportunidadeId} AND a.excluido_em IS NULL`)) as unknown as Record<
    string,
    unknown
  >[]
  const proxima = (await db.execute(sql`
    SELECT a.id, a.data_inicio
    FROM atividades a
    WHERE a.oportunidade_id = ${oportunidadeId} AND a.excluido_em IS NULL
      AND a.situacao IN ('pendente', 'em_execucao')
    ORDER BY a.data_inicio ASC, a.id ASC
    LIMIT 1`)) as unknown as Record<string, unknown>[]
  const ultima = resumo[0]?.['ultima']
  const p = proxima[0]
  const iso = (v: unknown) =>
    v === null || v === undefined ? null : new Date(v as string).toISOString()
  await db.execute(sql`
    UPDATE oportunidades SET
      ultima_atividade_em = ${iso(ultima)}::timestamptz,
      proxima_atividade_id = ${p ? (p['id'] as string) : null}::uuid,
      proxima_atividade_em = ${p ? iso(p['data_inicio']) : null}::timestamptz
    WHERE id = ${oportunidadeId} AND tenant_id = ${tenantId}`)
}

/**
 * Ao conquistar: a empresa vira Cliente. A tag é achada pelo identificador interno (`chave_sistema =
 * 'cliente'`), nunca pelo nome (cada empresa pode renomeá-la, ex.: "Associado"). Troca a tag do grupo
 * Status (seleção única) pela de Cliente, com histórico. Devolve se mudou algo.
 */
export async function empresaViraCliente(
  db: Transacao,
  tenantId: string,
  empresaId: string,
  membroId: string,
): Promise<{ mudou: boolean; nomeDaTag: string | null }> {
  const [cliente] = await db
    .select({ id: tags.id, nome: tags.nome, grupoId: tags.tagGrupoId })
    .from(tags)
    .where(and(isNull(tags.excluidoEm), eq(tags.chaveSistema, 'cliente')))
  if (!cliente) return { mudou: false, nomeDaTag: null }
  const doGrupo = await db
    .select({ id: tags.id })
    .from(tags)
    .innerJoin(tagGrupos, eq(tagGrupos.id, tags.tagGrupoId))
    .where(and(eq(tags.tagGrupoId, cliente.grupoId), isNull(tags.excluidoEm)))
  const atuais = await tagsAtuaisDaEmpresa(db, empresaId)
  const finais = new Set([...atuais].filter((id) => !doGrupo.some((t) => t.id === id)))
  finais.add(cliente.id)
  const { adicionadas, removidas } = await gravarDiferencaDeTags(
    db,
    tenantId,
    empresaId,
    atuais,
    finais,
    membroId,
  )
  return { mudou: adicionadas.length + removidas.length > 0, nomeDaTag: cliente.nome }
}

/** A oportunidade ainda existe e não foi excluída (para quem só precisa do id). */
export async function existeOportunidade(db: Transacao, id: string): Promise<boolean> {
  const [o] = await db
    .select({ id: oportunidades.id })
    .from(oportunidades)
    .where(and(eq(oportunidades.id, id), isNull(oportunidades.excluidoEm)))
  return o !== undefined
}

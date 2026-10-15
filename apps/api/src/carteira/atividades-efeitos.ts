import { and, isNull, schema, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { gravarDiferencaDeTags, tagsAtuaisDaEmpresa } from './empresa-tags.js'

const { tags } = schema

/** O que as atividades realizadas e abertas dizem sobre a empresa. */
export interface ResumoDasAtividades {
  /** Última atividade realizada de tipo que conta como Visita */
  ultimaVisitaEm: Date | null
  /** Última realizada de tipo que conta como Contato OU Visita (a visita também é um contato) */
  ultimoContatoEm: Date | null
  /** Existe realizada de tipo Visita: a tag Visitada fica */
  temVisita: boolean
  /** Existe realizada de tipo Contato (só Contato, não Visita): a tag Contactada fica */
  temContato: boolean
  proximaId: string | null
  proximaEm: Date | null
}

/**
 * Lê as atividades da empresa (não excluídas) e calcula o resumo. É a única fonte desses campos: criar,
 * editar, concluir, cancelar e excluir uma atividade só chamam `recalcularCarteira`, e o resultado é
 * sempre o que as atividades que restam dizem (por isso editar ou apagar a última visita volta a data
 * anterior, e a tag só sai quando não resta nenhuma realizada daquele tipo).
 */
export async function resumoDasAtividades(
  db: Transacao,
  empresaId: string,
): Promise<ResumoDasAtividades> {
  const resultado = await db.execute(sql`
    SELECT
      max(a.realizada_em) FILTER (WHERE a.situacao = 'realizada' AND t.conta_como = 'visita') AS ultima_visita,
      max(a.realizada_em) FILTER (WHERE a.situacao = 'realizada' AND t.conta_como IN ('visita', 'contato')) AS ultimo_contato,
      coalesce(bool_or(a.situacao = 'realizada' AND t.conta_como = 'visita'), false) AS tem_visita,
      coalesce(bool_or(a.situacao = 'realizada' AND t.conta_como = 'contato'), false) AS tem_contato
    FROM atividades a
    JOIN tipos_atividade t ON t.id = a.tipo_atividade_id
    WHERE a.empresa_id = ${empresaId} AND a.excluido_em IS NULL`)
  const linha = (resultado as unknown as Record<string, unknown>[])[0] ?? {}
  const proxima = await db.execute(sql`
    SELECT a.id, a.data_inicio
    FROM atividades a
    WHERE a.empresa_id = ${empresaId} AND a.excluido_em IS NULL
      AND a.situacao IN ('pendente', 'em_execucao')
    ORDER BY a.data_inicio ASC, a.id ASC
    LIMIT 1`)
  const p = (proxima as unknown as Record<string, unknown>[])[0]
  const data = (v: unknown): Date | null =>
    v === null || v === undefined ? null : new Date(v as string)
  return {
    ultimaVisitaEm: data(linha['ultima_visita']),
    ultimoContatoEm: data(linha['ultimo_contato']),
    temVisita: linha['tem_visita'] === true,
    temContato: linha['tem_contato'] === true,
    proximaId: p ? (p['id'] as string) : null,
    proximaEm: p ? data(p['data_inicio']) : null,
  }
}

/** Ids das tags automáticas Visitada e Contactada da empresa (null se o cadastro não as tem). */
async function tagsDeVisitacao(
  db: Transacao,
): Promise<{ visitada: string | null; contactada: string | null }> {
  const linhas = await db
    .select({ id: tags.id, chave: tags.chaveSistema })
    .from(tags)
    .where(and(isNull(tags.excluidoEm), sql`${tags.chaveSistema} IN ('visitada', 'contactada')`))
  return {
    visitada: linhas.find((l) => l.chave === 'visitada')?.id ?? null,
    contactada: linhas.find((l) => l.chave === 'contactada')?.id ?? null,
  }
}

/**
 * Recalcula na empresa a última visita, o último contato, a próxima atividade e as tags Visitada e
 * Contactada a partir das atividades que existem agora. Não mexe em `atualizado_em` da empresa (são
 * campos calculados, não uma edição) e escreve no histórico de tags quando uma tag entra ou sai.
 */
export async function recalcularCarteira(
  db: Transacao,
  tenantId: string,
  empresaId: string,
  membroId: string,
): Promise<ResumoDasAtividades> {
  const resumo = await resumoDasAtividades(db, empresaId)
  // Data em SQL cru vai como texto ISO com o tipo explícito (o driver não serializa Date sem tipo)
  const iso = (d: Date | null) => (d === null ? null : d.toISOString())
  await db.execute(sql`
    UPDATE empresas SET
      ultima_visita_em = ${iso(resumo.ultimaVisitaEm)}::timestamptz,
      ultimo_contato_em = ${iso(resumo.ultimoContatoEm)}::timestamptz,
      proxima_atividade_id = ${resumo.proximaId}::uuid,
      proxima_atividade_em = ${iso(resumo.proximaEm)}::timestamptz
    WHERE id = ${empresaId} AND tenant_id = ${tenantId}`)

  const ids = await tagsDeVisitacao(db)
  const atuais = await tagsAtuaisDaEmpresa(db, empresaId)
  const finais = new Set(atuais)
  const ajustar = (tagId: string | null, deve: boolean) => {
    if (tagId === null) return
    if (deve) finais.add(tagId)
    else finais.delete(tagId)
  }
  ajustar(ids.visitada, resumo.temVisita)
  ajustar(ids.contactada, resumo.temContato)
  await gravarDiferencaDeTags(db, tenantId, empresaId, atuais, finais, membroId)
  return resumo
}

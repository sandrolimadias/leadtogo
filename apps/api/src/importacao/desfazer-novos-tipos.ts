import { sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { recalcularCarteira } from '../carteira/atividades-efeitos.js'
import { arraySql } from './sql-array.js'

export interface ResultadoDoDesfazer {
  removidas: number
  mantidas: number
}

/**
 * Desfaz um lote de CONTATOS (`limite` = quando o lote terminou; o que mudou depois dele "foi alterado"):
 *  - os contatos que o lote CRIOU saem (exclusão lógica) se ninguém os alterou (nenhum registro de auditoria,
 *    nenhuma mudança depois do lote), nenhuma atividade ou oportunidade usa o contato e ele não tem vínculo
 *    ativo de outro lote ou cadastro manual; os vínculos deles ficam inativos;
 *  - os vínculos que o lote criou com contatos que JÁ EXISTIAM são inativados (o contato fica), se ninguém
 *    os mexeu depois e nenhuma atividade os usa.
 * Ficam, e contam em `mantidas`, o contato ou o vínculo que alguém alterou ou usou depois.
 */
export async function desfazerContatos(
  db: Transacao,
  loteId: string,
  membroId: string,
  limite: Date,
): Promise<ResultadoDoDesfazer> {
  const ate = limite.toISOString()
  const contatosRemovidos = await db.execute<{ id: string }>(sql`
    UPDATE contatos c SET excluido_em = now(), atualizado_por = ${membroId}
    WHERE c.importacao_id = ${loteId} AND c.excluido_em IS NULL
      AND c.atualizado_em <= ${ate}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM auditoria a WHERE a.entidade = 'contato'
            AND a.entidade_id = c.id AND a.acao <> 'criar')
      AND NOT EXISTS (SELECT 1 FROM atividades at WHERE at.contato_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM oportunidades o WHERE o.contato_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM empresa_contatos ec WHERE ec.contato_id = c.id AND ec.ativo
            AND ec.importacao_id IS DISTINCT FROM ${loteId}::uuid)
    RETURNING c.id`)
  const ids = contatosRemovidos.map((c) => c.id)
  const vinculosInativados = await db.execute<{ id: string }>(sql`
    UPDATE empresa_contatos ec SET ativo = false, principal = false
    WHERE ec.importacao_id = ${loteId} AND ec.ativo
      AND (
        ec.contato_id = ANY(${arraySql(ids, 'uuid')})
        OR (
          -- vínculo com contato que já existia (o que o lote criou e ficou mantém os vínculos)
          NOT EXISTS (SELECT 1 FROM contatos c WHERE c.id = ec.contato_id AND c.importacao_id = ${loteId}::uuid)
          AND ec.atualizado_em <= ${ate}::timestamptz
          AND NOT EXISTS (SELECT 1 FROM atividades at
                WHERE at.contato_id = ec.contato_id AND at.empresa_id = ec.empresa_id)
        )
      )
    RETURNING ec.id`)
  const [{ n: contatosQueFicaram } = { n: 0 }] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM contatos WHERE importacao_id = ${loteId} AND excluido_em IS NULL`)
  const [{ n: vinculosQueFicaram } = { n: 0 }] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM empresa_contatos WHERE importacao_id = ${loteId} AND ativo`)
  return {
    removidas: ids.length + vinculosInativados.length,
    mantidas: contatosQueFicaram + vinculosQueFicaram,
  }
}

/**
 * Desfaz um lote de ATIVIDADES: as que o lote criou e ninguém alterou depois (sem registro de auditoria,
 * sem mudança depois do fim do lote) saem por exclusão lógica, como a manual; a atividade que alguém
 * concluiu, editou ou cancelou depois fica (conta em `mantidas`). Depois recalcula a última visita, o
 * último contato, a próxima atividade e as tags de cada empresa afetada, uma vez cada.
 */
export async function desfazerAtividades(
  db: Transacao,
  tenantId: string,
  loteId: string,
  membroId: string,
  limite: Date,
): Promise<ResultadoDoDesfazer> {
  const ate = limite.toISOString()
  const removidas = await db.execute<{ empresa_id: string | null }>(sql`
    UPDATE atividades a SET excluido_em = now(), atualizado_por = ${membroId}
    WHERE a.importacao_id = ${loteId} AND a.excluido_em IS NULL
      AND a.atualizado_em <= ${ate}::timestamptz
      AND NOT EXISTS (SELECT 1 FROM auditoria x WHERE x.entidade = 'atividade'
            AND x.entidade_id = a.id AND x.acao <> 'criar')
    RETURNING a.empresa_id`)
  const empresas = [...new Set(removidas.flatMap((r) => (r.empresa_id ? [r.empresa_id] : [])))]
  for (const empresaId of empresas) await recalcularCarteira(db, tenantId, empresaId, membroId)
  const [{ n } = { n: 0 }] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM atividades WHERE importacao_id = ${loteId} AND excluido_em IS NULL`)
  return { removidas: removidas.length, mantidas: n }
}

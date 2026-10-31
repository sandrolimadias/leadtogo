import { and, asc, eq, inArray, isNull, schema } from '@leadtogo/db'
import type { TagDaOportunidade } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'

// Tags da oportunidade: só as de grupos com `aplica_a = 'oportunidade'` (o gatilho do banco também garante).
// Sem tabela de histórico: a auditoria da oportunidade (`alterar_tags`) guarda o que entrou e o que saiu.
// A conferência (existe, ativa, seleção única) é a mesma das tags de contato: `conferirTagsDoDestino`.

const { oportunidadeTags, tagGrupos, tags } = schema

/** As tags de cada oportunidade, na ordem dos grupos e, dentro do grupo, das tags. */
export async function tagsDasOportunidades(
  db: Transacao,
  oportunidadeIds: readonly string[],
): Promise<Map<string, TagDaOportunidade[]>> {
  const porOportunidade = new Map<string, TagDaOportunidade[]>()
  if (oportunidadeIds.length === 0) return porOportunidade
  const linhas = await db
    .select({
      oportunidadeId: oportunidadeTags.oportunidadeId,
      id: tags.id,
      nome: tags.nome,
      cor: tags.cor,
      tagGrupoId: tags.tagGrupoId,
    })
    .from(oportunidadeTags)
    .innerJoin(tags, eq(tags.id, oportunidadeTags.tagId))
    .innerJoin(tagGrupos, eq(tagGrupos.id, tags.tagGrupoId))
    .where(
      and(
        inArray(oportunidadeTags.oportunidadeId, [...oportunidadeIds]),
        isNull(tags.excluidoEm),
        isNull(tagGrupos.excluidoEm),
      ),
    )
    .orderBy(asc(tagGrupos.ordem), asc(tagGrupos.nome), asc(tags.ordem), asc(tags.nome))
  for (const { oportunidadeId, ...tag } of linhas) {
    porOportunidade.set(oportunidadeId, [...(porOportunidade.get(oportunidadeId) ?? []), tag])
  }
  return porOportunidade
}

export async function tagsAtuaisDaOportunidade(
  db: Transacao,
  oportunidadeId: string,
): Promise<Set<string>> {
  const linhas = await db
    .select({ tagId: oportunidadeTags.tagId })
    .from(oportunidadeTags)
    .where(eq(oportunidadeTags.oportunidadeId, oportunidadeId))
  return new Set(linhas.map((l) => l.tagId))
}

/** Grava a diferença entre as tags atuais e as finais; devolve os ids que entraram e os que saíram. */
export async function gravarDiferencaDeTagsDaOportunidade(
  db: Transacao,
  tenantId: string,
  oportunidadeId: string,
  atuais: ReadonlySet<string>,
  finais: ReadonlySet<string>,
  membroId: string,
): Promise<{ adicionadas: string[]; removidas: string[] }> {
  const adicionadas = [...finais].filter((id) => !atuais.has(id))
  const removidas = [...atuais].filter((id) => !finais.has(id))
  if (removidas.length > 0) {
    await db
      .delete(oportunidadeTags)
      .where(
        and(
          eq(oportunidadeTags.oportunidadeId, oportunidadeId),
          inArray(oportunidadeTags.tagId, removidas),
        ),
      )
  }
  if (adicionadas.length > 0) {
    await db
      .insert(oportunidadeTags)
      .values(
        adicionadas.map((tagId) => ({ tenantId, oportunidadeId, tagId, aplicadaPor: membroId })),
      )
  }
  return { adicionadas, removidas }
}

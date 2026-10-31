import { and, asc, eq, inArray, isNull, schema } from '@leadtogo/db'
import type { AlvoDeTag, TagDoContato } from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'

// Tags do contato: só as de grupos com `aplica_a = 'contato'` (o gatilho do banco também garante).
// Sem tabela de histórico: a auditoria do contato (`alterar_tags`) guarda o que entrou e o que saiu.

const { contatoTags, tagGrupos, tags } = schema

const invalido = (codigo: string, mensagem: string) =>
  new ErroApi(codigo, mensagem, 400, [{ campo: 'tagIds', mensagem }])

/** As tags de cada contato, na ordem dos grupos e, dentro do grupo, das tags. */
export async function tagsDosContatos(
  db: Transacao,
  contatoIds: readonly string[],
): Promise<Map<string, TagDoContato[]>> {
  const porContato = new Map<string, TagDoContato[]>()
  if (contatoIds.length === 0) return porContato
  const linhas = await db
    .select({
      contatoId: contatoTags.contatoId,
      id: tags.id,
      nome: tags.nome,
      cor: tags.cor,
      tagGrupoId: tags.tagGrupoId,
    })
    .from(contatoTags)
    .innerJoin(tags, eq(tags.id, contatoTags.tagId))
    .innerJoin(tagGrupos, eq(tagGrupos.id, tags.tagGrupoId))
    .where(
      and(
        inArray(contatoTags.contatoId, [...contatoIds]),
        isNull(tags.excluidoEm),
        isNull(tagGrupos.excluidoEm),
      ),
    )
    .orderBy(asc(tagGrupos.ordem), asc(tagGrupos.nome), asc(tags.ordem), asc(tags.nome))
  for (const { contatoId, ...tag } of linhas) {
    porContato.set(contatoId, [...(porContato.get(contatoId) ?? []), tag])
  }
  return porContato
}

export async function tagsAtuaisDoContato(db: Transacao, contatoId: string): Promise<Set<string>> {
  const linhas = await db
    .select({ tagId: contatoTags.tagId })
    .from(contatoTags)
    .where(eq(contatoTags.contatoId, contatoId))
  return new Set(linhas.map((l) => l.tagId))
}

const NOME_DO_DESTINO: Record<Exclude<AlvoDeTag, 'empresa'>, string> = {
  contato: 'contato',
  oportunidade: 'oportunidade',
}

/**
 * As tags finais do contato a partir do que o usuário pediu, já conferidas: toda tag existe e é de um
 * grupo de tags de contato; tag ou grupo inativo só continua se já estava; grupo de seleção única tem no
 * máximo uma.
 */
export const conferirTagsDoContato = (
  db: Transacao,
  atuais: ReadonlySet<string>,
  pedidas: readonly string[],
): Promise<Set<string>> => conferirTagsDoDestino(db, 'contato', atuais, pedidas)

/** A mesma conferência para as tags de qualquer destino que não seja empresa (contato e oportunidade). */
export async function conferirTagsDoDestino(
  db: Transacao,
  destino: Exclude<AlvoDeTag, 'empresa'>,
  atuais: ReadonlySet<string>,
  pedidas: readonly string[],
): Promise<Set<string>> {
  const finais = new Set(pedidas)
  if (finais.size === 0) return finais
  const catalogo = await db
    .select({
      id: tags.id,
      nome: tags.nome,
      ativa: tags.ativo,
      grupoId: tagGrupos.id,
      grupoNome: tagGrupos.nome,
      grupoAtivo: tagGrupos.ativo,
      selecao: tagGrupos.selecao,
    })
    .from(tags)
    .innerJoin(tagGrupos, eq(tagGrupos.id, tags.tagGrupoId))
    .where(
      and(
        inArray(tags.id, [...finais]),
        isNull(tags.excluidoEm),
        isNull(tagGrupos.excluidoEm),
        eq(tagGrupos.aplicaA, destino),
      ),
    )
  const porId = new Map(catalogo.map((t) => [t.id, t]))
  const porGrupo = new Map<string, typeof catalogo>()
  for (const id of finais) {
    const tag = porId.get(id)
    if (!tag) {
      throw invalido('tag_invalida', `Tag inexistente ou que não é de ${NOME_DO_DESTINO[destino]}.`)
    }
    if (!atuais.has(id) && !(tag.ativa && tag.grupoAtivo)) {
      throw invalido('tag_inativa', `A tag "${tag.nome}" está inativa.`)
    }
    porGrupo.set(tag.grupoId, [...(porGrupo.get(tag.grupoId) ?? []), tag])
  }
  for (const doGrupo of porGrupo.values()) {
    const grupo = doGrupo[0]
    if (grupo && grupo.selecao === 'unica' && doGrupo.length > 1) {
      throw invalido(
        'grupo_selecao_unica',
        `O grupo ${grupo.grupoNome} aceita uma tag só: ${doGrupo.map((t) => t.nome).join(', ')}.`,
      )
    }
  }
  return finais
}

/** Grava a diferença entre as tags atuais e as finais; devolve os ids que entraram e os que saíram. */
export async function gravarDiferencaDeTagsDoContato(
  db: Transacao,
  tenantId: string,
  contatoId: string,
  atuais: ReadonlySet<string>,
  finais: ReadonlySet<string>,
  membroId: string,
): Promise<{ adicionadas: string[]; removidas: string[] }> {
  const adicionadas = [...finais].filter((id) => !atuais.has(id))
  const removidas = [...atuais].filter((id) => !finais.has(id))
  if (removidas.length > 0) {
    await db
      .delete(contatoTags)
      .where(and(eq(contatoTags.contatoId, contatoId), inArray(contatoTags.tagId, removidas)))
  }
  if (adicionadas.length > 0) {
    await db
      .insert(contatoTags)
      .values(adicionadas.map((tagId) => ({ tenantId, contatoId, tagId, aplicadaPor: membroId })))
  }
  return { adicionadas, removidas }
}

/** Os nomes das tags (para a auditoria, que se lê em português). */
export async function nomesDasTags(db: Transacao, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return []
  const linhas = await db
    .select({ nome: tags.nome })
    .from(tags)
    .where(inArray(tags.id, [...ids]))
    .orderBy(asc(tags.nome))
  return linhas.map((l) => l.nome)
}

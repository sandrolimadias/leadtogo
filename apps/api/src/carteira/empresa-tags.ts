import { and, eq, inArray, isNull, schema, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { lerEmpresa as lerEmpresaPublica } from '../integracoes/publica/leitura.js'
import { emitirEvento } from '../integracoes/webhooks/eventos.js'

const { empresaTags, empresaTagsHistorico, tagGrupos, tags } = schema

/** Uma tag do catálogo da empresa, com as regras do grupo a que pertence. */
export interface TagDoCatalogo {
  id: string
  nome: string
  ativo: boolean
  grupoId: string
  grupoNome: string
  selecao: 'unica' | 'multipla'
  obrigatorio: boolean
  /** Grupo cujas tags o sistema aplica (Visitação): o usuário não aplica nem tira */
  automatico: boolean
}

/** As tags que valem para empresas (os grupos de tags de contato ficam de fora). */
export async function catalogoDeTags(db: Transacao): Promise<Map<string, TagDoCatalogo>> {
  const linhas = await db
    .select({
      id: tags.id,
      nome: tags.nome,
      ativo: tags.ativo,
      grupoId: tagGrupos.id,
      grupoNome: tagGrupos.nome,
      selecao: tagGrupos.selecao,
      obrigatorio: tagGrupos.obrigatorio,
      automatico: tagGrupos.automatico,
    })
    .from(tags)
    .innerJoin(tagGrupos, eq(tagGrupos.id, tags.tagGrupoId))
    .where(
      and(isNull(tags.excluidoEm), isNull(tagGrupos.excluidoEm), eq(tagGrupos.aplicaA, 'empresa')),
    )
  return new Map(linhas.map((l) => [l.id, l]))
}

const invalido = (codigo: string, mensagem: string) =>
  new ErroApi(codigo, mensagem, 400, [{ campo: 'tagIds', mensagem }])

/**
 * As tags finais da empresa a partir do que o usuário pediu, já conferidas:
 *  - toda tag existe; as de grupo automático só continuam se já estavam (o sistema é quem aplica);
 *  - tag inativa só continua se já estava, não se aplica de novo;
 *  - grupo de seleção única tem no máximo uma; grupo obrigatório (manual), pelo menos uma.
 * As tags automáticas que a empresa já tem ficam, mesmo que o pedido não as cite.
 */
export function conferirTagsDaEmpresa(
  catalogo: Map<string, TagDoCatalogo>,
  atuais: ReadonlySet<string>,
  pedidas: readonly string[],
): Set<string> {
  const finais = new Set(pedidas)
  for (const id of atuais) {
    if (catalogo.get(id)?.automatico) finais.add(id)
  }
  const porGrupo = new Map<string, TagDoCatalogo[]>()
  for (const id of finais) {
    const tag = catalogo.get(id)
    if (!tag) throw invalido('tag_invalida', 'Tag inexistente.')
    if (!atuais.has(id)) {
      if (tag.automatico) {
        throw invalido(
          'tag_automatica',
          `A tag "${tag.nome}" é aplicada pelo sistema (grupo ${tag.grupoNome}).`,
        )
      }
      if (!tag.ativo) throw invalido('tag_inativa', `A tag "${tag.nome}" está inativa.`)
    }
    porGrupo.set(tag.grupoId, [...(porGrupo.get(tag.grupoId) ?? []), tag])
  }
  for (const [, doGrupo] of porGrupo) {
    const grupo = doGrupo[0]
    if (grupo && grupo.selecao === 'unica' && doGrupo.length > 1) {
      throw invalido(
        'grupo_selecao_unica',
        `O grupo ${grupo.grupoNome} aceita uma tag só: ${doGrupo.map((t) => t.nome).join(', ')}.`,
      )
    }
  }
  for (const grupo of new Map([...catalogo.values()].map((t) => [t.grupoId, t])).values()) {
    if (grupo.obrigatorio && !grupo.automatico && !porGrupo.has(grupo.grupoId)) {
      throw invalido('grupo_obrigatorio', `Escolha uma tag do grupo ${grupo.grupoNome}.`)
    }
  }
  return finais
}

export async function tagsAtuaisDaEmpresa(db: Transacao, empresaId: string): Promise<Set<string>> {
  const linhas = await db
    .select({ tagId: empresaTags.tagId })
    .from(empresaTags)
    .where(eq(empresaTags.empresaId, empresaId))
  return new Set(linhas.map((l) => l.tagId))
}

/**
 * Grava a diferença entre as tags atuais e as finais, com o histórico (base da conversão
 * Lead → Cliente): cada tag que entra ou sai vira uma linha em `empresa_tags_historico`. Houve mudança: o evento
 * `empresa.tag_alterada` dos webhooks (salvo `evento: false`, como no cadastro, que já avisa `empresa.criada`).
 */
export async function gravarDiferencaDeTags(
  db: Transacao,
  tenantId: string,
  empresaId: string,
  atuais: ReadonlySet<string>,
  finais: ReadonlySet<string>,
  /** Quem mudou; nulo = o sistema (ex.: a geocodificação) */
  membroId: string | null,
  evento = true,
): Promise<{ adicionadas: string[]; removidas: string[] }> {
  const adicionadas = [...finais].filter((id) => !atuais.has(id))
  const removidas = [...atuais].filter((id) => !finais.has(id))
  if (removidas.length > 0) {
    await db
      .delete(empresaTags)
      .where(and(eq(empresaTags.empresaId, empresaId), inArray(empresaTags.tagId, removidas)))
    await db.insert(empresaTagsHistorico).values(
      removidas.map((tagId) => ({
        tenantId,
        empresaId,
        tagId,
        acao: 'removida' as const,
        por: membroId,
      })),
    )
  }
  if (adicionadas.length > 0) {
    await db
      .insert(empresaTags)
      .values(adicionadas.map((tagId) => ({ tenantId, empresaId, tagId, aplicadaPor: membroId })))
    await db.insert(empresaTagsHistorico).values(
      adicionadas.map((tagId) => ({
        tenantId,
        empresaId,
        tagId,
        acao: 'adicionada' as const,
        por: membroId,
      })),
    )
  }
  if (evento && (adicionadas.length > 0 || removidas.length > 0)) {
    await emitirEvento(db, {
      tenantId,
      tipo: 'empresa.tag_alterada',
      entidadeId: empresaId,
      membroId,
      dados: async () => {
        const tags = await db.execute<{
          id: string
          nome: string
          chave_sistema: string | null
        }>(sql`
          SELECT id, nome, chave_sistema FROM tags
          WHERE id = ANY (${`{${[...adicionadas, ...removidas].join(',')}}`}::uuid[])`)
        const da = (ids: string[]) => tags.filter((t) => ids.includes(t.id))
        return {
          empresa: await lerEmpresaPublica(db, empresaId),
          alteracoes: { adicionadas: da(adicionadas), removidas: da(removidas) },
        }
      },
    })
  }
  return { adicionadas, removidas }
}

import { type SQL, sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'

/**
 * Alcance por TAGS DE CONTATO (Fase 4C): publicações, eventos, documentos e avisos podem ir só para quem tem
 * alguma das tags. As tabelas de vínculo são fixas (lista de permissão); nunca vêm do pedido.
 */
const VINCULOS = {
  publicacao: { tabela: 'publicacao_tags', coluna: 'publicacao_id' },
  evento: { tabela: 'evento_tags', coluna: 'evento_id' },
  documento: { tabela: 'documento_tags', coluna: 'documento_id' },
  aviso: { tabela: 'aviso_tags', coluna: 'aviso_id' },
} as const
export type ItemComAudiencia = keyof typeof VINCULOS

const ident = (item: ItemComAudiencia) => ({
  tabela: sql.raw(VINCULOS[item].tabela),
  coluna: sql.raw(VINCULOS[item].coluna),
})

/** Troca as tags do item. Fora do alcance "tags" só apaga. Tag inexistente ou de outro alvo: 422. */
export async function trocarTagsDoAlcance(
  db: Transacao,
  item: ItemComAudiencia,
  p: { itemId: string; tenantId: string; alcance: string; tagIds: string[]; membroId: string },
): Promise<void> {
  const { tabela, coluna } = ident(item)
  await db.execute(sql`DELETE FROM ${tabela} WHERE ${coluna} = ${p.itemId}`)
  if (p.alcance !== 'tags') return
  const unicas = [...new Set(p.tagIds)]
  const validas = await db.execute<{ id: string }>(sql`
    SELECT t.id FROM tags t JOIN tag_grupos g ON g.id = t.tag_grupo_id
    WHERE t.id = ANY (${`{${unicas.join(',')}}`}::uuid[]) AND g.aplica_a = 'contato'`)
  if (validas.length !== unicas.length) {
    throw new ErroApi('tag_invalida', 'Alguma tag escolhida não existe ou não é de contato.', 422)
  }
  for (const tagId of unicas) {
    await db.execute(sql`
      INSERT INTO ${tabela} (tenant_id, ${coluna}, tag_id, aplicada_por)
      VALUES (${p.tenantId}, ${p.itemId}, ${tagId}, ${p.membroId})`)
  }
}

/** As tags do alcance do item, com o grupo, para o detalhe da equipe. */
export async function tagsDoAlcance(
  db: Transacao,
  item: ItemComAudiencia,
  itemId: string,
): Promise<{ id: string; nome: string; grupo: string }[]> {
  const { tabela, coluna } = ident(item)
  const linhas = await db.execute<{ id: string; nome: string; grupo: string }>(sql`
    SELECT t.id, t.nome, g.nome AS grupo FROM ${tabela} v
    JOIN tags t ON t.id = v.tag_id JOIN tag_grupos g ON g.id = t.tag_grupo_id
    WHERE v.${coluna} = ${itemId} ORDER BY lower(g.nome), lower(t.nome)`)
  return [...linhas]
}

/**
 * Condição "o acesso `a` está no alcance do item `x`" (todos, empresas ou tags), para métricas e destinatários
 * calculados pela equipe ou pelo worker (o cliente é filtrado pelas políticas do banco).
 */
export function acessoNoAlcance(
  item: ItemComAudiencia,
  x: SQL,
  a: SQL,
  tabelaEmpresas:
    'publicacao_empresas' | 'evento_empresas' | 'documento_empresas' | 'aviso_empresas',
): SQL {
  const { tabela, coluna } = ident(item)
  const empresas = sql.raw(tabelaEmpresas)
  return sql`(${x}.alcance::text = 'todos'
    OR (${x}.alcance::text = 'empresas' AND EXISTS (
      SELECT 1 FROM ${empresas} ve WHERE ve.${coluna} = ${x}.id AND ve.empresa_id = ${a}.empresa_id))
    OR (${x}.alcance::text = 'tags' AND EXISTS (
      SELECT 1 FROM ${tabela} vt JOIN contato_tags ct ON ct.tag_id = vt.tag_id
      WHERE vt.${coluna} = ${x}.id AND ct.contato_id = ${a}.contato_id)))`
}

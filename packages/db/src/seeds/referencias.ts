import { cnaes, estados, paises, portes, qualificacoesSocio } from '../schema/index.js'
import { lerDados } from './dados.js'
import { type Db, upsert } from './upsert.js'

/**
 * Referências globais (docs/modelagem_banco.md, seção 4), de seeds/dados/. Idempotente.
 * Roda com o leadtogo_owner: o app só lê estas tabelas.
 */
export async function semearReferencias(db: Db): Promise<Record<string, number>> {
  const total: Record<string, number> = {}

  total['estados'] = await upsert(
    db,
    estados,
    await lerDados<typeof estados.$inferInsert>('estados'),
    estados.uf,
    ['nome', 'regiao'],
  )
  total['paises'] = await upsert(
    db,
    paises,
    await lerDados<typeof paises.$inferInsert>('paises'),
    paises.codigo,
    ['nome'],
  )
  total['portes'] = await upsert(
    db,
    portes,
    await lerDados<typeof portes.$inferInsert>('portes'),
    portes.codigo,
    ['descricao'],
  )
  total['qualificacoes_socio'] = await upsert(
    db,
    qualificacoesSocio,
    await lerDados<typeof qualificacoesSocio.$inferInsert>('qualificacoes_socio'),
    qualificacoesSocio.codigo,
    ['descricao'],
  )

  total['cnaes'] = await upsert(
    db,
    cnaes,
    await lerDados<typeof cnaes.$inferInsert>('cnaes'),
    cnaes.codigo,
    ['descricao', 'secao', 'divisao', 'grupo', 'classe'],
  )

  return total
}

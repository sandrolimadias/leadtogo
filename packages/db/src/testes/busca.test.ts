import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const owner = conectarOwner()
const app = conectarApp()
afterAll(async () => {
  await owner.end()
  await app.end()
})

async function membro() {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const membroId = novoId()
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Quem busca')`
  })
  return { tenantId, membroId }
}

describe('busca global', () => {
  it('as oportunidades têm índice de busca (pg_trgm) no título sem acento', async () => {
    const [indice] = await owner<{ def: string }[]>`
      SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'oportunidades_titulo_trgm_idx'`
    expect(indice?.def).toMatch(/USING gin \(lower\(f_unaccent\(titulo\)\) gin_trgm_ops\)/)
  })

  it('buscas recentes: um termo por membro (pelo termo comparável) e de 2 a 100 caracteres', async () => {
    const { tenantId, membroId } = await membro()
    const inserir = (termo: string, comparavel: string) =>
      comTenant(
        app,
        tenantId,
        (tx) => tx`INSERT INTO buscas_recentes (id, tenant_id, membro_id, termo, termo_comparavel)
          VALUES (${novoId()}, ${tenantId}, ${membroId}, ${termo}, ${comparavel})`,
      )
    await inserir('São José', 'sao jose')
    await expect(inserir('sao jose', 'sao jose')).rejects.toThrow(/buscas_recentes_termo_uq/)
    await expect(inserir('a', 'a')).rejects.toThrow(/buscas_recentes_termo_chk/)
  })

  it('apagar o membro apaga o histórico dele', async () => {
    const { tenantId, membroId } = await membro()
    await comTenant(owner, tenantId, async (tx) => {
      await tx`INSERT INTO buscas_recentes (id, tenant_id, membro_id, termo, termo_comparavel)
        VALUES (${novoId()}, ${tenantId}, ${membroId}, 'acme', 'acme')`
      await tx`DELETE FROM membros WHERE id = ${membroId}`
      expect(await tx`SELECT id FROM buscas_recentes WHERE membro_id = ${membroId}`).toHaveLength(0)
    })
  })
})

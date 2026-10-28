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

const hashDe = (n: string) => n.replace(/-/g, '').padEnd(64, '0')

async function chave(opcoes: { expira?: string; revogada?: boolean } = {}) {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const membroId = novoId()
  const id = novoId()
  await comTenant(owner, tenantId, async (tx) => {
    await tx`INSERT INTO membros (id, tenant_id, nome, tipo, ativo) VALUES (${membroId}, ${tenantId}, 'Integração: x', 'integracao', false)`
    await tx`INSERT INTO api_chaves (id, tenant_id, nome, prefixo, hash, ambiente, membro_id, expira_em, revogada_em, revogada_por)
      VALUES (${id}, ${tenantId}, 'x', 'abcdefgh', ${hashDe(id)}, 'test', ${membroId},
        ${opcoes.expira ?? null}::timestamptz, ${opcoes.revogada ? new Date() : null}, ${opcoes.revogada ? membroId : null})`
  })
  return { tenantId, id }
}

describe('api_chaves: localizar a chave antes de saber a empresa', () => {
  it('sem empresa, o app não lê chave nenhuma; app_localizar_chave acha só a válida, pelo hash', async () => {
    const valida = await chave()
    expect(await app`SELECT id FROM api_chaves`).toHaveLength(0)
    const [achada] = await app<{ chave_id: string; tenant_id: string }[]>`
      SELECT chave_id, tenant_id FROM app_localizar_chave(${hashDe(valida.id)})`
    expect(achada).toEqual({ chave_id: valida.id, tenant_id: valida.tenantId })
    // A trava da política não fica ligada depois da função
    expect(await app`SELECT id FROM api_chaves`).toHaveLength(0)

    const revogada = await chave({ revogada: true })
    const vencida = await chave({ expira: '2020-01-01T00:00:00Z' })
    for (const c of [revogada, vencida]) {
      expect(await app`SELECT * FROM app_localizar_chave(${hashDe(c.id)})`).toHaveLength(0)
    }
    expect(await app`SELECT * FROM app_localizar_chave(${'f'.repeat(64)})`).toHaveLength(0)
  })

  it('o hash é único e só aceita SHA-256 em hexadecimal', async () => {
    const c = await chave()
    await expect(
      comTenant(
        owner,
        c.tenantId,
        (tx) => tx`UPDATE api_chaves SET hash = 'nao-e-hex' WHERE id = ${c.id}`,
      ),
    ).rejects.toThrow(/api_chaves_hash_chk/)
  })
})

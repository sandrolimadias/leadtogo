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

describe('webhook_entregas: varredura e limpeza do worker', () => {
  it('app_entregas_atrasadas acha só as pendentes vencidas e livres; a limpeza respeita a retenção', async () => {
    const tenantId = novoId()
    await prepararTenants(owner, [tenantId])
    const webhookId = novoId()
    const ids = {
      atrasada: novoId(),
      recente: novoId(),
      reservada: novoId(),
      sucessoVelho: novoId(),
      falhaNova: novoId(),
    }
    await comTenant(owner, tenantId, async (tx) => {
      await tx`INSERT INTO webhooks (id, tenant_id, descricao, url, segredo)
        VALUES (${webhookId}, ${tenantId}, 'n8n', 'https://n8n.exemplo.com/x', 'v1:x')`
      const entrega = (id: string, extra: string) =>
        tx.unsafe(`INSERT INTO webhook_entregas (id, tenant_id, webhook_id, evento_id, tipo, corpo, situacao,
            proxima_tentativa_em, reservada_ate, criado_em)
          VALUES ('${id}', '${tenantId}', '${webhookId}', '${novoId()}', 'empresa.criada', '{}', ${extra})`)
      await entrega(ids.atrasada, `'pendente', now() - interval '10 minutes', NULL, now()`)
      await entrega(ids.recente, `'pendente', now() + interval '1 minute', NULL, now()`)
      await entrega(
        ids.reservada,
        `'pendente', now() - interval '10 minutes', now() + interval '1 minute', now()`,
      )
      await entrega(ids.sucessoVelho, `'sucesso', NULL, NULL, now() - interval '31 days'`)
      await entrega(ids.falhaNova, `'falhou', NULL, NULL, now() - interval '31 days'`)
    })
    const achadas = await app<{ id: string }[]>`SELECT id FROM app_entregas_atrasadas()`
    const minhas = achadas.map((a) => a.id).filter((id) => Object.values(ids).includes(id))
    expect(minhas).toEqual([ids.atrasada])
    expect(await app`SELECT id FROM webhook_entregas`).toHaveLength(0)

    await app`SELECT app_limpar_webhook_entregas(5000)`
    const restantes = await comTenant(
      owner,
      tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM webhook_entregas`,
    )
    expect(restantes.map((r) => r.id).sort()).toEqual(
      [ids.atrasada, ids.recente, ids.reservada, ids.falhaNova].sort(),
    )
  })
})

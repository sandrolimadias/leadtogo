import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { criarPadroesPendentesPorUrl } from '../index.js'
import { criarPapeisDoTenant } from '../padroes.js'
import {
  comTenant,
  conectarApp,
  conectarDrizzleOwner,
  conectarOwner,
  urlOwnerDeTeste,
} from './conexoes.js'
import { prepararTenants } from './fabricas.js'
import { sql } from 'drizzle-orm'

const app = conectarApp()
const owner = conectarOwner()
const { db, cliente } = conectarDrizzleOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
  await cliente.end()
})

async function novoTenant(
  comConfiguracao = true,
): Promise<{ tenantId: string; empresaId: string }> {
  const tenantId = novoId()
  await prepararTenants(owner, [tenantId])
  const empresaId = await comTenant(owner, tenantId, async (tx) => {
    if (comConfiguracao) await tx`INSERT INTO tenant_configuracoes (tenant_id) VALUES (${tenantId})`
    const membroId = novoId()
    const empresaId = novoId()
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${membroId}, ${tenantId}, 'Vendedor')`
    await tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id) VALUES (${empresaId}, ${tenantId}, 'Empresa', ${membroId})`
    return empresaId
  })
  return { tenantId, empresaId }
}

const criarContato = (
  tenantId: string,
  campos: { nome?: string; dia?: number | null; mes?: number | null } = {},
) =>
  comTenant(app, tenantId, async (tx) => {
    const id = novoId()
    await tx`
      INSERT INTO contatos (id, tenant_id, nome, aniversario_dia, aniversario_mes)
      VALUES (${id}, ${tenantId}, ${campos.nome ?? 'Fulano'}, ${campos.dia ?? null}, ${campos.mes ?? null})`
    return id
  })

const vincular = (
  tenantId: string,
  empresaId: string,
  contatoId: string,
  campos: { principal?: boolean; ativo?: boolean } = {},
) =>
  comTenant(
    app,
    tenantId,
    (tx) =>
      tx`
      INSERT INTO empresa_contatos (id, tenant_id, empresa_id, contato_id, principal, ativo)
      VALUES (${novoId()}, ${tenantId}, ${empresaId}, ${contatoId}, ${campos.principal ?? false}, ${campos.ativo ?? true})`,
  )

describe('contatos: aniversário (só dia e mês)', () => {
  it('aceita dia e mês juntos, ou nenhum dos dois', async () => {
    const { tenantId } = await novoTenant()
    await expect(criarContato(tenantId, { dia: 29, mes: 2 })).resolves.toBeTruthy()
    await expect(criarContato(tenantId)).resolves.toBeTruthy()
  })

  it.each([
    ['mês 13', { dia: 10, mes: 13 }],
    ['dia 0', { dia: 0, mes: 5 }],
    ['dia 32', { dia: 32, mes: 5 }],
    ['só o dia', { dia: 10, mes: null }],
    ['só o mês', { dia: null, mes: 5 }],
  ])('recusa %s', async (_nome, campos) => {
    const { tenantId } = await novoTenant()
    await expect(criarContato(tenantId, campos)).rejects.toThrow()
  })
})

describe('empresa_contatos: vínculo', () => {
  it('um contato liga a várias empresas, mas só uma vez a cada uma', async () => {
    const a = await novoTenant()
    const contato = await criarContato(a.tenantId)
    await vincular(a.tenantId, a.empresaId, contato)
    await expect(vincular(a.tenantId, a.empresaId, contato)).rejects.toThrow(/empresa_contatos_uq/)
  })

  it('no máximo um contato principal por empresa; outro principal em outra empresa vale', async () => {
    const { tenantId, empresaId } = await novoTenant()
    const c1 = await criarContato(tenantId, { nome: 'Um' })
    const c2 = await criarContato(tenantId, { nome: 'Dois' })
    await vincular(tenantId, empresaId, c1, { principal: true })
    await expect(vincular(tenantId, empresaId, c2, { principal: true })).rejects.toThrow(
      /empresa_contatos_principal_uq/,
    )
    await expect(vincular(tenantId, empresaId, c2)).resolves.toBeDefined()
  })

  it('o principal precisa estar ativo', async () => {
    const { tenantId, empresaId } = await novoTenant()
    const c1 = await criarContato(tenantId)
    await expect(
      vincular(tenantId, empresaId, c1, { principal: true, ativo: false }),
    ).rejects.toThrow(/empresa_contatos_principal_ativo/)
  })
})

describe('contato_emails e contato_telefones', () => {
  it('o e-mail é único por contato sem diferença de caixa, e dois contatos podem ter o mesmo (o duplicado é só aviso)', async () => {
    const { tenantId } = await novoTenant()
    const c1 = await criarContato(tenantId)
    const c2 = await criarContato(tenantId)
    const email = (contatoId: string, e: string) =>
      comTenant(
        app,
        tenantId,
        (tx) =>
          tx`INSERT INTO contato_emails (id, tenant_id, contato_id, email) VALUES (${novoId()}, ${tenantId}, ${contatoId}, ${e})`,
      )
    await email(c1, 'Ana@Exemplo.com')
    await expect(email(c1, 'ana@exemplo.com')).rejects.toThrow(/contato_emails_uq/)
    await expect(email(c2, 'ana@exemplo.com')).resolves.toBeDefined()
  })

  it('o telefone guarda o digitado e o E.164', async () => {
    const { tenantId } = await novoTenant()
    const c = await criarContato(tenantId)
    const [t] = await comTenant(app, tenantId, async (tx) => {
      await tx`INSERT INTO contato_telefones (id, tenant_id, contato_id, numero, numero_e164, tipo) VALUES (${novoId()}, ${tenantId}, ${c}, '27998472210', '+5527998472210', 'whatsapp')`
      return tx`SELECT numero, numero_e164, tipo::text AS tipo FROM contato_telefones WHERE contato_id = ${c}`
    })
    expect(t).toEqual({ numero: '27998472210', numero_e164: '+5527998472210', tipo: 'whatsapp' })
  })
})

describe('papéis na decisão', () => {
  const papeis = (tenantId: string) =>
    comTenant(owner, tenantId, async (tx) =>
      (await tx<{ nome: string }[]>`SELECT nome FROM papeis_decisao ORDER BY ordem`).map(
        (p) => p.nome,
      ),
    )

  it('criarPapeisDoTenant cria os cinco uma única vez', async () => {
    const { tenantId } = await novoTenant()
    const criar = () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
        return criarPapeisDoTenant(tx, tenantId)
      })
    expect(await criar()).toBe(true)
    expect(await papeis(tenantId)).toEqual([
      'Decisor',
      'Influenciador',
      'Usuário',
      'Financeiro',
      'Técnico',
    ])
    expect(await criar()).toBe(false) // o que o administrador excluir não volta
    expect(await papeis(tenantId)).toHaveLength(5)
  })

  it('o start da API cria os papéis das empresas que já existiam (marca própria)', async () => {
    const { tenantId } = await novoTenant()
    expect(await papeis(tenantId)).toEqual([])
    const r = await criarPadroesPendentesPorUrl(urlOwnerDeTeste())
    expect(r.falhas).toEqual([])
    expect(await papeis(tenantId)).toHaveLength(5)
    // repetir não duplica
    await criarPadroesPendentesPorUrl(urlOwnerDeTeste())
    expect(await papeis(tenantId)).toHaveLength(5)
  })

  it('o nome é único por empresa, sem diferença de caixa', async () => {
    const { tenantId } = await novoTenant()
    const novo = (nome: string) =>
      comTenant(
        app,
        tenantId,
        (tx) =>
          tx`INSERT INTO papeis_decisao (id, tenant_id, nome) VALUES (${novoId()}, ${tenantId}, ${nome})`,
      )
    await novo('Patrocinador')
    await expect(novo('PATROCINADOR')).rejects.toThrow(/papeis_decisao_nome_uq/)
  })
})

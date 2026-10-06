import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
})

async function novoConvite(tenantId: string, extra: { email?: string; hash?: string } = {}) {
  const id = novoId()
  const convidadoPor = await comTenant(app, tenantId, async (tx) => {
    const m = novoId()
    await tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${m}, ${tenantId}, 'Quem convida')`
    return m
  })
  const hash = extra.hash ?? `hash-${id}`
  await comTenant(
    app,
    tenantId,
    (tx) => tx`
      INSERT INTO convites (id, tenant_id, email, papel, token_hash, expira_em, convidado_por)
      VALUES (${id}, ${tenantId}, ${extra.email ?? `c-${id}@exemplo.com`}, 'vendedor', ${hash}, now() + interval '7 days', ${convidadoPor})`,
  )
  return { id, hash, convidadoPor }
}

describe('convites', () => {
  it('guarda só o hash do token, com e-mail citext e uso único', async () => {
    const [t] = [novoId()]
    await prepararTenants(owner, [t])
    const { hash } = await novoConvite(t, { email: 'Ana@Exemplo.com' })
    const [c] = await comTenant(
      app,
      t,
      (tx) => tx`SELECT email, token_hash, aceito_em, revogado_em FROM convites`,
    )
    expect(c).toMatchObject({
      email: 'Ana@Exemplo.com',
      token_hash: hash,
      aceito_em: null,
      revogado_em: null,
    })
    const colunas = await owner<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'convites'`
    expect(colunas.map((c) => c.column_name)).not.toContain('token') // o token nunca é gravado
  })

  it('no máximo um convite PENDENTE por empresa e e-mail (sem diferenciar caixa); aceito ou revogado liberam', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const primeiro = await novoConvite(t, { email: 'dup@exemplo.com' })
    await expect(novoConvite(t, { email: 'DUP@exemplo.com' })).rejects.toThrow(/duplicate key/)
    await comTenant(
      app,
      t,
      (tx) => tx`UPDATE convites SET revogado_em = now() WHERE id = ${primeiro.id}`,
    )
    await novoConvite(t, { email: 'dup@exemplo.com' }) // libera depois de revogado
    // o mesmo e-mail pode ser convidado por OUTRA empresa
    const outra = novoId()
    await prepararTenants(owner, [outra])
    await novoConvite(outra, { email: 'dup@exemplo.com' })
  })

  it('o hash do token é único no banco todo', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    await novoConvite(a, { hash: 'hash-fixo-unico' })
    await expect(novoConvite(b, { hash: 'hash-fixo-unico' })).rejects.toThrow(/duplicate key/)
  })

  it('o papel é restrito ao enum e o convite precisa de quem convida', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO convites (id, tenant_id, email, papel, token_hash, expira_em, convidado_por) VALUES (${novoId()}, ${t}, 'x@x.com', 'dono', 'h', now(), ${novoId()})`,
      ),
    ).rejects.toThrow(/invalid input value for enum/)
    await expect(
      comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO convites (id, tenant_id, email, papel, token_hash, expira_em, convidado_por) VALUES (${novoId()}, ${t}, 'x@x.com', 'vendedor', 'h2', now(), ${novoId()})`,
      ),
    ).rejects.toThrow(/foreign key/)
  })
})

describe('app_convite_por_token (SECURITY DEFINER)', () => {
  const buscar = (hash: string | null) =>
    app<{ id: string; tenant_id: string }[]>`SELECT * FROM app_convite_por_token(${hash})`

  it('acha o convite pelo hash, sem tenant ativo, e devolve só os ids', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const ca = await novoConvite(a)
    const cb = await novoConvite(b)
    const r = await buscar(ca.hash)
    expect(r).toEqual([{ id: ca.id, tenant_id: a }])
    expect(Object.keys(r[0] ?? {}).sort()).toEqual(['id', 'tenant_id'])
    expect(await buscar(cb.hash)).toEqual([{ id: cb.id, tenant_id: b }])
  })

  it('hash desconhecido, vazio ou NULL: nada', async () => {
    expect(await buscar('nao-existe')).toHaveLength(0)
    expect(await buscar('')).toHaveLength(0)
    expect(await buscar(null)).toHaveLength(0)
  })

  it('não abre brecha: sem tenant o app continua sem ler convites, e a variável é limpa', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const { hash } = await novoConvite(t)
    await app.begin(async (tx) => {
      expect(await tx`SELECT * FROM app_convite_por_token(${hash})`).toHaveLength(1)
      const [v] = await tx<{ v: string }[]>`SELECT current_setting('app.convite_hash', true) AS v`
      expect(v?.v ?? '').toBe('')
      expect(await tx`SELECT 1 FROM convites`).toHaveLength(0)
    })
    // definir a variável por conta própria não dá leitura ao app (a política é só do owner)
    await app.begin(async (tx) => {
      await tx`SELECT set_config('app.convite_hash', ${hash}, true)`
      expect(await tx`SELECT 1 FROM convites`).toHaveLength(0)
    })
    // nem o owner fora da função
    expect(await owner`SELECT 1 FROM convites WHERE token_hash = ${hash}`).toHaveLength(0)
  })

  it('pertence ao owner, SECURITY DEFINER, search_path fixo, e só o app executa', async () => {
    const [f] = await owner<{ dono: string; definer: boolean; config: string[] }[]>`
      SELECT pg_get_userbyid(proowner) AS dono, prosecdef AS definer, proconfig AS config
      FROM pg_proc WHERE proname = 'app_convite_por_token'`
    expect(f).toEqual({
      dono: 'leadtogo_owner',
      definer: true,
      config: ['search_path=pg_catalog, pg_temp'],
    })
    const [p] = await owner<{ publico: boolean; app: boolean }[]>`
      SELECT has_function_privilege('public', 'app_convite_por_token(text)', 'EXECUTE') AS publico,
             has_function_privilege('leadtogo_app', 'app_convite_por_token(text)', 'EXECUTE') AS app`
    expect(p).toEqual({ publico: false, app: true })
  })
})

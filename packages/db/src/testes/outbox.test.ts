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

async function novoEvento(tenantId: string, extra: { tipo?: string; ajuste?: string } = {}) {
  const id = novoId()
  await comTenant(app, tenantId, async (tx) => {
    await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, payload) VALUES (${id}, ${tenantId}, ${extra.tipo ?? 'teste.evento'}, ${tx.json({ a: 1 })})`
    if (extra.ajuste)
      await tx.unsafe(`UPDATE eventos_outbox SET ${extra.ajuste} WHERE id = '${id}'`)
  })
  return id
}
const reservar = (limite?: number, reservaS?: number) =>
  app<
    { id: string; tenant_id: string }[]
  >`SELECT * FROM app_reservar_eventos(${limite ?? 50}, ${reservaS ?? 60})`
const estado = async (id: string, tenant: string) =>
  comTenant(
    app,
    tenant,
    async (tx) =>
      (
        await tx<
          { tentativas: number; reservado_ate: Date | null }[]
        >`SELECT tentativas, reservado_ate FROM eventos_outbox WHERE id = ${id}`
      )[0],
  )

describe('app_reservar_eventos (relay do outbox sem BYPASSRLS)', () => {
  it('o evento nasce na mesma transação do dado: desfeita a transação, não há evento', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const id = novoId()
    await expect(
      comTenant(app, t, async (tx) => {
        await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo) VALUES (${id}, ${t}, 'teste.evento')`
        throw new Error('falha de negócio depois de gravar o evento')
      }),
    ).rejects.toThrow('falha de negócio')
    expect(
      await comTenant(app, t, (tx) => tx`SELECT 1 FROM eventos_outbox WHERE id = ${id}`),
    ).toHaveLength(0)
  })

  it('reserva só pendentes, vencidos e livres, de qualquer tenant, devolvendo só id e tenant_id', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const ea = await novoEvento(a)
    const eb = await novoEvento(b)
    const processado = await novoEvento(a, { ajuste: 'processado_em = now()' })
    const falhou = await novoEvento(a, { ajuste: 'falhou_em = now()' })
    const adiado = await novoEvento(a, {
      ajuste: "proxima_tentativa_em = now() + interval '1 hour'",
    })
    const reservado = await novoEvento(a, { ajuste: "reservado_ate = now() + interval '1 hour'" })
    const r = await reservar(200)
    const ids = r.map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining([ea, eb]))
    for (const nao of [processado, falhou, adiado, reservado]) expect(ids).not.toContain(nao)
    expect(r.find((x) => x.id === ea)?.tenant_id).toBe(a)
    expect(r.find((x) => x.id === eb)?.tenant_id).toBe(b)
    expect(Object.keys(r[0] ?? {}).sort()).toEqual(['id', 'tenant_id'])
  })

  it('a reserva soma uma tentativa, segura o evento e só o devolve de novo quando expira', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const id = await novoEvento(t)
    expect((await reservar(200, 60)).map((x) => x.id)).toContain(id)
    const apos = await estado(id, t)
    expect(apos?.tentativas).toBe(1)
    expect(apos?.reservado_ate && apos.reservado_ate.getTime() > Date.now()).toBe(true)
    expect((await reservar(200, 60)).map((x) => x.id)).not.toContain(id) // ainda reservado
    await comTenant(
      app,
      t,
      (tx) =>
        tx`UPDATE eventos_outbox SET reservado_ate = now() - interval '1 second' WHERE id = ${id}`,
    )
    expect((await reservar(200, 60)).map((x) => x.id)).toContain(id) // expirou: volta
    expect((await estado(id, t))?.tentativas).toBe(2)
  })

  it('respeita o limite do lote (1 a 200) e a ordem de criação', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const ids: string[] = []
    for (let i = 0; i < 4; i++) ids.push(await novoEvento(t))
    const lote = (await reservar(2, 60)).filter((x) => ids.includes(x.id))
    expect(lote.length).toBeLessThanOrEqual(2)
    expect((await reservar(0, 60)).length).toBeLessThanOrEqual(1) // mínimo 1
    expect((await reservar(100_000, 60)).length).toBeLessThanOrEqual(200) // máximo 200
  })

  it('reservas simultâneas nunca entregam o mesmo evento a dois relays (SKIP LOCKED)', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const mine = new Set<string>()
    for (let i = 0; i < 30; i++) mine.add(await novoEvento(t))
    const lotes = await Promise.all(Array.from({ length: 6 }, () => reservar(10, 60)))
    const vistos = lotes
      .flat()
      .map((x) => x.id)
      .filter((id) => mine.has(id))
    expect(new Set(vistos).size).toBe(vistos.length) // sem repetição entre os relays
    expect(vistos.length).toBe(30)
  })

  it('não abre brecha: o app segue sem ler o outbox fora do tenant, e a variável é limpa', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    await novoEvento(t)
    await app.begin(async (tx) => {
      await tx`SELECT * FROM app_reservar_eventos(50, 60)`
      const [v] = await tx<{ v: string }[]>`SELECT current_setting('app.outbox_reserva', true) AS v`
      expect(v?.v ?? '').toBe('')
      expect(await tx`SELECT 1 FROM eventos_outbox`).toHaveLength(0)
    })
    // definir a variável por conta própria não dá leitura nem escrita ao app (a política é só do owner)
    await app.begin(async (tx) => {
      await tx`SELECT set_config('app.outbox_reserva', '1', true)`
      expect(await tx`SELECT 1 FROM eventos_outbox`).toHaveLength(0)
      expect((await tx`UPDATE eventos_outbox SET tentativas = 99`).count).toBe(0)
    })
  })

  it('pertence ao owner, SECURITY DEFINER, search_path fixo, e só o app executa', async () => {
    const [f] = await owner<
      { dono: string; definer: boolean; config: string[]; retorna: string }[]
    >`
      SELECT pg_get_userbyid(proowner) AS dono, prosecdef AS definer, proconfig AS config, pg_get_function_result(oid) AS retorna
      FROM pg_proc WHERE proname = 'app_reservar_eventos'`
    expect(f).toEqual({
      dono: 'leadtogo_owner',
      definer: true,
      config: ['search_path=pg_catalog, pg_temp'],
      retorna: 'TABLE(id uuid, tenant_id uuid)',
    })
    const [p] = await owner<{ publico: boolean; app: boolean }[]>`
      SELECT has_function_privilege('public', 'app_reservar_eventos(integer, integer)', 'EXECUTE') AS publico,
             has_function_privilege('leadtogo_app', 'app_reservar_eventos(integer, integer)', 'EXECUTE') AS app`
    expect(p).toEqual({ publico: false, app: true })
  })
})

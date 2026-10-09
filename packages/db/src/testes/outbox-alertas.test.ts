import { afterAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarOwner } from './conexoes.js'
import { prepararTenants } from './fabricas.js'

// Alerta e tratamento dos eventos esgotados (migração 0013): funções SECURITY DEFINER, sem BYPASSRLS.
const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
})

async function novoEvento(
  tenantId: string,
  ajuste?: string,
  payload: Record<string, string> = { conviteId: 'c1' },
) {
  const id = novoId()
  await comTenant(app, tenantId, async (tx) => {
    await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, payload) VALUES (${id}, ${tenantId}, 'teste.evento', ${tx.json(payload)})`
    if (ajuste) await tx.unsafe(`UPDATE eventos_outbox SET ${ajuste} WHERE id = '${id}'`)
  })
  return id
}
const esgotado = (t: string, payload?: Record<string, string>) =>
  novoEvento(
    t,
    "falhou_em = now() - interval '1 minute', tentativas = 8, ultimo_erro = 'smtp fora'",
    payload,
  )
const contar = async () =>
  Number(
    (await app<{ n: string }[]>`SELECT app_contar_eventos_esgotados() AS n`)[0]?.n ?? Number.NaN,
  )
const listar = () =>
  app<{ id: string; tenant_id: string }[]>`SELECT * FROM app_listar_eventos_esgotados(500)`
const tratar = async (id: string, acao: string, por = 'Ale') =>
  (await app<{ r: boolean }[]>`SELECT app_tratar_evento_esgotado(${id}, ${acao}, ${por}) AS r`)[0]
    ?.r
const linha = (t: string, id: string) =>
  comTenant(
    app,
    t,
    async (tx) =>
      (
        await tx<
          {
            falhou_em: Date | null
            tentativas: number
            payload: unknown
            tratado_em: Date | null
            tratado_por: string | null
            tratamento: string | null
          }[]
        >`SELECT falhou_em, tentativas, payload, tratado_em, tratado_por, tratamento FROM eventos_outbox WHERE id = ${id}`
      )[0],
  )

describe('contagem e listagem dos eventos esgotados (todos os tenants, sem BYPASSRLS)', () => {
  it('conta só os esgotados e não tratados, de qualquer tenant', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const antes = await contar()
    await esgotado(a)
    await esgotado(b)
    await novoEvento(a) // pendente
    await novoEvento(a, 'processado_em = now()') // entregue
    expect(await contar()).toBe(antes + 2)
  })

  it('a listagem devolve os esgotados dos dois tenants, sem o payload, e respeita o limite', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const ea = await esgotado(a)
    const eb = await esgotado(b)
    const lista = await listar()
    expect(lista.map((x) => x.id)).toEqual(expect.arrayContaining([ea, eb]))
    expect(lista.find((x) => x.id === ea)?.tenant_id).toBe(a)
    expect(Object.keys(lista[0] ?? {}).sort()).toEqual([
      'falhou_em',
      'id',
      'tenant_id',
      'tentativas',
      'tipo',
      'ultimo_erro',
    ])
    expect((await app`SELECT * FROM app_listar_eventos_esgotados(1)`).length).toBe(1)
  })

  it('não abre brecha: o app segue sem ler o outbox fora do tenant e a variável é limpa', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const eb = await esgotado(b)
    await app.begin(async (tx) => {
      await tx`SELECT app_contar_eventos_esgotados()`
      await tx`SELECT * FROM app_listar_eventos_esgotados(10)`
      await tx`SELECT app_tratar_evento_esgotado(${novoId()}, 'descartar', 'Ale')`
      const [v] = await tx<{ v: string }[]>`SELECT current_setting('app.outbox_alertas', true) AS v`
      expect(v?.v ?? '').toBe('')
      expect(await tx`SELECT 1 FROM eventos_outbox`).toHaveLength(0)
    })
    // o tenant A não enxerga nem altera o evento do tenant B; definir a variável não dá acesso ao app
    await comTenant(app, a, async (tx) => {
      await tx`SELECT set_config('app.outbox_alertas', '1', true)`
      expect(await tx`SELECT 1 FROM eventos_outbox WHERE id = ${eb}`).toHaveLength(0)
      expect(
        await tx`UPDATE eventos_outbox SET tratado_em = now() WHERE id = ${eb} RETURNING id`,
      ).toHaveLength(0)
    })
    expect((await linha(b, eb))?.tratado_em).toBeNull()
  })

  it('só o leadtogo_app executa as funções (PUBLIC não)', async () => {
    const r = await owner<{ n: string }[]>`
      SELECT count(*)::text AS n FROM information_schema.routine_privileges
      WHERE routine_name IN ('app_contar_eventos_esgotados', 'app_listar_eventos_esgotados', 'app_tratar_evento_esgotado')
        AND grantee = 'PUBLIC'`
    expect(r[0]?.n).toBe('0')
  })
})

describe('tratamento de um evento esgotado', () => {
  it('reprocessar: volta ao relay, registra quem e quando e deixa de contar', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const id = await esgotado(t, { conviteId: 'c9' })
    const antes = await contar()
    expect(await tratar(id, 'reprocessar', '  Ale  ')).toBe(true)
    expect(await contar()).toBe(antes - 1)
    const e = await linha(t, id)
    expect(e).toMatchObject({
      falhou_em: null,
      tentativas: 0,
      tratado_por: 'Ale',
      tratamento: 'reprocessado',
    })
    expect(e?.tratado_em).toBeInstanceOf(Date)
    expect(e?.payload).toEqual({ conviteId: 'c9' })
    const reservados = await app<{ id: string }[]>`SELECT id FROM app_reservar_eventos(200, 60)`
    expect(reservados.map((x) => x.id)).toContain(id)
    // não se trata duas vezes o mesmo esgotamento
    expect(await tratar(id, 'descartar')).toBe(false)
  })

  it('um reprocessado que esgota de novo volta a contar', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const id = await esgotado(t)
    await tratar(id, 'reprocessar')
    const antes = await contar()
    await comTenant(
      app,
      t,
      (tx) =>
        tx`UPDATE eventos_outbox SET falhou_em = clock_timestamp(), tentativas = 8 WHERE id = ${id}`,
    )
    expect(await contar()).toBe(antes + 1)
    expect((await listar()).map((x) => x.id)).toContain(id)
    expect(await tratar(id, 'descartar', 'Ale')).toBe(true)
    expect(await contar()).toBe(antes)
  })

  it('descartar: apaga o payload, registra o tratamento, ignora na contagem e nunca é reservado', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const id = await esgotado(t)
    const antes = await contar()
    expect(await tratar(id, 'descartar', 'Ale')).toBe(true)
    expect(await contar()).toBe(antes - 1)
    expect((await listar()).map((x) => x.id)).not.toContain(id)
    const e = await linha(t, id)
    expect(e).toMatchObject({ payload: {}, tratado_por: 'Ale', tratamento: 'descartado' })
    expect(e?.falhou_em).not.toBeNull() // o histórico da falha fica
    expect(
      (await app<{ id: string }[]>`SELECT id FROM app_reservar_eventos(200, 60)`).map((x) => x.id),
    ).not.toContain(id)
    expect(await tratar(id, 'reprocessar')).toBe(false)
  })

  it('não trata o que não está esgotado nem o que não existe', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const pendente = await novoEvento(t)
    const entregue = await novoEvento(t, 'processado_em = now()')
    for (const id of [pendente, entregue, novoId()]) {
      expect(await tratar(id, 'descartar')).toBe(false)
      expect(await tratar(id, 'reprocessar')).toBe(false)
    }
    expect((await linha(t, pendente))?.tratado_em).toBeNull()
  })

  it('exige ação válida e o nome de quem trata', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const id = await esgotado(t)
    await expect(tratar(id, 'apagar')).rejects.toThrow(/ação inválida/)
    await expect(tratar(id, 'descartar', '   ')).rejects.toThrow(/quem trata/)
    await expect(tratar(id, 'descartar', 'x'.repeat(101))).rejects.toThrow(/quem trata/)
    expect((await linha(t, id))?.tratado_em).toBeNull()
  })

  it('a restrição da coluna só aceita os dois tratamentos', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const id = await esgotado(t)
    await expect(
      comTenant(
        app,
        t,
        (tx) => tx`UPDATE eventos_outbox SET tratamento = 'outro' WHERE id = ${id}`,
      ),
    ).rejects.toThrow(/eventos_outbox_tratamento_ck/)
  })
})

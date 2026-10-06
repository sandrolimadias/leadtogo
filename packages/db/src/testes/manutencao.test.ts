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

const chamar = async (fn: string, ...args: number[]) =>
  Number(Object.values((await app.unsafe(`SELECT ${fn}(${args.join(', ')}) AS r`))[0] ?? {})[0])

/** Ajusta colunas de um registro como o dono (o app não pode alterar a idade de um registro). */
const ajustar = (tenantId: string, tabela: string, id: string, set: string) =>
  comTenant(owner, tenantId, (tx) => tx.unsafe(`UPDATE ${tabela} SET ${set} WHERE id = '${id}'`))
const existe = (tenantId: string, tabela: string, id: string) =>
  comTenant(
    app,
    tenantId,
    async (tx) => (await tx.unsafe(`SELECT 1 FROM ${tabela} WHERE id = '${id}'`)).length === 1,
  )

describe('app_manter_particoes_auditoria', () => {
  it('recria a partição que faltar, é idempotente e nunca passa de 12 meses à frente', async () => {
    const nome =
      (
        await owner<{ nome: string }[]>`
      SELECT 'auditoria_' || to_char(date_trunc('month', now()) + interval '5 months', 'YYYY_MM') AS nome`
      )[0]?.nome ?? ''
    await owner.unsafe(`DROP TABLE IF EXISTS ${nome}`)
    expect((await owner`SELECT to_regclass(${'public.' + nome}) AS r`)[0]?.['r']).toBeNull()

    expect(await chamar('app_manter_particoes_auditoria', 12)).toBeGreaterThanOrEqual(1)
    expect((await owner`SELECT to_regclass(${'public.' + nome}) AS r`)[0]?.['r']).not.toBeNull()
    expect(await chamar('app_manter_particoes_auditoria', 12)).toBe(0) // nada a criar

    // limite fixo: 99 vira 12 (a partição de +13 meses não é criada)
    const alem =
      (
        await owner<{ alem: string }[]>`
      SELECT 'auditoria_' || to_char(date_trunc('month', now()) + interval '13 months', 'YYYY_MM') AS alem`
      )[0]?.alem ?? ''
    await chamar('app_manter_particoes_auditoria', 99)
    expect((await owner`SELECT to_regclass(${'public.' + alem}) AS r`)[0]?.['r']).toBeNull()
  })

  it('a partição recriada nasce com RLS forçado e sem políticas (como as outras)', async () => {
    const [p] = await owner<{ rls: boolean; forcado: boolean; politicas: number }[]>`
      SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forcado,
             (SELECT count(*)::int FROM pg_policy WHERE polrelid = c.oid) AS politicas
      FROM pg_class c WHERE c.relname = 'auditoria_' || to_char(date_trunc('month', now()) + interval '5 months', 'YYYY_MM')`
    expect(p).toEqual({ rls: true, forcado: true, politicas: 0 })
  })

  it('duas execuções simultâneas não brigam pelo CREATE TABLE', async () => {
    const nome =
      (
        await owner<{ nome: string }[]>`
      SELECT 'auditoria_' || to_char(date_trunc('month', now()) + interval '6 months', 'YYYY_MM') AS nome`
      )[0]?.nome ?? ''
    await owner.unsafe(`DROP TABLE IF EXISTS ${nome}`)
    const r = await Promise.all([1, 2, 3].map(() => chamar('app_manter_particoes_auditoria', 12)))
    expect(r.reduce((a, b) => a + b, 0)).toBe(1) // exatamente uma criou
  })
})

async function convite(tenantId: string, membroId: string, ajuste: string) {
  const id = novoId()
  await comTenant(app, tenantId, async (tx) => {
    await tx`INSERT INTO convites (id, tenant_id, email, papel, token_hash, expira_em, convidado_por)
      VALUES (${id}, ${tenantId}, ${`c-${id}@exemplo.com`}, 'vendedor', ${id}, now() + interval '7 days', ${membroId})`
  })
  await ajustar(tenantId, 'convites', id, ajuste)
  return id
}
async function membro(tenantId: string) {
  const id = novoId()
  await comTenant(
    app,
    tenantId,
    (tx) =>
      tx`INSERT INTO membros (id, tenant_id, nome) VALUES (${id}, ${tenantId}, 'Quem convida')`,
  )
  return id
}

describe('app_limpar_convites', () => {
  it('apaga só cancelados e vencidos há mais de 30 dias, de qualquer tenant; os demais ficam', async () => {
    const [a, b] = [novoId(), novoId()]
    await prepararTenants(owner, [a, b])
    const [ma, mb] = [await membro(a), await membro(b)]
    const velhoRevogado = await convite(a, ma, "revogado_em = now() - interval '31 days'")
    const velhoVencido = await convite(b, mb, "expira_em = now() - interval '31 days'")
    const recenteRevogado = await convite(a, ma, "revogado_em = now() - interval '5 days'")
    const recenteVencido = await convite(b, mb, "expira_em = now() - interval '5 days'")
    const aceitoAntigo = await convite(
      a,
      ma,
      "aceito_em = now() - interval '90 days', expira_em = now() - interval '80 days'",
    )
    const pendente = await convite(b, mb, 'atualizado_em = now()')

    expect(await chamar('app_limpar_convites', 5000)).toBeGreaterThanOrEqual(2)
    expect(await existe(a, 'convites', velhoRevogado)).toBe(false)
    expect(await existe(b, 'convites', velhoVencido)).toBe(false)
    for (const [t, id] of [
      [a, recenteRevogado],
      [b, recenteVencido],
      [a, aceitoAntigo],
      [b, pendente],
    ] as const) {
      expect(await existe(t, 'convites', id), id).toBe(true)
    }
    expect(await chamar('app_limpar_convites', 5000)).toBe(0) // nada mais a apagar
  })

  it('o lote é limitado: com lote 1 apaga um por vez', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const m = await membro(t)
    const ids = [
      await convite(t, m, "revogado_em = now() - interval '40 days'"),
      await convite(t, m, "revogado_em = now() - interval '40 days'"),
    ]
    await chamar('app_limpar_convites', 5000) // esvazia o que outros testes deixaram
    const [x, y] = [
      await convite(t, m, "revogado_em = now() - interval '40 days'"),
      await convite(t, m, "revogado_em = now() - interval '40 days'"),
    ]
    expect(ids).toHaveLength(2)
    expect(await chamar('app_limpar_convites', 1)).toBe(1)
    const restantes = [await existe(t, 'convites', x), await existe(t, 'convites', y)].filter(
      Boolean,
    )
    expect(restantes).toHaveLength(1)
    expect(await chamar('app_limpar_convites', 0)).toBe(1) // mínimo 1
  })
})

describe('app_limpar_outbox', () => {
  it('apaga só o entregue há mais de 14 dias; recente, pendente e esgotado (falhou_em) ficam', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const evento = async (ajuste: string) => {
      const id = novoId()
      await comTenant(
        app,
        t,
        (tx) =>
          tx`INSERT INTO eventos_outbox (id, tenant_id, tipo) VALUES (${id}, ${t}, 'teste.evento')`,
      )
      if (ajuste) await ajustar(t, 'eventos_outbox', id, ajuste)
      return id
    }
    const velho = await evento("processado_em = now() - interval '15 days'")
    const recente = await evento("processado_em = now() - interval '5 days'")
    const pendente = await evento('')
    const esgotado = await evento("falhou_em = now() - interval '60 days'")

    expect(await chamar('app_limpar_outbox', 5000)).toBeGreaterThanOrEqual(1)
    expect(await existe(t, 'eventos_outbox', velho)).toBe(false)
    for (const id of [recente, pendente, esgotado])
      expect(await existe(t, 'eventos_outbox', id), id).toBe(true)
  })
})

describe('as três funções de manutenção: sem BYPASSRLS, sem brecha', () => {
  const funcoes = [
    'app_manter_particoes_auditoria(integer)',
    'app_limpar_convites(integer)',
    'app_limpar_outbox(integer)',
  ]
  it.each(funcoes)(
    '%s pertence ao owner, é SECURITY DEFINER com search_path fixo e só o app executa',
    async (f) => {
      const nome = f.split('(')[0]
      const [d] = await owner<{ dono: string; definer: boolean; config: string[] }[]>`
      SELECT pg_get_userbyid(proowner) AS dono, prosecdef AS definer, proconfig AS config FROM pg_proc WHERE proname = ${nome ?? ''}`
      expect(d).toEqual({
        dono: 'leadtogo_owner',
        definer: true,
        config: ['search_path=pg_catalog, pg_temp'],
      })
      const [p] = await owner<{ publico: boolean; app: boolean }[]>`
      SELECT has_function_privilege('public', ${f}, 'EXECUTE') AS publico, has_function_privilege('leadtogo_app', ${f}, 'EXECUTE') AS app`
      expect(p).toEqual({ publico: false, app: true })
    },
  )

  it('o app não ganha leitura nem exclusão fora do tenant ligando a variável por conta própria; e ela é limpa', async () => {
    const t = novoId()
    await prepararTenants(owner, [t])
    const m = await membro(t)
    await convite(t, m, "revogado_em = now() - interval '40 days'")
    await app.begin(async (tx) => {
      await tx`SELECT set_config('app.limpeza_convites', '1', true)`
      await tx`SELECT set_config('app.limpeza_outbox', '1', true)`
      expect(await tx`SELECT 1 FROM convites`).toHaveLength(0)
      expect((await tx`DELETE FROM convites`).count).toBe(0)
      expect(await tx`SELECT 1 FROM eventos_outbox`).toHaveLength(0)
    })
    await app.begin(async (tx) => {
      await tx`SELECT app_limpar_convites(10)`
      await tx`SELECT app_limpar_outbox(10)`
      const [v] = await tx<{ a: string; b: string }[]>`
        SELECT current_setting('app.limpeza_convites', true) AS a, current_setting('app.limpeza_outbox', true) AS b`
      expect([v?.a ?? '', v?.b ?? '']).toEqual(['', ''])
    })
  })
})

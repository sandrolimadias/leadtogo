import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { novoId } from '../id.js'
import { comTenant, conectarApp, conectarOwner } from './conexoes.js'

const app = conectarApp()
const owner = conectarOwner()
const A = novoId()
const B = novoId()

beforeAll(async () => {
  await owner`DROP TABLE IF EXISTS zz_rls_infra`
  await owner`CREATE TABLE zz_rls_infra (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, nome text)`
})
afterAll(async () => {
  await owner`DROP TABLE IF EXISTS zz_rls_infra`
  await app.end()
  await owner.end()
})

describe('extensões e schema', () => {
  it('instala as extensões previstas', async () => {
    const linhas = await owner<{ extname: string }[]>`SELECT extname FROM pg_extension`
    const nomes = linhas.map((l) => l.extname)
    for (const e of ['postgis', 'pgcrypto', 'citext', 'pg_trgm', 'unaccent'])
      expect(nomes).toContain(e)
  })

  it('reserva o schema auth para a identidade: o app opera, mas não cria objetos', async () => {
    const existe = await owner`SELECT 1 FROM pg_namespace WHERE nspname = 'auth'`
    expect(existe).toHaveLength(1)
    const [uso] = await owner<{ usa: boolean; cria: boolean }[]>`
      SELECT has_schema_privilege('leadtogo_app', 'auth', 'USAGE') AS usa,
             has_schema_privilege('leadtogo_app', 'auth', 'CREATE') AS cria`
    expect(uso).toEqual({ usa: true, cria: false })
  })
})

describe('app_tenant_id() e app_tenant_ids()', () => {
  it('sem variáveis: NULL e lista vazia (falha fechada)', async () => {
    const [r] = await app<
      { id: string | null; ids: string[] }[]
    >`SELECT app_tenant_id() AS id, app_tenant_ids() AS ids`
    expect(r).toEqual({ id: null, ids: [] })
  })

  it('leem as variáveis da transação', async () => {
    const r = await comTenant(
      app,
      A,
      async (tx) =>
        (
          await tx<
            { id: string; ids: string[] }[]
          >`SELECT app_tenant_id() AS id, app_tenant_ids() AS ids`
        )[0],
      [A, B],
    )
    expect(r).toEqual({ id: A, ids: [A, B] })
  })

  it('a variável não vaza para a transação seguinte (SET LOCAL)', async () => {
    await comTenant(app, A, (tx) => tx`SELECT 1`)
    const [r] = await app<{ id: string | null }[]>`SELECT app_tenant_id() AS id`
    expect(r?.id).toBeNull()
  })
})

describe('aplicar_rls_tenant()', () => {
  it('liga, força e cria as quatro políticas, e concede o DML ao app', async () => {
    await owner`SELECT aplicar_rls_tenant('zz_rls_infra')`
    const [rel] = await owner<{ rls: boolean; forca: boolean }[]>`
      SELECT relrowsecurity AS rls, relforcerowsecurity AS forca FROM pg_class WHERE relname = 'zz_rls_infra'`
    expect(rel).toEqual({ rls: true, forca: true })
    const pol = await owner<{ polname: string }[]>`
      SELECT polname FROM pg_policy WHERE polrelid = 'zz_rls_infra'::regclass ORDER BY polname`
    expect(pol.map((p) => p.polname)).toEqual([
      'tenant_delete',
      'tenant_insert',
      'tenant_select',
      'tenant_update',
    ])
    await expect(
      comTenant(app, A, (tx) => tx`SELECT count(*) FROM zz_rls_infra`),
    ).resolves.toBeDefined()
  })

  it('pode ser repetida sem erro', async () => {
    await owner`SELECT aplicar_rls_tenant('zz_rls_infra')`
    await owner`SELECT aplicar_rls_tenant('zz_rls_infra')`
  })

  it('o app não executa a função (só o owner)', async () => {
    await expect(app`SELECT aplicar_rls_tenant('zz_rls_infra')`).rejects.toThrow(
      /permission denied/,
    )
  })

  it('o app grava e lê só o próprio tenant', async () => {
    await comTenant(
      app,
      A,
      (tx) => tx`INSERT INTO zz_rls_infra (id, tenant_id, nome) VALUES (${novoId()}, ${A}, 'a')`,
    )
    await expect(
      comTenant(
        app,
        A,
        (tx) => tx`INSERT INTO zz_rls_infra (id, tenant_id, nome) VALUES (${novoId()}, ${B}, 'b')`,
      ),
    ).rejects.toThrow(/row-level security/)
    const vistas = await comTenant(app, B, (tx) => tx`SELECT * FROM zz_rls_infra`)
    expect(vistas).toHaveLength(0)
  })
})

describe('por que o FORCE é necessário', () => {
  it('sem FORCE o dono ignora o RLS; com FORCE ele também é filtrado', async () => {
    await owner`DROP TABLE IF EXISTS zz_rls_sem_force`
    await owner`CREATE TABLE zz_rls_sem_force (id uuid PRIMARY KEY, tenant_id uuid NOT NULL)`
    await owner`ALTER TABLE zz_rls_sem_force ENABLE ROW LEVEL SECURITY`
    await owner`CREATE POLICY p ON zz_rls_sem_force USING (tenant_id = app_tenant_id())`
    await owner`INSERT INTO zz_rls_sem_force VALUES (${novoId()}, ${A}), (${novoId()}, ${B})`

    // Sem FORCE: o owner, sem tenant nenhum, enxerga tudo
    expect(await owner`SELECT * FROM zz_rls_sem_force`).toHaveLength(2)

    await owner`ALTER TABLE zz_rls_sem_force FORCE ROW LEVEL SECURITY`
    expect(await owner`SELECT * FROM zz_rls_sem_force`).toHaveLength(0)
    await owner`DROP TABLE zz_rls_sem_force`
  })
})

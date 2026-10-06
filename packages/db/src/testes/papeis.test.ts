import { afterAll, describe, expect, it } from 'vitest'

import { conectarApp, conectarOwner } from './conexoes.js'

const app = conectarApp()
const owner = conectarOwner()
afterAll(async () => {
  await app.end()
  await owner.end()
})

describe('papéis do banco de teste', () => {
  it('conecta como os papéis certos, em leadtogo_test', async () => {
    const [a] = await app`SELECT current_user AS usuario, current_database() AS banco`
    const [o] = await owner`SELECT current_user AS usuario, current_database() AS banco`
    expect(a).toEqual({ usuario: 'leadtogo_app', banco: 'leadtogo_test' })
    expect(o).toEqual({ usuario: 'leadtogo_owner', banco: 'leadtogo_test' })
  })

  it('nenhum dos dois é superusuário nem ignora o RLS', async () => {
    const papeis = await owner`
      SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
      FROM pg_roles WHERE rolname IN ('leadtogo_app', 'leadtogo_owner') ORDER BY rolname`
    expect(papeis).toHaveLength(2)
    for (const p of papeis) {
      expect(p).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
        rolcreatedb: false,
        rolcreaterole: false,
      })
    }
  })

  it('o app não é dono de nenhuma tabela e o owner é dono do banco', async () => {
    const [donos] = await owner<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner
      WHERE r.rolname = 'leadtogo_app' AND c.relkind IN ('r', 'p')`
    expect(donos?.n).toBe(0)
    const [banco] = await owner<{ dono: string }[]>`
      SELECT datdba::regrole::text AS dono FROM pg_database WHERE datname = current_database()`
    expect(banco?.dono).toBe('leadtogo_owner')
  })

  it('o app não cria objetos no schema public', async () => {
    await expect(app`CREATE TABLE public.intruso (id int)`).rejects.toThrow(/permission denied/)
  })
})

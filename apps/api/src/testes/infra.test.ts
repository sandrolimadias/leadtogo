import { criarConexao } from '@leadtogo/db'
import { afterAll, describe, expect, it } from 'vitest'

// Garante que o ambiente de teste da API é o certo: banco próprio, migrado, e o papel da aplicação.
const { cliente } = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 1 })
afterAll(() => cliente.end())

describe('ambiente de teste da API', () => {
  it('usa o banco leadtogo_api_test com o papel leadtogo_app', async () => {
    const [r] = await cliente<{ banco: string; usuario: string }[]>`
      SELECT current_database() AS banco, current_user AS usuario`
    expect(r).toEqual({ banco: 'leadtogo_api_test', usuario: 'leadtogo_app' })
  })

  it('já está migrado do zero', async () => {
    const [r] = await cliente<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('tenants', 'membros')`
    expect(r?.n).toBe(2)
  })
})

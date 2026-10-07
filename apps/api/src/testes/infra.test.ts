import { criarConexao } from '@leadtogo/db'
import { afterAll, describe, expect, it } from 'vitest'

// Garante que o ambiente de teste da API é o certo: banco próprio, migrado, e o papel da aplicação.
const { cliente } = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 1 })
afterAll(() => cliente.end())

// O banco é o da URL de teste (leadtogo_api_test; no `pnpm verificar:zero`, um banco temporário)
const bancoEsperado = new URL(
  process.env['DATABASE_URL'] ?? 'postgres://x/leadtogo_api_test',
).pathname.slice(1)

describe('ambiente de teste da API', () => {
  it('usa o banco de teste da API com o papel leadtogo_app', async () => {
    const [r] = await cliente<{ banco: string; usuario: string }[]>`
      SELECT current_database() AS banco, current_user AS usuario`
    expect(r).toEqual({ banco: bancoEsperado, usuario: 'leadtogo_app' })
  })

  it('já está migrado do zero', async () => {
    const [r] = await cliente<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('tenants', 'membros')`
    expect(r?.n).toBe(2)
  })
})

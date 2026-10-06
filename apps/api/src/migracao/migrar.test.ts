import { zerarSchema } from '@leadtogo/db/testes'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { migrar } from './migrar.js'

const urlOwner = process.env['TEST_API_DATABASE_MIGRATION_URL'] ?? ''
const owner = postgres(urlOwner, { max: 2, onnotice: () => {} })
afterAll(async () => {
  await owner.end()
  // deixa o banco migrado para os demais testes
  await migrar({ DATABASE_MIGRATION_URL: urlOwner })
})

const tabelas = async () =>
  (
    await owner<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('tenants', 'membros', 'cnaes')`
  ).map((t) => t.tablename)
const registradas = async () =>
  (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`)[0]?.n

describe('migrar() (o que roda em dist/migrate.js)', () => {
  beforeEach(async () => {
    await zerarSchema(urlOwner)
  })

  it('migra um banco vazio do zero, só com o migrador do drizzle-orm', async () => {
    expect(await tabelas()).toEqual([])
    await migrar({ DATABASE_MIGRATION_URL: urlOwner })
    expect((await tabelas()).sort()).toEqual(['cnaes', 'membros', 'tenants'])
    expect(await registradas()).toBeGreaterThanOrEqual(5)
  })

  it('pode ser repetido: sem migração pendente não faz nada', async () => {
    await migrar({ DATABASE_MIGRATION_URL: urlOwner })
    const antes = await registradas()
    await migrar({ DATABASE_MIGRATION_URL: urlOwner })
    expect(await registradas()).toBe(antes)
  })

  it('dois deploys ao mesmo tempo: a trava faz um esperar o outro, sem erro nem duplicar', async () => {
    await Promise.all([
      migrar({ DATABASE_MIGRATION_URL: urlOwner }),
      migrar({ DATABASE_MIGRATION_URL: urlOwner }),
    ])
    const antes = await registradas()
    expect(antes).toBeGreaterThanOrEqual(5)
    await migrar({ DATABASE_MIGRATION_URL: urlOwner })
    expect(await registradas()).toBe(antes)
  })

  it('deixa as tabelas acessíveis ao leadtogo_app (permissões e RLS vêm das migrações)', async () => {
    await migrar({ DATABASE_MIGRATION_URL: urlOwner })
    const app = postgres(process.env['TEST_API_DATABASE_URL'] ?? '', { max: 1 })
    try {
      expect(await app`SELECT 1 FROM cnaes`).toHaveLength(0)
      expect(await app`SELECT 1 FROM tenants`).toHaveLength(0)
    } finally {
      await app.end()
    }
  })

  it('falha com mensagem clara sem a URL, com URL inválida ou com credencial errada', async () => {
    await expect(migrar({})).rejects.toThrow('DATABASE_MIGRATION_URL não definida')
    await expect(migrar({ DATABASE_MIGRATION_URL: 'mysql://x' })).rejects.toThrow(
      'deve ser uma URL postgres',
    )
    const errada = new URL(urlOwner)
    errada.password = 'senha-errada'
    const erro = await migrar({ DATABASE_MIGRATION_URL: errada.toString() }).catch(
      (e: unknown) => e,
    )
    expect(erro).toBeInstanceOf(Error)
    expect(String((erro as Error).message)).not.toContain('senha-errada')
  })

  it('o app (leadtogo_app) não consegue migrar: só o dono das tabelas', async () => {
    await migrar({ DATABASE_MIGRATION_URL: urlOwner })
    await expect(
      migrar({ DATABASE_MIGRATION_URL: process.env['TEST_API_DATABASE_URL'] ?? '' }),
    ).rejects.toThrow()
  })
})

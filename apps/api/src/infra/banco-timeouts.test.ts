import type { Server } from 'node:http'

import type { Conexao } from '@leadtogo/db'
import type { INestApplication } from '@nestjs/common'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { dono } from '../testes/mundo.js'
import { BANCO } from './infra.module.js'

afterAll(() => dono.end())

let app: INestApplication<Server>
afterEach(() => app.close())

const abrir = async (troca: Record<string, string> = {}) => {
  app = await criarAppComRotas([], configuracaoDeTeste(troca))
  return app.get<Conexao>(BANCO)
}

describe('rede de segurança no Postgres (papel da API)', () => {
  it('a conexão da API nasce com statement_timeout (15 s) e idle_in_transaction_session_timeout (30 s)', async () => {
    const banco = await abrir()
    const [a] = await banco.cliente<{ statement_timeout: string }[]>`SHOW statement_timeout`
    const [b] = await banco.cliente<
      { idle_in_transaction_session_timeout: string }[]
    >`SHOW idle_in_transaction_session_timeout`
    expect(a?.statement_timeout).toBe('15s')
    expect(b?.idle_in_transaction_session_timeout).toBe('30s')
  })

  it('consulta que passa do prazo é cancelada pelo Postgres', async () => {
    const banco = await abrir({ DB_STATEMENT_TIMEOUT_MS: '1000' })
    await expect(banco.cliente`SELECT pg_sleep(3)`).rejects.toMatchObject({ code: '57014' })
    // a conexão segue utilizável
    expect(await banco.cliente`SELECT 1 AS um`).toHaveLength(1)
  })

  it('transação esquecida (parada sem comando) é derrubada pelo Postgres', async () => {
    const banco = await abrir({ DB_IDLE_TX_TIMEOUT_MS: '1000' })
    await expect(
      banco.db.transaction(async (tx) => {
        await tx.execute('SELECT 1')
        await new Promise((resolver) => setTimeout(resolver, 2500))
        await tx.execute('SELECT 2')
      }),
    ).rejects.toBeDefined()
    // a transação presa não consome o pool: a próxima consulta passa
    expect(await banco.cliente`SELECT 1 AS um`).toHaveLength(1)
  })
})

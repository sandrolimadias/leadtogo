import { createHash } from 'node:crypto'

import { criarConexao, novoId, type Conexao } from '@leadtogo/db'
import { Redis } from 'ioredis'
import { pino } from 'pino'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { EnviadorSmtp } from '../../email/enviador.js'
import { configuracaoDeTeste } from '../../testes/app-teste.js'
import { aguardarMensagem, mensagensPara, primeiroLink } from '../../testes/mailpit.js'
import { dono, empresaDeOutraConta } from '../../testes/mundo.js'
import { emailUnico } from '../../testes/auth-teste.js'
import { WorkerFilas } from '../worker-filas.service.js'
import { manipuladoresPadrao } from './manipuladores.js'
import { RelayDoOutbox } from './relay.js'

const log = pino({ level: 'silent' })
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
const banco: Conexao = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 4 })
let filas: WorkerFilas
let prefixo = ''
let n = 0
beforeEach(() => {
  n += 1
  prefixo = `leadtogo:fila:c${Date.now()}-${n}`
  filas = new WorkerFilas(configuracaoDeTeste({ FILA_PREFIXO: prefixo }), log)
})
afterEach(async () => {
  await filas.encerrar(2000)
})
afterAll(async () => {
  valkey.disconnect()
  await banco.cliente.end({ timeout: 5 })
  await dono.end()
})

const relay = (troca: Record<string, string> = {}) => {
  const config = configuracaoDeTeste({ FILA_PREFIXO: prefixo, ...troca })
  return new RelayDoOutbox({
    banco,
    filas,
    log,
    maxTentativas: 3,
    manipuladores: manipuladoresPadrao(config, new EnviadorSmtp(config, log)),
  })
}
const hash = (t: string) => createHash('sha256').update(t).digest('hex')

/** Convite + evento de envio gravados juntos, como a API faz (token_hash = valor que ninguém conhece). */
async function conviteComEvento() {
  const { tenantId } = await empresaDeOutraConta()
  const email = emailUnico('conv')
  const conviteId = novoId()
  const placeholder = hash(`ninguem-${conviteId}`)
  await dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    const [m] = await tx<{ id: string }[]>`
      INSERT INTO membros (id, tenant_id, nome, papel) VALUES (${novoId()}, ${tenantId}, 'Quem Convida', 'admin') RETURNING id`
    await tx`INSERT INTO convites (id, tenant_id, email, papel, token_hash, expira_em, convidado_por)
      VALUES (${conviteId}, ${tenantId}, ${email}, 'vendedor', ${placeholder}, now() + interval '7 days', ${m?.id ?? ''})`
    await tx`INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
      VALUES (${novoId()}, ${tenantId}, 'convite.enviar', ${conviteId}, ${JSON.stringify({ conviteId })}::jsonb)`
  })
  const hashAtual = () =>
    dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      return (
        await tx<{ token_hash: string }[]>`SELECT token_hash FROM convites WHERE id = ${conviteId}`
      )[0]?.token_hash
    })
  return { tenantId, email, conviteId, placeholder, hashAtual }
}

describe('convite.enviar (token gerado pelo worker, só o hash no banco)', () => {
  it('envia o e-mail, grava o hash do token do link e o token não fica no outbox nem no Valkey', async () => {
    const c = await conviteComEvento()
    await relay().rodarCiclo()
    const mensagem = await aguardarMensagem(c.email)
    const token = new URL(primeiroLink(mensagem)).searchParams.get('token') ?? ''
    expect(token).toHaveLength(43)
    expect(await c.hashAtual()).toBe(hash(token))
    expect(await c.hashAtual()).not.toBe(c.placeholder)

    // nada de token no outbox...
    const eventos = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`
      return JSON.stringify(
        await tx`SELECT * FROM eventos_outbox WHERE entidade_id = ${c.conviteId}`,
      )
    })
    expect(eventos).not.toContain(token)
    // ...nem em nenhuma chave do Valkey
    let cursor = '0'
    do {
      const [proximo, chaves] = await valkey.scan(cursor, 'MATCH', 'leadtogo:*', 'COUNT', 500)
      cursor = proximo
      for (const chave of chaves) {
        const tipo = await valkey.type(chave)
        const conteudo =
          tipo === 'hash'
            ? JSON.stringify(await valkey.hgetall(chave))
            : tipo === 'string'
              ? ((await valkey.get(chave)) ?? '')
              : ''
        expect(conteudo.includes(token), chave).toBe(false)
      }
    } while (cursor !== '0')
  })

  it('SMTP fora do ar: nada é gravado (o hash segue o antigo), o evento volta com espera e depois entrega', async () => {
    const c = await conviteComEvento()
    const r = await relay({ SMTP_PORT: '1' }).rodarCiclo()
    expect(r.falhas).toBeGreaterThanOrEqual(1)
    expect(await c.hashAtual()).toBe(c.placeholder) // transação desfeita
    expect(await mensagensPara(c.email)).toHaveLength(0)
    const [e] = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`
      return tx<{ tentativas: number; ultimo_erro: string; proxima_tentativa_em: Date }[]>`
        SELECT tentativas, ultimo_erro, proxima_tentativa_em FROM eventos_outbox WHERE entidade_id = ${c.conviteId}`
    })
    expect(e?.tentativas).toBe(1)
    expect(e?.ultimo_erro).toBeTruthy()
    expect(e?.proxima_tentativa_em).toBeTruthy()

    // o SMTP volta e a espera passa: entrega e grava o hash
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`
      await tx`UPDATE eventos_outbox SET proxima_tentativa_em = now() - interval '1 second' WHERE entidade_id = ${c.conviteId}`
    })
    await relay().rodarCiclo()
    const token =
      new URL(primeiroLink(await aguardarMensagem(c.email))).searchParams.get('token') ?? ''
    expect(await c.hashAtual()).toBe(hash(token))
  })

  it('convite cancelado antes do envio: nenhum e-mail, nenhum token', async () => {
    const c = await conviteComEvento()
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`
      await tx`UPDATE convites SET revogado_em = now() WHERE id = ${c.conviteId}`
    })
    await relay().rodarCiclo()
    expect(await mensagensPara(c.email)).toHaveLength(0)
    expect(await c.hashAtual()).toBe(c.placeholder)
  })
})

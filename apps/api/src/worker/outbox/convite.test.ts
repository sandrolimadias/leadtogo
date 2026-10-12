import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:net'

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

  it('SMTP fora do ar: nenhum e-mail sai, o hash gravado nunca foi entregue, o evento volta com espera e a nova tentativa gera token novo', async () => {
    const c = await conviteComEvento()
    const r = await relay({ SMTP_PORT: '1' }).rodarCiclo()
    expect(r.falhas).toBeGreaterThanOrEqual(1)
    const hashSemEntrega = await c.hashAtual()
    expect(hashSemEntrega).not.toBe(c.placeholder) // o hash já foi gravado (commit antes do envio)...
    expect(await mensagensPara(c.email)).toHaveLength(0) // ...mas nenhum link chegou a ninguém
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
    expect(hash(token)).not.toBe(hashSemEntrega) // token novo na nova tentativa
  })

  it('o hash já está commitado quando o e-mail chega: clicar logo no link nunca dá convite inválido (atraso de 400 ms depois do envio)', async () => {
    const c = await conviteComEvento()
    const config = configuracaoDeTeste({ FILA_PREFIXO: prefixo })
    const real = new EnviadorSmtp(config, log)
    const lento = {
      enviar: async (...a: Parameters<EnviadorSmtp['enviar']>) => {
        await real.enviar(...a)
        await new Promise((res) => setTimeout(res, 400)) // a corrida: o relay ainda não terminou
      },
    } as EnviadorSmtp
    const ciclo = new RelayDoOutbox({
      banco,
      filas,
      log,
      manipuladores: manipuladoresPadrao(config, lento),
    }).rodarCiclo()
    const token =
      new URL(primeiroLink(await aguardarMensagem(c.email))).searchParams.get('token') ?? ''
    expect(await c.hashAtual()).toBe(hash(token)) // lido com o relay ainda dentro do atraso
    await ciclo
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

  it('SMTP que não responde: a falha vem dentro do prazo, a conexão volta ao pool e o relay tenta de novo', async () => {
    // Servidor que aceita a conexão e nunca fala (nem o "220" do SMTP)
    const mudo: Server = createServer(() => undefined)
    await new Promise<void>((r) => mudo.listen(0, '127.0.0.1', r))
    const porta = (mudo.address() as { port: number }).port
    // Pool de UMA conexão: se a transação a segurasse, o SELECT 1 abaixo travaria
    const pequeno = criarConexao(process.env['DATABASE_URL'] ?? '', { max: 1 })
    try {
      const c = await conviteComEvento()
      const config = configuracaoDeTeste({
        FILA_PREFIXO: prefixo,
        SMTP_PORT: String(porta),
        SMTP_HOST: '127.0.0.1',
        SMTP_TIMEOUT_MS: '1000',
      })
      const surdo = new RelayDoOutbox({
        banco: pequeno,
        filas,
        log,
        maxTentativas: 3,
        manipuladores: manipuladoresPadrao(config, new EnviadorSmtp(config, log)),
      })
      const inicio = Date.now()
      const r = await surdo.rodarCiclo()
      const gasto = Date.now() - inicio
      expect(r.falhas).toBeGreaterThanOrEqual(1)
      expect(gasto).toBeLessThan(1000 + 2500) // o prazo de 1 s, com folga; nunca os 10 s do padrão

      expect(await c.hashAtual()).not.toBe(c.placeholder) // hash gravado, mas nenhum link saiu
      expect(await mensagensPara(c.email)).toHaveLength(0)
      // a única conexão do pool voltou: responde na hora
      await expect(
        Promise.race([
          pequeno.cliente`SELECT 1 AS x`,
          new Promise((_, rej) => setTimeout(() => rej(new Error('pool preso')), 2000)),
        ]),
      ).resolves.toBeTruthy()
      // e o evento ficou agendado para nova tentativa, com o motivo
      const [e] = await dono.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`
        return tx<
          {
            tentativas: number
            ultimo_erro: string
            proxima_tentativa_em: Date | null
            reservado_ate: Date | null
          }[]
        >`
          SELECT tentativas, ultimo_erro, proxima_tentativa_em, reservado_ate FROM eventos_outbox WHERE entidade_id = ${c.conviteId}`
      })
      expect(e?.tentativas).toBe(1)
      expect(e?.ultimo_erro).toMatch(/respond|timeout|tempo|ETIMEDOUT/i)
      expect(e?.proxima_tentativa_em).toBeTruthy()
      expect(e?.reservado_ate).toBeNull()

      // com o SMTP de volta e a espera vencida, o relay entrega
      await dono.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${c.tenantId}, true)`
        await tx`UPDATE eventos_outbox SET proxima_tentativa_em = now() - interval '1 second' WHERE entidade_id = ${c.conviteId}`
      })
      await relay().rodarCiclo()
      const token =
        new URL(primeiroLink(await aguardarMensagem(c.email))).searchParams.get('token') ?? ''
      expect(await c.hashAtual()).toBe(hash(token))
    } finally {
      await pequeno.cliente.end({ timeout: 5 })
      mudo.close()
    }
  }, 30_000)
})

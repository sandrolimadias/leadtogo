import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { carregarConfiguracao } from '../configuracao/configuracao.js'
import { ErroApi } from '../http/erro-api.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import { emailUnico } from '../testes/auth-teste.js'
import { aguardarMensagem, mensagensPara, primeiroLink } from '../testes/mailpit.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import { FILAS } from '../worker/filas.js'
import { EmailService, type JobDeEmail } from './email.service.js'
import { emailRedefinirSenha } from './modelos.js'
import { esperarAte } from '../testes/espera.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '', { maxRetriesPerRequest: 1 })
const limpar: (() => Promise<unknown>)[] = []
let n = 0
afterEach(async () => {
  for (const f of limpar.splice(0).reverse()) await f()
})
afterAll(() => {
  valkey.disconnect()
})

/** Cada teste usa um prefixo de fila próprio. */
async function cenario(troca: Record<string, string> = {}, comWorker = true) {
  n += 1
  const prefixo = `leadtogo:fila:e${Date.now()}-${n}`
  const config = configuracaoDeTeste({ FILA_PREFIXO: prefixo, EMAIL_TENTATIVAS: '3', ...troca })
  const servico = new EmailService(config, valkey)
  const fila = new Queue<JobDeEmail>(FILAS.email, { connection: valkey, prefix: prefixo })
  limpar.push(async () => {
    await fila.obliterate({ force: true }).catch(() => undefined)
    await fila.close()
    await servico.onModuleDestroy()
  })
  if (comWorker) {
    const w = await subirWorkerDeTeste({ FILA_PREFIXO: prefixo, EMAIL_TENTATIVAS: '3', ...troca })
    limpar.push(() => w.parar())
  }
  return { servico, fila, config }
}

describe('TOKEN_ENCRYPTION_KEY (configuração)', () => {
  const base = {
    APP_URL: 'https://crm.aledias.com.br',
    API_URL: 'https://api.crm.aledias.com.br',
    DATABASE_URL: 'postgres://u:s@localhost:5432/d',
    REDIS_URL: 'redis://localhost:6379',
    BETTER_AUTH_SECRET: 'um-segredo-de-teste-com-mais-de-32-caracteres',
    S3_ENDPOINT: 'http://localhost:3900',
    S3_BUCKET: 'b',
    S3_ACCESS_KEY: 'a',
    S3_SECRET_KEY: 's',
    SMTP_HOST: 'smtp.exemplo.com',
  }
  it('é obrigatória em produção, opcional no resto, e precisa ter 32 bytes', () => {
    expect(() => carregarConfiguracao({ ...base, NODE_ENV: 'production' })).toThrow(
      /TOKEN_ENCRYPTION_KEY/,
    )
    expect(() =>
      carregarConfiguracao({ ...base, NODE_ENV: 'production', TOKEN_ENCRYPTION_KEY: 'curta' }),
    ).toThrow(/32 bytes/)
    const ok = carregarConfiguracao({
      ...base,
      NODE_ENV: 'production',
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    })
    expect(ok.TOKEN_ENCRYPTION_KEY).toBeDefined()
    expect(
      carregarConfiguracao({ ...base, NODE_ENV: 'development' }).TOKEN_ENCRYPTION_KEY,
    ).toBeUndefined()
  })
})

describe('e-mail de identidade pela fila', () => {
  it('a API só enfileira, com o conteúdo cifrado (sem link nem destinatário legíveis); o worker envia e limpa o job', async () => {
    const { servico, fila } = await cenario({}, false)
    const para = emailUnico('fila')
    const link = 'http://localhost:5173/redefinir?token=TOKEN-SECRETO-123'
    await servico.enfileirar(para, emailRedefinirSenha('Ana', link))
    expect(await mensagensPara(para)).toHaveLength(0) // a API não enviou nada

    const [job] = await fila.getJobs(['waiting', 'delayed', 'active'])
    expect(job?.data.p).toMatch(/^v1:/)
    const bruto = JSON.stringify(
      await valkey.hgetall(`${fila.opts.prefix}:${FILAS.email}:${job?.id}`),
    )
    expect(bruto).not.toContain('TOKEN-SECRETO-123')
    expect(bruto).not.toContain(para)
    expect(job?.opts.attempts).toBe(3)
    expect(job?.opts.backoff).toEqual({ type: 'exponential', delay: 50 })

    // agora sobe o worker: ele consome e envia
    const w = await subirWorkerDeTeste({
      FILA_PREFIXO: fila.opts.prefix ?? '',
      EMAIL_TENTATIVAS: '3',
    })
    limpar.push(() => w.parar())
    const mensagem = await aguardarMensagem(para)
    expect(primeiroLink(mensagem)).toBe(link)
    await esperarAte(async () => (await job?.getState()) === 'completed')
    const depois = await fila.getJob(job?.id ?? '')
    expect(depois?.data.p).toBe('') // concluído: o conteúdo sai do job (retido por 24 h)
  })

  it('SMTP fora do ar: tenta de novo com espera progressiva e, esgotadas as tentativas, apaga o conteúdo sensível do job', async () => {
    const { servico, fila } = await cenario({ SMTP_PORT: '1' })
    await servico.enfileirar(
      emailUnico('falha'),
      emailRedefinirSenha('Bia', 'http://localhost:5173/r?token=OUTRO-SEGREDO'),
    )
    await esperarAte(async () => (await fila.getFailedCount()) === 1, 15_000)
    const [job] = await fila.getJobs(['failed'])
    expect(job?.attemptsMade).toBe(3) // 1 + 2 reenvios
    expect(job?.failedReason).toBeTruthy()
    await esperarAte(async () => (await fila.getJob(job?.id ?? ''))?.data.p === '')
    expect(
      JSON.stringify(await valkey.hgetall(`${fila.opts.prefix}:${FILAS.email}:${job?.id}`)),
    ).not.toContain('OUTRO-SEGREDO')
  }, 30_000)

  it('Valkey fora do ar: a requisição falha com 503 em vez de responder sucesso', async () => {
    const morto = new Redis('redis://127.0.0.1:1', {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    })
    morto.on('error', () => undefined)
    const servico = new EmailService(configuracaoDeTeste(), morto)
    await expect(
      servico.enfileirar('a@b.com', emailRedefinirSenha('Cris', 'http://x/y')),
    ).rejects.toMatchObject({
      constructor: ErroApi,
      codigo: 'servico_indisponivel',
    })
    morto.disconnect()
  })

  it('sem TOKEN_ENCRYPTION_KEY não enfileira nada (nunca em texto aberto)', async () => {
    const { fila } = await cenario({}, false)
    const config = {
      ...configuracaoDeTeste({ FILA_PREFIXO: fila.opts.prefix ?? '' }),
      TOKEN_ENCRYPTION_KEY: undefined,
    }
    const servico = new EmailService(config, valkey)
    await expect(
      servico.enfileirar('a@b.com', emailRedefinirSenha('D', 'http://x/y')),
    ).rejects.toThrow('TOKEN_ENCRYPTION_KEY')
    expect(await fila.getJobCounts('waiting', 'delayed')).toEqual({ waiting: 0, delayed: 0 })
    await servico.onModuleDestroy()
  })
})

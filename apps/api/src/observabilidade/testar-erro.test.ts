import type { NodeOptions } from '@sentry/node'
import { afterEach, describe, expect, it } from 'vitest'

import { desligarObservabilidade } from './erros.js'
import { executarTestarErro } from './testar-erro.js'

const base = {
  ...process.env,
  LOG_LEVEL: 'silent',
}

function saida() {
  const out: string[] = []
  const err: string[] = []
  return {
    io: { imprimir: (l: string) => out.push(l), imprimirErro: (l: string) => err.push(l) },
    out,
    err,
  }
}

afterEach(desligarObservabilidade)

describe('node dist/testar-erro.js', () => {
  it('sem SENTRY_DSN: não envia nada e sai com 1', async () => {
    const s = saida()
    expect(await executarTestarErro({ ...base, SENTRY_DSN: '' }, s.io)).toBe(1)
    expect(s.err.join('\n')).toContain('SENTRY_DSN não está definida')
  })

  it('com DSN: envia o erro de teste com o commit (release) e o papel, e sai com 0', async () => {
    const enviados: string[] = []
    const transport: NonNullable<NodeOptions['transport']> = () => ({
      send: (envelope) => {
        enviados.push(JSON.stringify(envelope))
        return Promise.resolve({ statusCode: 200 })
      },
      flush: () => Promise.resolve(true),
    })
    const s = saida()
    const codigo = await executarTestarErro(
      {
        ...base,
        NODE_ENV: 'test',
        APP_VERSION: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        SENTRY_DSN: 'https://chave@erros.exemplo.com/1',
        PAPEL: 'worker',
      },
      s.io,
      { transport },
    )
    expect(codigo).toBe(0)
    const texto = enviados.join('\n')
    expect(texto).toContain('Erro de teste do Leadtogo')
    expect(texto).toContain('"release":"a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"')
    expect(texto).toContain('"papel":"worker"')
    expect(texto).toContain('"teste":"true"')
    expect(s.out.join('\n')).toContain('papel worker')
  })

  it('configuração inválida: sai com 1 sem vazar valores', async () => {
    const s = saida()
    expect(await executarTestarErro({ ...base, DATABASE_URL: '' }, s.io)).toBe(1)
    expect(s.err.length).toBeGreaterThan(0)
  })
})

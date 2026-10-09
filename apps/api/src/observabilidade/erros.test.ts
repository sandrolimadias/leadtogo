import type { NodeOptions } from '@sentry/node'
import { afterEach, describe, expect, it } from 'vitest'

import { executarComContexto, identificarNoLog } from '../log/contexto-log.js'
import {
  desligarObservabilidade,
  esvaziarErros,
  iniciarObservabilidade,
  reportarErro,
  tagsDoContexto,
} from './erros.js'

/** Transporte falso: guarda os envelopes em memória em vez de ir à rede. */
function transporteFalso(enviados: string[]): NonNullable<NodeOptions['transport']> {
  return () => ({
    send: (envelope) => {
      enviados.push(JSON.stringify(envelope))
      return Promise.resolve({ statusCode: 200 })
    },
    flush: () => Promise.resolve(true),
  })
}

afterEach(desligarObservabilidade)

const base = { APP_VERSION: 'abc1234', NODE_ENV: 'production' as const }

describe('observabilidade de erros', () => {
  it('sem DSN o SDK fica desligado e reportar não faz nada', async () => {
    expect(iniciarObservabilidade({ ...base, SENTRY_DSN: undefined }, 'api')).toBe(false)
    expect(() => reportarErro(new Error('x'))).not.toThrow()
    expect(await esvaziarErros()).toBe(true)
  })

  it('envia com release, ambiente, papel e tags do contexto, sem dados pessoais', async () => {
    const enviados: string[] = []
    const ligado = iniciarObservabilidade(
      { ...base, SENTRY_DSN: 'https://chave@erros.exemplo.com/1' },
      'worker',
      { transport: transporteFalso(enviados) },
    )
    expect(ligado).toBe(true)

    const req = { headers: {} } as never
    executarComContexto(req, { hasHeader: () => true, setHeader: () => undefined } as never, () => {
      identificarNoLog({ tenantId: 'ten-1', userId: 'usr-1' })
      reportarErro(new Error('falha com ana@empresa.com.br e cpf 529.982.247-25'), {
        fila: 'email',
      })
    })
    await esvaziarErros()

    const texto = enviados.join('\n')
    expect(texto).toContain('"release":"abc1234"')
    expect(texto).toContain('"environment":"production"')
    expect(texto).toContain('"papel":"worker"')
    expect(texto).toContain('"tenant_id":"ten-1"')
    expect(texto).toContain('"user_id":"usr-1"')
    expect(texto).toContain('"fila":"email"')
    expect(texto).not.toContain('ana@empresa')
    expect(texto).not.toContain('529.982')
  })

  it('tagsDoContexto só leva identificadores', () => {
    expect(tagsDoContexto(undefined)).toEqual({})
    expect(tagsDoContexto({ requestId: 'r1', tenantId: 't1' })).toEqual({
      request_id: 'r1',
      tenant_id: 't1',
    })
  })
})

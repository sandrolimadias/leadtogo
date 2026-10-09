import * as Sentry from '@sentry/react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { iniciarObservabilidade } from './erros'
import { LimiteDeErros } from './limite-de-erros'

afterEach(async () => {
  await Sentry.close(500)
})

function transporteFalso(enviados: string[]): NonNullable<Sentry.BrowserOptions['transport']> {
  return () => ({
    send: (envelope) => {
      enviados.push(JSON.stringify(envelope))
      return Promise.resolve({ statusCode: 200 })
    },
    flush: () => Promise.resolve(true),
  })
}

function Quebra(): never {
  throw new Error('falha de tela com ana@empresa.com.br')
}

describe('observabilidade do web', () => {
  it('sem DSN não liga o SDK', () => {
    expect(iniciarObservabilidade({ dsn: undefined, release: 'dev', environment: 'test' })).toBe(
      false,
    )
    expect(Sentry.getClient()).toBeUndefined()
  })

  it('erro de renderização mostra o aviso e envia o evento limpo, com o commit', async () => {
    const enviados: string[] = []
    iniciarObservabilidade({
      dsn: 'https://chave@erros.exemplo.com/2',
      release: 'abc1234',
      environment: 'production',
      transport: transporteFalso(enviados),
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <LimiteDeErros>
        <Quebra />
      </LimiteDeErros>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado')
    await Sentry.flush(2000)
    const texto = enviados.join('\n')
    expect(texto).toContain('"release":"abc1234"')
    expect(texto).toContain('[email]')
    expect(texto).not.toContain('ana@empresa')
  })
})

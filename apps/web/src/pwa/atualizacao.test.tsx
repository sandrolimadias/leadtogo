import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AvisoDeNovaVersao } from './aviso-de-nova-versao'
import {
  INTERVALO_DA_CHECAGEM_MS,
  avisarNovaVersao,
  vigiarAtualizacao,
  zerarNovaVersao,
} from './atualizacao'

describe('vigiarAtualizacao', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('checa ao voltar ao primeiro plano e a cada hora, e para ao desfazer', () => {
    const registro = { update: vi.fn(() => Promise.resolve()) }
    const parar = vigiarAtualizacao(registro)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registro.update).not.toHaveBeenCalled()

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(registro.update).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(INTERVALO_DA_CHECAGEM_MS)
    expect(registro.update).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(INTERVALO_DA_CHECAGEM_MS * 2)
    expect(registro.update).toHaveBeenCalledTimes(4)

    parar()
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(INTERVALO_DA_CHECAGEM_MS)
    expect(registro.update).toHaveBeenCalledTimes(4)
  })

  it('falha de rede na checagem não vira erro', async () => {
    const registro = { update: vi.fn(() => Promise.reject(new Error('sem rede'))) }
    const parar = vigiarAtualizacao(registro)
    vi.advanceTimersByTime(INTERVALO_DA_CHECAGEM_MS)
    await vi.advanceTimersByTimeAsync(0)
    expect(registro.update).toHaveBeenCalled()
    parar()
  })
})

describe('AvisoDeNovaVersao', () => {
  afterEach(() => zerarNovaVersao())

  it('some sem versão nova; com ela mostra o aviso e só atualiza no clique', async () => {
    render(<AvisoDeNovaVersao />)
    expect(screen.queryByRole('status')).toBeNull()

    const atualizar = vi.fn()
    act(() => avisarNovaVersao(atualizar))
    expect(screen.getByRole('status')).toHaveTextContent(/Nova versão disponível\s*·\s*Atualizar/)
    expect(atualizar).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    expect(atualizar).toHaveBeenCalledTimes(1)
  })
})

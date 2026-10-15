import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Paginacao } from './paginacao'

function montar(extra: Partial<Parameters<typeof Paginacao>[0]> = {}) {
  const aoMudarPagina = vi.fn()
  const aoMudarPorPagina = vi.fn()
  render(
    <Paginacao
      pagina={2}
      porPagina={25}
      total={120}
      aoMudarPagina={aoMudarPagina}
      aoMudarPorPagina={aoMudarPorPagina}
      {...extra}
    />,
  )
  return { aoMudarPagina, aoMudarPorPagina }
}

describe('Paginacao', () => {
  it('mostra o intervalo, a página e as opções 25, 50 e 100 (25 marcado)', () => {
    montar()
    expect(screen.getByText('26–50 de 120')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 5')).toBeInTheDocument()
    const tamanho = screen.getByRole('combobox', { name: 'Linhas por página' })
    expect(tamanho).toHaveValue('25')
    expect(Array.from(tamanho.querySelectorAll('option')).map((o) => o.textContent)).toEqual([
      '25',
      '50',
      '100',
    ])
  })

  it('escolher outro tamanho avisa com o número (50 ou 100)', async () => {
    const { aoMudarPorPagina } = montar()
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Linhas por página' }),
      '100',
    )
    expect(aoMudarPorPagina).toHaveBeenCalledWith(100)
  })

  it('Anterior e Próxima mudam de página e travam nas pontas', async () => {
    const { aoMudarPagina } = montar()
    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(aoMudarPagina.mock.calls).toEqual([[1], [3]])
  })

  it('na primeira página não há Anterior e na última não há Próxima', () => {
    montar({ pagina: 1 })
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeEnabled()
  })

  it('na última página trava a Próxima; com uma página só, os dois', () => {
    const { unmount } = render(
      <Paginacao
        pagina={5}
        porPagina={25}
        total={120}
        aoMudarPagina={() => undefined}
        aoMudarPorPagina={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled()
    expect(screen.getByText('101–120 de 120')).toBeInTheDocument()
    unmount()
    render(
      <Paginacao
        pagina={1}
        porPagina={50}
        total={7}
        aoMudarPagina={() => undefined}
        aoMudarPorPagina={() => undefined}
      />,
    )
    expect(screen.getByText('1–7 de 7')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled()
  })

  it('sem nenhuma linha mostra 0–0 de 0', () => {
    montar({ pagina: 1, total: 0 })
    expect(screen.getByText('0–0 de 0')).toBeInTheDocument()
  })
})

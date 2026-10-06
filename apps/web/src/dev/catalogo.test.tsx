import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import { Catalogo } from './catalogo'

const renderizar = () =>
  render(
    <TooltipProvider>
      <Catalogo />
    </TooltipProvider>,
  )

afterEach(() => document.documentElement.removeAttribute('data-theme'))

describe('Catálogo de componentes (desenvolvimento)', () => {
  it('mostra todas as seções e todo botão tem nome acessível', () => {
    renderizar()
    for (const titulo of [
      'Botões',
      'Campos',
      'Exibição',
      'Navegação e menus',
      'Avisos e estados',
      'Diálogo e folha',
    ]) {
      expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument()
    }
    for (const botao of screen.getAllByRole('button')) {
      expect(botao, botao.outerHTML.slice(0, 80)).toHaveAccessibleName()
    }
    for (const campo of screen.getAllByRole('textbox')) expect(campo).toHaveAccessibleName()
  })

  it('o seletor de tema escreve data-theme no <html>; "Sistema" o remove', async () => {
    renderizar()
    const tema = screen.getByRole('group', { name: 'Tema' })
    await userEvent.click(within(tema).getByRole('button', { name: 'Escuro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await userEvent.click(within(tema).getByRole('button', { name: 'Claro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    await userEvent.click(within(tema).getByRole('button', { name: 'Sistema' }))
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('a densidade vira data-density no contêiner', async () => {
    const { container } = renderizar()
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Densidade' })).getByRole('button', {
        name: 'Toque',
      }),
    )
    expect(container.querySelector('[data-density="touch"]')).not.toBeNull()
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@leadtogo/ui/tooltip'

import { Catalogo } from './catalogo'

const renderizar = () =>
  render(
    <TooltipProvider>
      <Catalogo />
    </TooltipProvider>,
  )

afterEach(() => document.documentElement.removeAttribute('data-theme'))

describe('Catálogo de componentes (desenvolvimento)', () => {
  it('espelha as seções do catalogo.html na mesma ordem; o que falta aparece como pendente', () => {
    renderizar()
    const nomes = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(nomes).toEqual([
      'Button',
      'IconButton',
      'SegmentedControl',
      'TextField',
      'Select',
      'Checkbox',
      'Switch',
      'Badge',
      'Tag',
      'Avatar',
      'StatTile',
      'StatusPill',
      'Tooltip',
      'ActivityIcon',
      'PriorityMarks',
      'ActivityTimeline',
      'TaskCard',
      'DealCard',
      'KanbanColumn',
      'DataTable',
      'Tabs',
      'AppNav',
      'TenantSwitcher',
      'Menu',
      'Alert',
      'Toast',
      'EmptyState',
      'Skeleton',
      'Dialog',
      'Icon',
      'TelaFunil',
    ])
    expect(screen.getAllByText(/^pendente \(etapa /)).toHaveLength(10)
  })

  it('todo botão e campo tem nome acessível', () => {
    renderizar()
    for (const botao of screen.getAllByRole('button')) {
      expect(botao, botao.outerHTML.slice(0, 80)).toHaveAccessibleName()
    }
    for (const campo of screen.getAllByRole('textbox')) expect(campo).toHaveAccessibleName()
  })

  it('o seletor de tema escreve data-theme no <html> (claro por padrão, como o catalogo.html)', async () => {
    renderizar()
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    const tema = screen.getByRole('group', { name: 'Tema' })
    await userEvent.click(within(tema).getByRole('button', { name: 'Escuro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await userEvent.click(within(tema).getByRole('button', { name: 'Claro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
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

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Building2, Settings } from 'lucide-react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './button'
import { Dialog, Sheet } from './dialog'
import { Menu } from './menu'
import { Tabs } from './tabs'
import { Tooltip, TooltipProvider } from './tooltip'

describe('Menu (dropdown)', () => {
  it('abre pelo teclado, navega com as setas, seleciona com Enter e devolve o foco ao botão', async () => {
    const aoTrocar = vi.fn()
    render(
      <Menu
        trigger={<Button>Empresas</Button>}
        items={[
          { heading: 'Suas empresas' },
          { label: 'Aurora · Administrador', checked: true, onSelect: () => undefined },
          { label: 'Borealis · Vendedor', onSelect: aoTrocar },
          { separator: true },
          { icon: Settings, label: 'Configurações' },
        ]}
      />,
    )
    await userEvent.tab()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('menu', { name: 'Empresas' })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(aoTrocar).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Empresas' })).toHaveFocus())
  })
  it('Esc fecha o menu', async () => {
    render(<Menu trigger={<Button>Abrir</Button>} items={[{ label: 'Um' }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})

describe('Dialog e Sheet', () => {
  function Exemplo({ Folha = false }: { Folha?: boolean }) {
    const [aberto, setAberto] = useState(false)
    const Componente = Folha ? Sheet : Dialog
    return (
      <>
        <Button onClick={() => setAberto(true)}>Abrir</Button>
        <Componente
          open={aberto}
          onOpenChange={setAberto}
          title="Fechar oportunidade"
          description="Proposta · Aurora"
          footer={<Button onClick={() => setAberto(false)}>Cancelar</Button>}
        >
          <input aria-label="Motivo" />
        </Componente>
      </>
    )
  }
  it.each([false, true])(
    'prende o foco, tem nome e descrição, fecha com Esc e devolve o foco (Sheet=%s)',
    async (folha) => {
      render(<Exemplo Folha={folha} />)
      const abrir = screen.getByRole('button', { name: 'Abrir' })
      await userEvent.click(abrir)
      const dialogo = await screen.findByRole('dialog', { name: 'Fechar oportunidade' })
      expect(dialogo).toHaveAccessibleDescription('Proposta · Aurora')
      // o foco entra no diálogo e o Tab não escapa dele
      expect(dialogo.contains(document.activeElement)).toBe(true)
      for (let i = 0; i < 6; i++) {
        await userEvent.tab()
        expect(dialogo.contains(document.activeElement)).toBe(true)
      }
      await userEvent.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(abrir).toHaveFocus())
    },
  )
  it('o botão Fechar tem rótulo acessível', async () => {
    render(<Exemplo />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Tabs e Tooltip', () => {
  it('abas: setas movem a seleção, role tablist nomeado e contador', async () => {
    const onChange = vi.fn()
    render(
      <Tabs
        label="Minhas atividades"
        onChange={onChange}
        items={[
          { value: 'hoje', label: 'Hoje', count: 3 },
          { value: 'atrasadas', label: 'Atrasadas' },
        ]}
      />,
    )
    expect(screen.getByRole('tablist', { name: 'Minhas atividades' })).toBeInTheDocument()
    const hoje = screen.getByRole('tab', { name: /Hoje/ })
    expect(hoje).toHaveAttribute('aria-selected', 'true')
    hoje.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Atrasadas' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('atrasadas')
  })
  it('a dica aparece no foco do teclado (e não só no mouse)', async () => {
    render(
      <TooltipProvider>
        <Tooltip label="Recolher menu">
          <Button icon={Building2}>Menu</Button>
        </Tooltip>
      </TooltipProvider>,
    )
    await userEvent.tab()
    expect((await screen.findAllByText('Recolher menu')).length).toBeGreaterThan(0)
  })
})

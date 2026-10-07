import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Building2 } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { Avatar, AvatarGroup } from './exibicao'
import { Alert, Toast } from './feedback'
import { Icon } from './icone'
import { MenuList } from './menu'
import { AppNav, TenantSwitcher } from './navegacao'
import { PainelDoDialogo } from './dialog'
import { Toaster } from './toaster'
import { toast } from './toast'

describe('Icon', () => {
  it('é decorativo sem label e imagem nomeada com label', () => {
    const { container } = render(
      <>
        <Icon icon={Building2} />
        <Icon icon={Building2} label="Empresa" />
      </>,
    )
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.getByRole('img', { name: 'Empresa' })).toBeInTheDocument()
  })
})

describe('AvatarGroup, Alert e Toast', () => {
  it('agrupa avatares', () => {
    render(
      <AvatarGroup>
        <Avatar name="Ana Paula" />
        <Avatar name="Bruno Lima" />
      </AvatarGroup>,
    )
    expect(within(screen.getByRole('group')).getAllByRole('img')).toHaveLength(2)
  })
  it('Alert danger anuncia como alerta, com título, texto e ações', () => {
    render(
      <Alert tone="danger" title="Erro" actions={<button>Tentar</button>}>
        Texto
      </Alert>,
    )
    const alerta = screen.getByRole('alert')
    expect(alerta).toHaveTextContent('ErroTexto')
    expect(within(alerta).getByRole('button', { name: 'Tentar' })).toBeInTheDocument()
  })
  it('Toast fecha pelo botão', async () => {
    const fechar = vi.fn()
    render(<Toast title="Salvo" description="Ok" onClose={fechar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(fechar).toHaveBeenCalled()
  })
  it('toast.success mostra o aviso do design system pelo Toaster', async () => {
    render(<Toaster />)
    toast.success('Empresa ativa trocada', { description: 'Aurora' })
    expect(await screen.findByText('Empresa ativa trocada')).toBeInTheDocument()
    expect(screen.getByText('Aurora')).toBeInTheDocument()
  })
})

describe('Navegação', () => {
  it('TenantSwitcher mostra as iniciais, o nome e o papel', () => {
    render(<TenantSwitcher current={{ name: 'Leadtogo Comercial', role: 'Administrador' }} />)
    const botao = screen.getByRole('button')
    expect(botao).toHaveTextContent('LC')
    expect(botao).toHaveTextContent('Leadtogo Comercial')
    expect(botao).toHaveTextContent('Administrador')
  })
  it('AppNav marca a página atual e mostra contadores e o usuário', () => {
    render(
      <AppNav
        tenant={{ name: 'Leadtogo Comercial', role: 'Administrador' }}
        user={{ name: 'Alessandro Dias', role: 'Administrador' }}
        groups={[
          {
            items: [
              { icon: Building2, label: 'Dashboard', active: true },
              { icon: Building2, label: 'Empresas', count: 342 },
            ],
          },
        ]}
      />,
    )
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: /Empresas/ })).toHaveTextContent('342')
    expect(within(nav).getByRole('button', { name: 'Configurações' })).toBeInTheDocument()
  })
  it('MenuList marca o item atual como rádio e chama onSelect', async () => {
    const aoEscolher = vi.fn()
    render(
      <MenuList
        label="Empresas"
        items={[
          { heading: 'Suas empresas' },
          { label: 'Aurora', checked: true },
          { label: 'Borealis', checked: false, onSelect: aoEscolher },
        ]}
      />,
    )
    expect(screen.getByRole('menuitemradio', { name: 'Aurora' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Borealis' }))
    expect(aoEscolher).toHaveBeenCalled()
  })
  it('PainelDoDialogo é um diálogo nomeado, com fechar', () => {
    render(<PainelDoDialogo title="Marcar como perdida" footer={<button>Ok</button>} />)
    expect(screen.getByRole('dialog', { name: 'Marcar como perdida' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
  })
})

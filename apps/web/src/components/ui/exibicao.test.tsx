import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Inbox } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { corDoNome, iniciais } from './cores'
import { Avatar, Badge, Tag } from './exibicao'
import { Alert, EmptyState, Skeleton } from './feedback'

describe('Avatar', () => {
  it('iniciais: primeira e última palavra; a cor depende só do nome', () => {
    expect(iniciais('Alessandro Lima Dias')).toBe('AD')
    expect(iniciais('Maria')).toBe('M')
    expect(iniciais('   ')).toBe('?')
    expect(corDoNome('Maria Souza')).toBe(corDoNome('Maria Souza'))
  })
  it('tem o nome como texto alternativo', () => {
    render(<Avatar name="Maria Souza" />)
    expect(screen.getByRole('img', { name: 'Maria Souza' })).toHaveTextContent('MS')
  })
})

describe('Badge e Tag', () => {
  it('Badge mostra a palavra do estado (nunca só a cor)', () => {
    render(<Badge tone="danger">Atrasada</Badge>)
    expect(screen.getByText('Atrasada')).toBeInTheDocument()
  })
  it('Tag removível tem botão com rótulo acessível e chama onRemove', async () => {
    const onRemove = vi.fn()
    render(
      <Tag color="teal" onRemove={onRemove}>
        Lead
      </Tag>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remover Lead' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})

describe('Alert, EmptyState e Skeleton', () => {
  it('erro e aviso anunciam como alerta; info e sucesso como status', () => {
    const { rerender } = render(<Alert tone="danger">E-mail ou senha incorretos.</Alert>)
    expect(screen.getByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.')
    rerender(<Alert tone="success">Pronto.</Alert>)
    expect(screen.getByRole('status')).toHaveTextContent('Pronto.')
  })
  it('EmptyState tem título como cabeçalho, descrição e ações', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Nenhuma empresa ainda"
        description="Cadastre a primeira."
        actions={<button>Nova empresa</button>}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Nenhuma empresa ainda' })).toBeInTheDocument()
    expect(screen.getByText('Cadastre a primeira.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova empresa' })).toBeInTheDocument()
  })
  it('Skeleton avisa que está carregando', () => {
    render(<Skeleton lines={3} />)
    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument()
  })
})

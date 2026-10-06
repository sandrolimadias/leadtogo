import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Search } from 'lucide-react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button, IconButton } from './button'
import { Checkbox, Switch } from './checkbox'
import { Select, TextField, TextArea } from './campos'
import { SegmentedControl } from './segmented-control'

describe('Button e IconButton', () => {
  it('é type=button por padrão (não envia formulário sem querer) e dispara onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Salvar</Button>)
    const b = screen.getByRole('button', { name: 'Salvar' })
    expect(b).toHaveAttribute('type', 'button')
    await userEvent.click(b)
    expect(onClick).toHaveBeenCalledOnce()
  })
  it('loading desativa o clique, marca aria-busy e esconde o spinner do leitor de tela', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Consultando Receita…
      </Button>,
    )
    const b = screen.getByRole('button')
    expect(b).toBeDisabled()
    expect(b).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(b)
    expect(onClick).not.toHaveBeenCalled()
  })
  it('o botão se aciona pelo teclado (Enter e Espaço)', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Ir</Button>)
    await userEvent.tab()
    expect(screen.getByRole('button')).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })
  it('IconButton exige rótulo: vira o nome acessível e a dica', () => {
    render(<IconButton icon={Search} label="Buscar" />)
    const b = screen.getByRole('button', { name: 'Buscar' })
    expect(b).toHaveAttribute('title', 'Buscar')
  })
})

describe('TextField, TextArea e Select', () => {
  it('liga o rótulo ao campo e marca obrigatório sem expor o asterisco ao leitor', () => {
    render(<TextField label="E-mail" required />)
    const campo = screen.getByRole('textbox', { name: 'E-mail' })
    expect(campo).toBeRequired()
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
  })
  it('o erro vira aria-invalid e é descrição do campo; sem erro, a dica descreve', () => {
    const { rerender } = render(<TextField label="CNPJ" hint="Aceita letras" mono />)
    const campo = screen.getByLabelText('CNPJ')
    expect(campo).toHaveAccessibleDescription('Aceita letras')
    expect(campo).toHaveClass('font-mono')
    rerender(<TextField label="CNPJ" hint="Aceita letras" error="Informe os 14 caracteres." />)
    expect(screen.getByLabelText('CNPJ')).toBeInvalid()
    expect(screen.getByLabelText('CNPJ')).toHaveAccessibleDescription('Informe os 14 caracteres.')
  })
  it('suffix fica dentro do campo e é alcançável pelo teclado', async () => {
    render(<TextField label="CNPJ" suffix={<Button size="sm">Consultar</Button>} />)
    await userEvent.tab()
    expect(screen.getByLabelText('CNPJ')).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Consultar' })).toHaveFocus()
  })
  it('TextArea e Select têm rótulo e mostram a lista', async () => {
    render(
      <>
        <TextArea label="Observações" />
        <Select
          label="Status"
          placeholder="Escolha"
          options={['Lead', { value: 'cli', label: 'Cliente' }]}
        />
      </>,
    )
    expect(screen.getByLabelText('Observações').tagName).toBe('TEXTAREA')
    const select = screen.getByLabelText('Status')
    await userEvent.selectOptions(select, 'cli')
    expect(select).toHaveValue('cli')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Escolha',
      'Lead',
      'Cliente',
    ])
  })
})

describe('Checkbox, Switch e SegmentedControl', () => {
  it('Checkbox alterna com Espaço e tem descrição', async () => {
    render(<Checkbox label="Receber avisos" description="Por e-mail" />)
    const c = screen.getByRole('checkbox', { name: /Receber avisos/ })
    await userEvent.tab()
    expect(c).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(c).toBeChecked()
  })
  it('Switch tem role=switch e liga com Espaço', async () => {
    render(<Switch label="Vendedores veem todas as empresas" />)
    const s = screen.getByRole('switch', { name: 'Vendedores veem todas as empresas' })
    await userEvent.tab()
    await userEvent.keyboard(' ')
    expect(s).toBeChecked()
  })
  it('SegmentedControl: grupo nomeado, aria-pressed no ativo, controlado ou não', async () => {
    const onChange = vi.fn()
    function Controlado() {
      const [v, setV] = useState('kanban')
      return (
        <SegmentedControl
          label="Visão"
          value={v}
          onChange={(x) => {
            onChange(x)
            setV(x)
          }}
          options={[
            { value: 'kanban', label: 'Kanban' },
            { value: 'lista', label: 'Lista' },
          ]}
        />
      )
    }
    render(<Controlado />)
    expect(screen.getByRole('group', { name: 'Visão' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kanban' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Lista' }))
    expect(onChange).toHaveBeenCalledWith('lista')
    expect(screen.getByRole('button', { name: 'Lista' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Kanban' })).toHaveAttribute('aria-pressed', 'false')
  })
})

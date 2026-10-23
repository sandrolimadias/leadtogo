import type { CampoDeVisita } from '@leadtogo/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { FormularioDoRelatorio, type Valores } from './formulario'

const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`

const campos: CampoDeVisita[] = [
  { id: id(1), rotulo: 'Turnos', tipo: 'numero', obrigatorio: true },
  {
    id: id(2),
    rotulo: 'Ações feitas',
    tipo: 'multipla_escolha',
    obrigatorio: false,
    opcoes: [
      { id: id(20), rotulo: 'WhatsApp' },
      { id: id(21), rotulo: 'Material' },
    ],
  },
  { id: id(3), rotulo: 'Satisfação', tipo: 'nota', obrigatorio: false },
  { id: id(4), rotulo: 'Quer demonstração', tipo: 'tag', obrigatorio: false, tagId: id(40) },
  { id: id(5), rotulo: 'Contato', tipo: 'contato', obrigatorio: false },
]

function Teste({ aoFim }: { aoFim: (v: Valores) => void }) {
  const [valores, setValores] = useState<Valores>({})
  aoFim(valores)
  return (
    <FormularioDoRelatorio
      campos={campos}
      valores={valores}
      erros={{ [id(1)]: 'responda "Turnos"' }}
      opcoes={{
        contatos: [{ id: id(50), nome: 'Joana', cargo: 'Compras' }],
        tiposAtividade: [],
        verticais: [],
        tags: new Map([[id(40), 'Demonstração']]),
      }}
      aoMudar={(campoId, valor) => setValores((v) => ({ ...v, [campoId]: valor }))}
    />
  )
}

describe('FormularioDoRelatorio', () => {
  it('monta um controle por tipo e devolve os valores no formato da API', async () => {
    let ultimo: Valores = {}
    render(<Teste aoFim={(v) => (ultimo = v)} />)
    expect(screen.getByText('responda "Turnos"')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Turnos/), '3')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Material' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Nota 4' }))
    expect(screen.getByText('Sim aplica a tag Demonstração na empresa.')).toBeInTheDocument()
    await userEvent.click(
      screen
        .getByRole('radiogroup', { name: 'Quer demonstração' })
        .querySelector('button') as HTMLElement,
    )
    await userEvent.selectOptions(screen.getByLabelText(/^Contato/), '__novo__')
    await userEvent.type(screen.getByLabelText(/Nome do contato/), 'Paulo')

    expect(ultimo).toEqual({
      [id(1)]: 3,
      [id(2)]: [id(21)],
      [id(3)]: 4,
      [id(4)]: true,
      [id(5)]: { novo: { nome: 'Paulo' } },
    })
  })
})

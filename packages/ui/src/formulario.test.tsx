import { definicaoDeFormularioSchema } from '@leadtogo/shared'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FormularioDinamico } from './formulario'

const definicao = definicaoDeFormularioSchema.parse({
  campos: [
    { id: 'nome', tipo: 'texto', rotulo: 'Nome', obrigatorio: true },
    {
      id: 'vai',
      tipo: 'selecao',
      rotulo: 'Vai ao jantar?',
      obrigatorio: true,
      opcoes: [
        { valor: 'sim', rotulo: 'Sim' },
        { valor: 'nao', rotulo: 'Não' },
      ],
    },
    {
      id: 'restricao',
      tipo: 'texto',
      rotulo: 'Restrição alimentar',
      visivelQuando: {
        combinacao: 'todas',
        condicoes: [{ campo: 'vai', operador: 'igual', valor: 'sim' }],
      },
    },
    { id: 'p2', tipo: 'quebra_de_pagina', rotulo: '—' },
    { id: 'nota', tipo: 'avaliacao', rotulo: 'Como foi o último?', obrigatorio: true },
  ],
  botoes: [
    { id: 'enviar', rotulo: 'Confirmar' },
    { id: 'depois', rotulo: 'Talvez depois', estilo: 'secundario' },
  ],
})

describe('FormularioDinamico', () => {
  it('mostra o campo condicional, valida a etapa, avança e envia pelo botão escolhido', async () => {
    const aoEnviar = vi.fn(async () => undefined)
    render(
      <FormularioDinamico
        definicao={definicao}
        preenchidos={{ nome: 'Marta' }}
        travados={['nome']}
        aoEnviar={aoEnviar}
      />,
    )
    const usuario = userEvent.setup()
    expect(screen.getByText('Etapa 1 de 2')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nome/)).toHaveAttribute('readonly')
    expect(screen.queryByLabelText(/Restrição alimentar/)).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(await screen.findByText('obrigatório')).toBeInTheDocument()
    await usuario.selectOptions(screen.getByLabelText(/Vai ao jantar/), 'sim')
    expect(screen.getByLabelText(/Restrição alimentar/)).toBeInTheDocument()
    await usuario.type(screen.getByLabelText(/Restrição alimentar/), 'Sem glúten')
    await usuario.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByText('Etapa 2 de 2')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Talvez depois' }))
    expect(await screen.findByText('obrigatório')).toBeInTheDocument()
    expect(aoEnviar).not.toHaveBeenCalled()
    await usuario.click(screen.getByRole('radio', { name: '4 de 5' }))
    await usuario.click(screen.getByRole('button', { name: 'Talvez depois' }))
    await waitFor(() =>
      expect(aoEnviar).toHaveBeenCalledWith('depois', {
        nome: 'Marta',
        vai: 'sim',
        restricao: 'Sem glúten',
        nota: 4,
      }),
    )
  })

  it('mostra os erros que o servidor devolveu', async () => {
    const def = definicaoDeFormularioSchema.parse({
      campos: [{ id: 'email', tipo: 'email', rotulo: 'E-mail' }],
      botoes: [{ id: 'enviar', rotulo: 'Enviar' }],
    })
    render(
      <FormularioDinamico
        definicao={def}
        aoEnviar={async () => ({ erros: { email: 'já inscrito' }, mensagem: 'Confira.' })}
      />,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar' }))
    expect(await screen.findByText('já inscrito')).toBeInTheDocument()
    expect(screen.getByText('Confira.')).toBeInTheDocument()
  })
})

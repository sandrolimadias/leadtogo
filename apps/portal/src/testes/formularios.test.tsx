import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, id, renderizar, servicosFalsos, servicosSemLogin } from './fakes'

describe('formulário no portal (Fase 4E)', () => {
  it('logado: vem preenchido, o nome travado, e envia pelo botão', async () => {
    const servicos = servicosFalsos()
    renderizar(servicos, `/formularios/${id(940)}`)
    const usuario = userEvent.setup()
    expect(
      await screen.findByRole('heading', { name: 'Inscrição no encontro' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Nome/)).toHaveValue('Daniel Prates')
    expect(screen.getByLabelText(/^Nome/)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/^E-mail/)).toHaveValue('daniel@usidantec.com.br')
    await usuario.selectOptions(screen.getByLabelText(/Vai ao jantar/), 'sim')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar inscrição' }))
    await waitFor(() =>
      expect(servicos.formularios.responder).toHaveBeenCalledWith(id(940), {
        versao: 2,
        botao: 'enviar',
        respostas: { nome: 'Daniel Prates', email: 'daniel@usidantec.com.br', vai: 'sim' },
      }),
    )
    expect(await screen.findByText('Recebemos sua resposta. Obrigado!')).toBeInTheDocument()
  })

  it('erro por campo que o servidor devolveu aparece no campo', async () => {
    const servicos = servicosFalsos()
    servicos.formularios.responder = vi.fn(async () =>
      falha({
        codigo: 'respostas_invalidas',
        mensagem: 'Confira os campos destacados.',
        status: 422,
        detalhes: [{ campo: 'email', mensagem: 'e-mail já inscrito' }],
      }),
    )
    renderizar(servicos, `/formularios/${id(940)}`)
    const usuario = userEvent.setup()
    await usuario.selectOptions(await screen.findByLabelText(/Vai ao jantar/), 'nao')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar inscrição' }))
    expect(await screen.findByText('e-mail já inscrito')).toBeInTheDocument()
  })

  it('público: sem login, exige o aceite de privacidade', async () => {
    const servicos = servicosSemLogin()
    renderizar(servicos, '/f/inscricao-no-encontro-ab12cd')
    const usuario = userEvent.setup()
    expect(
      await screen.findByRole('heading', { name: 'Inscrição no encontro' }),
    ).toBeInTheDocument()
    await usuario.type(screen.getByLabelText(/^Nome/), 'Rui Alves')
    await usuario.type(screen.getByLabelText(/^E-mail/), 'rui@exemplo.com')
    await usuario.selectOptions(screen.getByLabelText(/Vai ao jantar/), 'sim')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar inscrição' }))
    expect(await screen.findByText(/aceite o aviso de privacidade/)).toBeInTheDocument()
    expect(servicos.formularios.responderPublico).not.toHaveBeenCalled()
    await usuario.click(screen.getByLabelText(/Li e aceito o aviso de privacidade/))
    await usuario.click(screen.getByRole('button', { name: 'Confirmar inscrição' }))
    await waitFor(() =>
      expect(servicos.formularios.responderPublico).toHaveBeenCalledWith(
        'inscricao-no-encontro-ab12cd',
        {
          versao: 2,
          botao: 'enviar',
          aceitaPrivacidade: true,
          respostas: { nome: 'Rui Alves', email: 'rui@exemplo.com', vai: 'sim' },
        },
      ),
    )
    expect(await screen.findByText('Obrigado!')).toBeInTheDocument()
  })
})

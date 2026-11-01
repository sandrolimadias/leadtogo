import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { formularioParaResponder, id, ok, renderizar, servicosSemLogin } from './fakes'

const evento = (extra: Record<string, unknown> = {}) => ({
  id: id(800),
  titulo: 'Encontro aberto',
  descricao: 'Para **todos**.',
  local: 'Auditório',
  online: false,
  inicioEm: '2099-11-12T21:30:00.000Z',
  fimEm: '2099-11-13T00:30:00.000Z',
  prazoConfirmacao: null,
  inscricaoAberta: true,
  disponibilidade: 'disponivel' as const,
  ...extra,
})

const comPagina = (troca: Record<string, unknown> = {}) => {
  const base = servicosSemLogin()
  return servicosSemLogin({
    pagina: {
      ...base.pagina,
      abrir: vi.fn(async () =>
        ok({
          nome: 'Associação Comercial',
          logoUrl: null,
          associacao: true,
          eventos: [
            evento(),
            evento({
              id: id(801),
              titulo: 'Jantar dos associados',
              inscricaoAberta: false,
              disponibilidade: 'poucas_vagas' as const,
            }),
          ],
        }),
      ),
      ...troca,
    },
  })
}

describe('página pública de eventos', () => {
  it('mostra os eventos, o selo de exclusivo e o botão de entrar', async () => {
    renderizar(comPagina(), '/eventos/associacao-comercial')
    expect(await screen.findByRole('heading', { name: 'Associação Comercial' })).toBeInTheDocument()
    const aberto = screen.getByRole('article', { name: 'Encontro aberto' })
    expect(within(aberto).getByRole('button', { name: 'Inscrever-se' })).toBeInTheDocument()
    const exclusivo = screen.getByRole('article', { name: 'Jantar dos associados' })
    expect(within(exclusivo).getByText('Exclusivo para associados')).toBeInTheDocument()
    expect(within(exclusivo).getByText('Poucas vagas')).toBeInTheDocument()
    expect(
      within(exclusivo).getByRole('link', { name: 'Entrar para se inscrever' }),
    ).toHaveAttribute('href', '/entrar')
    expect(screen.getByRole('button', { name: 'Seja um Associado' })).toBeInTheDocument()
  })

  it('inscrição sem login exige o aceite e envia', async () => {
    const inscrever = vi.fn(async () =>
      ok({ situacao: 'confirmado' as const, mensagem: 'Inscrição confirmada. Até lá!' }),
    )
    const servicos = comPagina({
      formularioDeInscricao: vi.fn(async () =>
        ok({ ...formularioParaResponder(), preenchidos: {}, travados: [] }),
      ),
      inscrever,
    })
    renderizar(servicos, '/eventos/associacao-comercial')
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Inscrever-se' }))
    const dialogo = await screen.findByRole('dialog', { name: /Inscrição:/ })
    await usuario.type(within(dialogo).getByLabelText(/^Nome/), 'Rui Alves')
    await usuario.type(within(dialogo).getByLabelText(/^E-mail/), 'rui@exemplo.com')
    await usuario.selectOptions(within(dialogo).getByLabelText(/Vai ao jantar/), 'sim')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar inscrição' }))
    expect(await within(dialogo).findByText(/aceite o aviso de privacidade/)).toBeInTheDocument()
    expect(inscrever).not.toHaveBeenCalled()
    await usuario.click(within(dialogo).getByLabelText(/Li e aceito/))
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar inscrição' }))
    expect(await within(dialogo).findByText('Inscrição confirmada. Até lá!')).toBeInTheDocument()
    await waitFor(() =>
      expect(inscrever).toHaveBeenCalledWith(
        'associacao-comercial',
        id(800),
        expect.objectContaining({ aceitaPrivacidade: true, versao: 2 }),
      ),
    )
  })

  it('página desligada: avisa', async () => {
    renderizar(
      comPagina({
        abrir: vi.fn(async () => ({
          ok: false as const,
          erro: {
            codigo: 'pagina_nao_encontrada',
            mensagem: 'Esta página não existe ou foi desligada.',
            status: 404,
          },
        })),
      }),
      '/eventos/x',
    )
    expect(await screen.findByText('Esta página não existe ou foi desligada.')).toBeInTheDocument()
  })
})

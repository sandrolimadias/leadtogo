import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { falha, ok, renderizar, servicosFalsos, servicosSemLogin, sessao } from './fakes'

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('guardas de acesso', () => {
  it('sem sessão, qualquer tela leva a /entrar', async () => {
    const { historico } = renderizar(servicosSemLogin(), '/chamados')
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(historico.location.pathname).toBe('/entrar')
  })

  it('com o 2FA pendente, só a tela de verificação passa', async () => {
    const servicos = servicosFalsos({
      sessao: {
        ...servicosFalsos().sessao,
        atual: vi.fn(async () =>
          ok(
            sessao({
              segundoFatorAtivo: true,
              segundoFatorExigido: true,
              segundoFatorPendente: true,
            }),
          ),
        ),
      },
    })
    const { historico } = renderizar(servicos, '/chamados')
    expect(
      await screen.findByRole('heading', { name: 'Verificação em duas etapas' }),
    ).toBeInTheDocument()
    expect(historico.location.pathname).toBe('/verificacao')
  })

  it('quem já entrou não vê a tela de entrada', async () => {
    const { historico } = renderizar(servicosFalsos(), '/entrar')
    expect(await screen.findByText(/Bom dia|Boa tarde|Boa noite/)).toBeInTheDocument()
    expect(historico.location.pathname).toBe('/')
  })

  it('erro que não é de login (servidor fora) não vira tela de entrada', async () => {
    const servicos = servicosFalsos({
      sessao: {
        ...servicosFalsos().sessao,
        atual: vi.fn(async () =>
          falha({ codigo: 'http_503', mensagem: 'fora do ar', status: 503 }),
        ),
      },
    })
    const { historico } = renderizar(servicos, '/')
    await waitFor(() => expect(servicos.sessao.atual).toHaveBeenCalled())
    expect(historico.location.pathname).toBe('/')
    expect(screen.queryByRole('heading', { name: 'Entrar' })).not.toBeInTheDocument()
  })
})

describe('entrar pelo e-mail', () => {
  it('pede o link e mostra a mesma mensagem, tenha o e-mail acesso ou não', async () => {
    const servicos = servicosSemLogin()
    renderizar(servicos, '/entrar')
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText(/^E-mail/), 'cliente@exemplo.com.br')
    await usuario.click(screen.getByRole('button', { name: 'Enviar link de entrada' }))
    expect(await screen.findByText(/Se este e-mail tem acesso/)).toBeInTheDocument()
    expect(servicos.entrada.pedir).toHaveBeenCalledWith('cliente@exemplo.com.br')
  })

  it('o botão só liga com um e-mail e o limite de tentativas aparece como erro', async () => {
    const servicos = servicosSemLogin({
      entrada: {
        ...servicosFalsos().entrada,
        pedir: vi.fn(async () =>
          falha({
            codigo: 'muitas_requisicoes',
            mensagem: 'Muitas tentativas. Aguarde.',
            status: 429,
          }),
        ),
      },
    })
    renderizar(servicos, '/entrar')
    const usuario = userEvent.setup()
    const botao = await screen.findByRole('button', { name: 'Enviar link de entrada' })
    expect(botao).toBeDisabled()
    await usuario.type(screen.getByLabelText(/^E-mail/), 'a@b.com')
    await usuario.click(botao)
    expect(await screen.findByText(/Muitas tentativas/)).toBeInTheDocument()
  })
})

describe('confirmar o link', () => {
  const TOKEN = `${'a'.repeat(8)}-aaaa-aaaa-aaaa-${'a'.repeat(12)}.${'b'.repeat(43)}`

  it('abrir a página só confere o link; o botão é que entra, e o token sai da barra de endereço', async () => {
    window.location.hash = `#${TOKEN}`
    const servicos = servicosSemLogin()
    const { historico } = renderizar(servicos, '/acesso')
    expect(await screen.findByRole('heading', { name: 'Entrar no portal' })).toBeInTheDocument()
    expect(servicos.entrada.previa).toHaveBeenCalledWith(TOKEN)
    expect(servicos.entrada.consumir).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(servicos.entrada.consumir).toHaveBeenCalledWith(TOKEN, false))
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('no primeiro acesso exige aceitar o aviso de privacidade', async () => {
    window.location.hash = `#${TOKEN}`
    const servicos = servicosSemLogin({
      entrada: {
        ...servicosFalsos().entrada,
        previa: vi.fn(async () =>
          ok({
            finalidade: 'convite' as const,
            nomeDoPortal: 'Dias Automação',
            empresaCliente: 'Usidantec',
            exigeAceiteDePrivacidade: true,
          }),
        ),
        consumir: vi.fn(async () => ok(sessao())),
      },
    })
    renderizar(servicos, '/acesso')
    const botao = await screen.findByRole('button', { name: 'Confirmar acesso' })
    expect(botao).toBeDisabled()
    const usuario = userEvent.setup()
    await usuario.click(screen.getByLabelText(/Li e aceito o aviso de privacidade/))
    await usuario.click(botao)
    await waitFor(() => expect(servicos.entrada.consumir).toHaveBeenCalledWith(TOKEN, true))
  })

  it('link vencido mostra o erro e leva a pedir outro; sem token, também', async () => {
    window.location.hash = `#${TOKEN}`
    const vencido = servicosSemLogin({
      entrada: {
        ...servicosFalsos().entrada,
        previa: vi.fn(async () =>
          falha({ codigo: 'link_invalido', mensagem: 'Link inválido ou expirado.', status: 404 }),
        ),
      },
    })
    const { unmount } = renderizar(vencido, '/acesso')
    expect(await screen.findByRole('heading', { name: 'Link inválido' })).toBeInTheDocument()
    expect(screen.getByText(/Link inválido ou expirado/)).toBeInTheDocument()
    unmount()

    window.history.replaceState(null, '', '/')
    renderizar(servicosSemLogin(), '/acesso')
    expect(await screen.findByText(/link está incompleto/)).toBeInTheDocument()
  })

  it('se o 2FA está pendente depois de entrar, segue para a verificação', async () => {
    window.location.hash = `#${TOKEN}`
    const servicos = servicosSemLogin({
      entrada: {
        ...servicosFalsos().entrada,
        consumir: vi.fn(async () =>
          ok(
            sessao({
              segundoFatorAtivo: true,
              segundoFatorExigido: true,
              segundoFatorPendente: true,
            }),
          ),
        ),
      },
    })
    const { historico } = renderizar(servicos, '/acesso')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/verificacao'))
  })
})

describe('verificação em duas etapas', () => {
  const pendente = (ativo: boolean) =>
    servicosFalsos({
      sessao: {
        ...servicosFalsos().sessao,
        atual: vi.fn(async () =>
          ok(
            sessao({
              segundoFatorAtivo: ativo,
              segundoFatorExigido: true,
              segundoFatorPendente: true,
            }),
          ),
        ),
      },
    })

  it('confere o código e libera o portal', async () => {
    const servicos = pendente(true)
    const { historico } = renderizar(servicos, '/verificacao')
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Código do aplicativo'), '123456')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(servicos.segundoFator.conferir).toHaveBeenCalledWith('123456'))
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('código errado mostra o erro e fica na tela', async () => {
    const servicos = pendente(true)
    servicos.segundoFator.conferir = vi.fn(async () =>
      falha({ codigo: 'codigo_invalido', mensagem: 'Código incorreto.', status: 422 }),
    )
    const { historico } = renderizar(servicos, '/verificacao')
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText('Código do aplicativo'), '000000')
    await usuario.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText(/Código incorreto/)).toBeInTheDocument()
    expect(historico.location.pathname).toBe('/verificacao')
  })

  it('quando a empresa exige e ainda não ligou: mostra o QR, pede o código e entrega os códigos de recuperação', async () => {
    const servicos = pendente(false)
    const { historico } = renderizar(servicos, '/verificacao')
    expect(await screen.findByAltText('QR code para o aplicativo autenticador')).toBeInTheDocument()
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()
    const usuario = userEvent.setup()
    await usuario.type(screen.getByLabelText(/Digite o código de 6 números/), '654321')
    await usuario.click(screen.getByRole('button', { name: 'Ligar verificação' }))
    expect(await screen.findByText('aaaaa-bbbbb')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: /Guardei os códigos/ }))
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
    expect(servicos.segundoFator.confirmar).toHaveBeenCalledWith('654321')
  })

  it('"Sair" encerra a sessão e volta a /entrar', async () => {
    const servicos = pendente(true)
    // depois de sair, a API responde 401 à sessão
    servicos.sessao.sair = vi.fn(async () => {
      servicos.sessao.atual = vi.fn(async () =>
        falha({ codigo: 'nao_autenticado', mensagem: 'Sua sessão terminou.', status: 401 }),
      )
      return ok(undefined)
    })
    const { historico } = renderizar(servicos, '/verificacao')
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(servicos.sessao.sair).toHaveBeenCalled())
    await waitFor(() => expect(historico.location.pathname).toBe('/entrar'))
  })
})

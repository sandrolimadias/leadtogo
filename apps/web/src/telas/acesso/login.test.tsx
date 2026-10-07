import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

async function preencher(email = 'ana@exemplo.com.br', senha = 'segredo-forte-1') {
  await userEvent.type(screen.getByLabelText('E-mail'), email)
  await userEvent.type(screen.getByLabelText('Senha'), senha)
}

describe('Login', () => {
  it('põe o foco no e-mail ao abrir', async () => {
    renderizar(servicosFalsos(), '/login')
    expect(await screen.findByLabelText('E-mail')).toHaveFocus()
  })

  it('erros de preenchimento ficam ligados ao campo e o foco vai ao primeiro com erro', async () => {
    const servicos = servicosFalsos()
    renderizar(servicos, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }))
    const email = screen.getByLabelText('E-mail')
    expect(email).toHaveAccessibleDescription('Informe um e-mail válido.')
    expect(email).toBeInvalid()
    expect(email).toHaveFocus()
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Digite a senha.')
    expect(servicos.entrar).not.toHaveBeenCalled()
  })

  it('Enter envia o formulário e leva ao app', async () => {
    let logado = false
    const servicos = servicosFalsos({
      me: async () => (logado ? meDeAdmin() : null),
      entrar: vi.fn(async () => {
        logado = true
        return ok({ doisFatores: false })
      }),
    })
    const { historico } = renderizar(servicos, '/login')
    await screen.findByLabelText('E-mail')
    await preencher()
    await userEvent.keyboard('{Enter}')
    await waitFor(() =>
      expect(servicos.entrar).toHaveBeenCalledWith('ana@exemplo.com.br', 'segredo-forte-1'),
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('não aceita duplo envio: o botão mostra carregando e a segunda chamada não acontece', async () => {
    let liberar: (v: unknown) => void = () => undefined
    const servicos = servicosFalsos({
      entrar: vi.fn(() => new Promise((r) => (liberar = r))) as never,
    })
    renderizar(servicos, '/login')
    await screen.findByLabelText('E-mail')
    await preencher()
    const botao = screen.getByRole('button', { name: 'Entrar' })
    await userEvent.click(botao)
    await userEvent.keyboard('{Enter}')
    expect(botao).toBeDisabled()
    expect(botao).toHaveAttribute('aria-busy', 'true')
    expect(servicos.entrar).toHaveBeenCalledTimes(1)
    liberar(ok({ doisFatores: false }))
  })

  it('e-mail ou senha errados: mensagem genérica, sem dizer qual dos dois', async () => {
    const servicos = servicosFalsos({
      entrar: async () => falha('INVALID_EMAIL_OR_PASSWORD', 'E-mail ou senha não conferem.', 401),
    })
    renderizar(servicos, '/login')
    await screen.findByLabelText('E-mail')
    await preencher('ninguem@exemplo.com.br', 'qualquer-coisa-1')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('E-mail ou senha não conferem')
    expect(alerta).not.toHaveTextContent(/não existe|não encontrad|cadastrad/i)
  })

  it('e-mail não confirmado avisa e não vira erro de senha', async () => {
    renderizar(
      servicosFalsos({
        entrar: async () =>
          falha(
            'EMAIL_NOT_VERIFIED',
            'Confirme seu e-mail para entrar. Enviamos um novo link.',
            403,
          ),
      }),
      '/login',
    )
    await screen.findByLabelText('E-mail')
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirme seu e-mail')
  })

  it('conta com 2FA vai para a verificação, levando o destino', async () => {
    const servicos = servicosFalsos({ entrar: async () => ok({ doisFatores: true }) })
    const { historico } = renderizar(servicos, '/login?redirect=%2Fempresas')
    await screen.findByLabelText('E-mail')
    await preencher()
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/verificacao'))
    expect(historico.location.search).toContain('redirect')
  })

  it('"Entrar com Google" e "Criar conta" só aparecem se a API os liga', async () => {
    const { unmount } = renderizar(servicosFalsos(), '/login')
    await screen.findByLabelText('E-mail')
    expect(screen.queryByRole('button', { name: 'Entrar com Google' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Criar conta' })).toBeNull()
    unmount()

    const servicos = servicosFalsos({
      opcoes: async () => ({ loginGoogle: true }),
      primeiroAcessoAberto: async () => true,
    })
    renderizar(servicos, '/login')
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar com Google' }))
    expect(servicos.entrarComGoogle).toHaveBeenCalled()
    expect(await screen.findByRole('link', { name: 'Criar conta' })).toBeInTheDocument()
  })

  it('"Mostrar" revela a senha e volta a escondê-la', async () => {
    renderizar(servicosFalsos(), '/login')
    const senha = await screen.findByLabelText('Senha')
    expect(senha).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(senha).toHaveAttribute('type', 'text')
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(senha).toHaveAttribute('type', 'password')
  })
})

describe('Verificação em duas etapas no login', () => {
  const abrir = (extra = {}) => {
    const servicos = servicosFalsos(extra)
    const r = renderizar(servicos, '/verificacao')
    return { servicos, ...r }
  }
  const digitar = async (codigo: string) => {
    const primeiro = await screen.findByLabelText('Dígito 1')
    expect(primeiro).toHaveFocus()
    await userEvent.keyboard(codigo)
  }

  it('o foco anda sozinho entre os dígitos e Enter envia', async () => {
    const { servicos } = abrir()
    await digitar('123456')
    expect(screen.getByLabelText('Dígito 6')).toHaveValue('6')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(servicos.verificarCodigo).toHaveBeenCalledWith('123456', true))
  })

  it('colar o código inteiro preenche os seis campos', async () => {
    abrir()
    await userEvent.click(await screen.findByLabelText('Dígito 1'))
    await userEvent.paste('654321')
    expect(screen.getByLabelText('Dígito 1')).toHaveValue('6')
    expect(screen.getByLabelText('Dígito 6')).toHaveValue('1')
  })

  it('código incorreto mostra o erro ligado ao grupo de dígitos', async () => {
    abrir({
      verificarCodigo: async () => falha('INVALID_CODE', 'Código incorreto ou vencido.', 401),
    })
    await digitar('000000')
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }))
    expect(await screen.findByText('Código incorreto ou vencido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Dígito 1')).toBeInvalid()
  })

  it('código incompleto não é enviado', async () => {
    const { servicos } = abrir()
    await digitar('123')
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }))
    expect(screen.getByText('Digite os 6 números do código.')).toBeInTheDocument()
    expect(servicos.verificarCodigo).not.toHaveBeenCalled()
  })

  it('aceita o código de recuperação e a opção de não confiar no aparelho', async () => {
    const { servicos } = abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Usar código de recuperação' }))
    const campo = screen.getByLabelText('Código de recuperação')
    expect(campo).toHaveFocus()
    await userEvent.click(screen.getByLabelText('Confiar neste aparelho por 30 dias'))
    await userEvent.type(campo, 'abcd-1234')
    await userEvent.keyboard('{Enter}')
    await waitFor(() =>
      expect(servicos.verificarCodigoDeRecuperacao).toHaveBeenCalledWith('abcd-1234', false),
    )
  })
})

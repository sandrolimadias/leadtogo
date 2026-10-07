import type { Me } from '@leadtogo/api-client'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { traduzirErro } from '@/auth/erros'
import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const semDoisFatores = (extra: Partial<Me> = {}) =>
  meDeAdmin({
    doisFatoresPendente: true,
    usuario: { ...meDeAdmin().usuario, twoFactorEnabled: false },
    ...extra,
  })

describe('Ativação do 2FA', () => {
  it('senha → QR code e chave → código → códigos de recuperação → app', async () => {
    let ativo = false
    const servicos = servicosFalsos({
      me: async () => (ativo ? meDeAdmin() : semDoisFatores()),
      confirmarDoisFatores: vi.fn(async () => {
        ativo = true
        return ok(undefined)
      }),
    })
    const { historico } = renderizar(servicos, '/')
    // 1. confirma a senha (foco no campo)
    const senha = await screen.findByLabelText('Senha')
    expect(senha).toHaveFocus()
    await userEvent.type(senha, 'segredo-forte-1{Enter}')
    await waitFor(() =>
      expect(servicos.prepararDoisFatores).toHaveBeenCalledWith('segredo-forte-1'),
    )
    // 2. QR code e chave manual
    expect(await screen.findByRole('heading', { name: 'Leia o QR code' })).toBeInTheDocument()
    expect(await screen.findByAltText('QR code para o app autenticador')).toBeInTheDocument()
    expect(screen.getByTestId('chave-manual')).toHaveTextContent('JBSWY3DPEHPK3PXP')
    expect(screen.getByLabelText('Dígito 1')).toHaveFocus()
    await userEvent.keyboard('123456{Enter}')
    await waitFor(() => expect(servicos.confirmarDoisFatores).toHaveBeenCalledWith('123456'))
    // 3. códigos de recuperação: só conclui depois de marcar que guardou
    expect(
      await screen.findByRole('heading', { name: 'Guarde seus códigos de recuperação' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Códigos de recuperação' })).toHaveTextContent(
      'aaaa-1111',
    )
    const concluir = screen.getByRole('button', { name: 'Concluir' })
    expect(concluir).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Guardei meus códigos de recuperação'))
    await userEvent.click(concluir)
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('senha errada mostra o erro no campo', async () => {
    renderizar(
      servicosFalsos({
        me: async () => semDoisFatores(),
        prepararDoisFatores: async () => falha('INVALID_PASSWORD', 'Senha incorreta.', 400),
      }),
      '/ativar-2fa',
    )
    await userEvent.type(await screen.findByLabelText('Senha'), 'errada-errada-1{Enter}')
    expect(await screen.findByLabelText('Senha')).toHaveAccessibleDescription('Senha incorreta.')
  })

  it('código errado na confirmação mostra o erro e não avança', async () => {
    renderizar(
      servicosFalsos({
        me: async () => semDoisFatores(),
        confirmarDoisFatores: async () =>
          falha('INVALID_CODE', 'Código incorreto ou vencido.', 400),
      }),
      '/ativar-2fa',
    )
    await userEvent.type(await screen.findByLabelText('Senha'), 'segredo-forte-1{Enter}')
    await screen.findByRole('heading', { name: 'Leia o QR code' })
    await userEvent.keyboard('111111{Enter}')
    expect(await screen.findByText('Código incorreto ou vencido.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Guarde seus códigos/ })).toBeNull()
  })

  it('permite sair sem ativar', async () => {
    const servicos = servicosFalsos({ me: async () => semDoisFatores() })
    renderizar(servicos, '/ativar-2fa')
    await userEvent.click(await screen.findByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(servicos.sair).toHaveBeenCalled())
  })
})

describe('Recuperação de senha', () => {
  it('"Esqueci a senha" responde igual para qualquer e-mail e leva a "Confira seu e-mail"', async () => {
    const servicos = servicosFalsos()
    renderizar(servicos, '/esqueci-senha')
    const email = await screen.findByLabelText('E-mail')
    expect(email).toHaveFocus()
    await userEvent.type(email, 'quem-quer-que-seja@exemplo.com.br{Enter}')
    await waitFor(() =>
      expect(servicos.pedirNovaSenha).toHaveBeenCalledWith('quem-quer-que-seja@exemplo.com.br'),
    )
    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument()
    expect(screen.getByText(/tiver conta, o link chega em instantes/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar link' }))
    await waitFor(() => expect(servicos.pedirNovaSenha).toHaveBeenCalledTimes(2))
  })

  it('e-mail inválido não é enviado', async () => {
    const servicos = servicosFalsos()
    renderizar(servicos, '/esqueci-senha')
    await userEvent.type(await screen.findByLabelText('E-mail'), 'sem-arroba{Enter}')
    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription('Informe um e-mail válido.')
    expect(servicos.pedirNovaSenha).not.toHaveBeenCalled()
  })

  it('limite de pedidos aparece como erro, sem trocar de tela', async () => {
    renderizar(
      servicosFalsos({
        pedirNovaSenha: async () =>
          falha(
            'limite_de_tentativas',
            'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
            429,
          ),
      }),
      '/esqueci-senha',
    )
    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas')
    expect(screen.getByRole('heading', { name: 'Recuperar senha' })).toBeInTheDocument()
  })

  it('link válido: regras de senha, salva e volta ao login', async () => {
    const servicos = servicosFalsos()
    const { historico } = renderizar(servicos, '/redefinir-senha?token=abc123')
    const campo = await screen.findByLabelText('Senha nova')
    expect(campo).toHaveFocus()
    await userEvent.type(campo, 'curta{Enter}')
    expect(campo).toHaveAccessibleDescription(/precisa cumprir as regras/)
    expect(servicos.redefinirSenha).not.toHaveBeenCalled()
    await userEvent.clear(campo)
    await userEvent.type(campo, 'senha-nova-forte-9{Enter}')
    await waitFor(() =>
      expect(servicos.redefinirSenha).toHaveBeenCalledWith('abc123', 'senha-nova-forte-9'),
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/login'))
  })

  it('link vencido ou usado oferece pedir outro', async () => {
    renderizar(servicosFalsos(), '/redefinir-senha?error=INVALID_TOKEN')
    expect(
      await screen.findByRole('heading', { name: 'Este link não vale mais' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir um novo link' })).toBeInTheDocument()
  })
})

describe('Verificação de e-mail', () => {
  it('link confirmado mostra o sucesso e leva ao login', async () => {
    renderizar(servicosFalsos(), '/verificar-email?confirmado=1')
    expect(await screen.findByRole('heading', { name: 'E-mail confirmado' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/login')
  })

  it('link vencido permite reenviar, com resposta que não revela a conta', async () => {
    const servicos = servicosFalsos()
    renderizar(servicos, '/verificar-email?error=token_expired&email=ana%40exemplo.com.br')
    expect(
      await screen.findByRole('heading', { name: 'Este link não vale mais' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail')).toHaveValue('ana@exemplo.com.br')
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar link' }))
    await waitFor(() =>
      expect(servicos.reenviarVerificacao).toHaveBeenCalledWith('ana@exemplo.com.br'),
    )
    expect(await screen.findByText(/Se esse e-mail tiver uma conta/)).toBeInTheDocument()
  })
})

const conviteNovo = {
  empresa: {
    razaoSocial: 'Dias Automação Industrial Ltda',
    nomeFantasia: 'Dias Automação Industrial',
  },
  email: 'mariana@diasautomacao.com.br',
  papel: 'vendedor' as const,
  expiraEm: '2026-10-20T12:00:00.000Z',
  contaExistente: false,
}

describe('Aceitar convite', () => {
  it('convite inexistente, vencido ou usado mostra a mesma mensagem', async () => {
    renderizar(servicosFalsos(), '/convite?token=xyzxyzxyzxyzxyzxyzxyzxyz')
    expect(await screen.findByRole('heading', { name: 'Convite inválido' })).toBeInTheDocument()
  })

  it('sem token também é convite inválido', async () => {
    renderizar(servicosFalsos(), '/convite')
    expect(await screen.findByRole('heading', { name: 'Convite inválido' })).toBeInTheDocument()
  })

  it('conta nova: nome, senha com regras e termos; cria a conta e entra', async () => {
    let logado = false
    const servicos = servicosFalsos({
      me: async () => (logado ? meDeAdmin({ administradorDeConta: false }) : null),
      consultarConvite: async () => ok(conviteNovo),
      entrar: vi.fn(async () => {
        logado = true
        return ok({ doisFatores: false })
      }),
    })
    const { historico } = renderizar(servicos, '/convite?token=tokentokentokentokentoken')
    expect(await screen.findByText('Dias Automação Industrial')).toBeInTheDocument()
    expect(screen.getByText('mariana@diasautomacao.com.br')).toBeInTheDocument()
    expect(screen.getByLabelText(/Seu nome/)).toHaveFocus()
    // faltam campos: erros ligados, nada enviado
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar e entrar' }))
    expect(screen.getByLabelText(/Seu nome/)).toHaveAccessibleDescription('Informe seu nome.')
    expect(servicos.aceitarConvite).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(/Seu nome/), 'Mariana Gobbi')
    await userEvent.type(screen.getByLabelText('Crie uma senha'), 'senha-forte-123')
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar e entrar' }))
    expect(servicos.aceitarConvite).not.toHaveBeenCalled() // falta o aceite dos termos
    await userEvent.click(screen.getByLabelText(/Li e aceito os termos/))
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar e entrar' }))
    await waitFor(() =>
      expect(servicos.aceitarConvite).toHaveBeenCalledWith({
        token: 'tokentokentokentokentoken',
        nome: 'Mariana Gobbi',
        senha: 'senha-forte-123',
      }),
    )
    await waitFor(() =>
      expect(servicos.entrar).toHaveBeenCalledWith(
        'mariana@diasautomacao.com.br',
        'senha-forte-123',
      ),
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('conta existente sem login: manda entrar e volta ao convite', async () => {
    const { historico } = renderizar(
      servicosFalsos({
        consultarConvite: async () => ok({ ...conviteNovo, contaExistente: true }),
      }),
      '/convite?token=tokentokentokentokentoken',
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar para aceitar' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/login'))
    expect(decodeURIComponent(historico.location.search)).toContain('/convite?token=tokentoken')
  })

  it('conta existente já logada nela: só aceita', async () => {
    const servicos = servicosFalsos({
      me: async () =>
        meDeAdmin({ usuario: { ...meDeAdmin().usuario, email: 'mariana@diasautomacao.com.br' } }),
      consultarConvite: async () => ok({ ...conviteNovo, contaExistente: true }),
    })
    renderizar(servicos, '/convite?token=tokentokentokentokentoken')
    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar convite' }))
    await waitFor(() =>
      expect(servicos.aceitarConvite).toHaveBeenCalledWith({ token: 'tokentokentokentokentoken' }),
    )
  })

  it('logado em outra conta: avisa e oferece sair', async () => {
    renderizar(
      servicosFalsos({
        me: async () => meDeAdmin(),
        consultarConvite: async () => ok({ ...conviteNovo, contaExistente: true }),
      }),
      '/convite?token=tokentokentokentokentoken',
    )
    expect(await screen.findByText(/o convite é para mariana@/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Sair e entrar com a conta convidada' }),
    ).toBeInTheDocument()
  })
})

describe('Primeiro acesso', () => {
  it('fechado: mostra uma mensagem clara, sem formulário', async () => {
    renderizar(servicosFalsos({ primeiroAcessoAberto: async () => false }), '/primeiro-acesso')
    expect(
      await screen.findByRole('heading', { name: 'O cadastro está fechado' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Seu nome')).toBeNull()
    expect(screen.getByRole('button', { name: 'Ir para o login' })).toBeInTheDocument()
  })

  it('aberto: conta → empresa → tudo pronto → entra e cai na ativação do 2FA', async () => {
    let logado = false
    const servicos = servicosFalsos({
      primeiroAcessoAberto: async () => true,
      me: async () => (logado ? semDoisFatores() : null),
      entrar: vi.fn(async () => {
        logado = true
        return ok({ doisFatores: false })
      }),
    })
    const { historico } = renderizar(servicos, '/primeiro-acesso')
    // passo 1
    expect(await screen.findByText('Passo 1 de 3 · Conta')).toBeInTheDocument()
    expect(screen.getByLabelText('Seu nome')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(screen.getByLabelText('Seu nome')).toHaveAccessibleDescription('Informe seu nome.')
    await userEvent.type(screen.getByLabelText('Seu nome'), 'Alessandro Dias')
    await userEvent.type(
      screen.getByLabelText('E-mail do trabalho'),
      'alessandro@diasautomacao.com.br',
    )
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte-123')
    await userEvent.click(screen.getByLabelText(/Li e aceito os termos/))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    // passo 2
    expect(await screen.findByText('Passo 2 de 3 · Empresa')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Razão social/), 'Dias Automação Industrial Ltda')
    await userEvent.type(screen.getByLabelText('CNPJ'), '11111111111111')
    await userEvent.click(screen.getByRole('button', { name: 'Criar empresa' }))
    expect(screen.getByLabelText('CNPJ')).toHaveAccessibleDescription(/CNPJ inválido/)
    await userEvent.clear(screen.getByLabelText('CNPJ'))
    await userEvent.click(screen.getByRole('button', { name: 'Criar empresa' }))
    await waitFor(() =>
      expect(servicos.criarPrimeiroAcesso).toHaveBeenCalledWith({
        nome: 'Alessandro Dias',
        email: 'alessandro@diasautomacao.com.br',
        senha: 'senha-forte-123',
        empresa: { razaoSocial: 'Dias Automação Industrial Ltda' },
      }),
    )
    // passo 3
    expect(await screen.findByRole('heading', { name: 'Tudo pronto' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/ativar-2fa'))
  })

  it('e-mail já cadastrado volta ao passo da conta, com o erro no campo', async () => {
    renderizar(
      servicosFalsos({
        primeiroAcessoAberto: async () => true,
        criarPrimeiroAcesso: async () =>
          falha(
            'email_ja_cadastrado',
            'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
            409,
          ),
      }),
      '/primeiro-acesso',
    )
    await userEvent.type(await screen.findByLabelText('Seu nome'), 'Ana Souza')
    await userEvent.type(screen.getByLabelText('E-mail do trabalho'), 'ana@exemplo.com.br')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte-123')
    await userEvent.click(screen.getByLabelText(/Li e aceito os termos/))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await userEvent.type(await screen.findByLabelText(/Razão social/), 'Ana Ltda')
    await userEvent.click(screen.getByRole('button', { name: 'Criar empresa' }))
    expect(await screen.findByText('Passo 1 de 3 · Conta')).toBeInTheDocument()
    expect(screen.getByLabelText('E-mail do trabalho')).toHaveAccessibleDescription(
      /Já existe uma conta/,
    )
  })

  it('com a verificação de e-mail ligada, avisa para confirmar antes de entrar', async () => {
    renderizar(
      servicosFalsos({
        primeiroAcessoAberto: async () => true,
        criarPrimeiroAcesso: async () =>
          ok({
            usuarioId: 'u',
            contaId: 'c',
            tenantId: 't',
            membroId: 'm',
            verificacaoEmailPendente: true,
          }),
      }),
      '/primeiro-acesso',
    )
    await userEvent.type(await screen.findByLabelText('Seu nome'), 'Ana Souza')
    await userEvent.type(screen.getByLabelText('E-mail do trabalho'), 'ana@exemplo.com.br')
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-forte-123')
    await userEvent.click(screen.getByLabelText(/Li e aceito os termos/))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await userEvent.type(await screen.findByLabelText(/Razão social/), 'Ana Ltda')
    await userEvent.click(screen.getByRole('button', { name: 'Criar empresa' }))
    expect(await screen.findByText(/Enviamos um link para ana@exemplo.com.br/)).toBeInTheDocument()
  })
})

describe('traduzirErro', () => {
  it('traduz códigos do Better Auth e da API', () => {
    expect(
      traduzirErro(401, { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' })
        .mensagem,
    ).toBe('E-mail ou senha não conferem.')
    expect(traduzirErro(400, { erro: 'convite_invalido', mensagem: 'x' }).mensagem).toMatch(
      /não vale mais/,
    )
  })
  it('429 vira mensagem de limite; erro desconhecido nunca expõe texto em inglês', () => {
    expect(
      traduzirErro(429, { message: 'Too many requests. Please try again later.' }).mensagem,
    ).toMatch(/Muitas tentativas/)
    const r = traduzirErro(500, { code: 'ALGO_NOVO', message: 'Something broke' })
    expect(r.mensagem).not.toMatch(/Something/)
    expect(r.mensagem).toMatch(/Tente de novo/)
  })
  it('mensagem em pt-BR da própria API passa quando o código não tem texto próprio', () => {
    expect(
      traduzirErro(400, { erro: 'validacao_invalida', mensagem: 'Dados inválidos.' }).mensagem,
    ).toBe('Dados inválidos.')
  })
})

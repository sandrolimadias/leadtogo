import type { ConviteResumo, MembroDaEquipe } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const empresa = (papel: 'admin' | 'gestor' | 'vendedor') => ({
  id: A,
  razaoSocial: 'Aurora Ltda',
  nomeFantasia: 'Aurora',
  papel,
  situacao: 'ativo' as const,
  ativa: true,
})
const meComPapel = (papel: 'admin' | 'gestor' | 'vendedor', extra = {}) =>
  meDeAdmin({
    empresas: [empresa(papel)],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
    ...extra,
  })

const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const membro = (n: number, extra: Partial<MembroDaEquipe> = {}): MembroDaEquipe => ({
  id: id(n),
  nome: `Pessoa ${n}`,
  cargo: null,
  email: `pessoa${n}@exemplo.com.br`,
  papel: 'vendedor',
  ativo: true,
  temLogin: true,
  cor: null,
  ultimoAcesso: null,
  ...extra,
})
const eu = membro(1, {
  nome: 'Alessandro Dias',
  email: 'alessandro@exemplo.com.br',
  papel: 'admin',
  ultimoAcesso: '2026-10-12',
})
const convite = (n: number, extra: Partial<ConviteResumo> = {}): ConviteResumo => ({
  id: id(100 + n),
  email: `convidado${n}@exemplo.com.br`,
  papel: 'gestor',
  expiraEm: '2026-10-19T15:00:00.000Z',
  criadoEm: '2026-10-12T15:00:00.000Z',
  situacao: 'pendente',
  ...extra,
})

function servicosDeUsuarios(equipe: MembroDaEquipe[], pendentes: ConviteResumo[] = [], extra = {}) {
  return servicosFalsos({
    me: async () => meComPapel('admin'),
    equipe: vi.fn(async () => ok(equipe)),
    convitesPendentes: vi.fn(async () => ok(pendentes)),
    ...extra,
  })
}
const linhaDe = (nome: string) => screen.findByRole('listitem', { name: nome })
const abrirUsuarios = () => screen.findByRole('heading', { name: 'Usuários e equipe' })

describe('Configurações: proteção por papel', () => {
  it.each(['gestor', 'vendedor'] as const)(
    '%s volta para o início ao abrir /configuracoes/usuarios',
    async (papel) => {
      const { historico } = renderizar(
        servicosFalsos({ me: async () => meComPapel(papel) }),
        '/configuracoes/usuarios',
      )
      await waitFor(() => expect(historico.location.pathname).toBe('/'))
      expect(screen.queryByRole('heading', { name: 'Usuários e equipe' })).toBeNull()
    },
  )

  it('quem só administra a conta (vendedor na empresa ativa) também é barrado em /configuracoes/seguranca', async () => {
    const { historico } = renderizar(
      servicosFalsos({ me: async () => meComPapel('vendedor', { administradorDeConta: true }) }),
      '/configuracoes/seguranca',
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('administrador: /configuracoes abre Usuários e o menu interno tem Usuários e Segurança', async () => {
    const { historico } = renderizar(servicosDeUsuarios([eu, membro(2)]), '/configuracoes')
    await abrirUsuarios()
    expect(historico.location.pathname).toBe('/configuracoes/usuarios')
    const menu = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(menu).getByRole('link', { name: /Usuários e equipe/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(menu).getByRole('link', { name: /Segurança/ })).toBeInTheDocument()
  })
})

describe('Usuários: estados', () => {
  it('carrega mostrando o esqueleto', async () => {
    renderizar(
      servicosDeUsuarios([eu], [], { equipe: () => new Promise(() => undefined) }),
      '/configuracoes/usuarios',
    )
    expect(await screen.findByRole('status', { name: 'Carregando a equipe' })).toBeInTheDocument()
  })

  it('erro ao carregar: mostra o motivo e "Tentar de novo" recarrega', async () => {
    const equipe = vi
      .fn()
      .mockResolvedValueOnce(falha('x', 'Servidor fora do ar.', 503))
      .mockResolvedValue(ok([eu, membro(2)]))
    renderizar(servicosDeUsuarios([], [], { equipe }), '/configuracoes/usuarios')
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor fora do ar.')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await linhaDe('Pessoa 2')).toBeInTheDocument()
  })

  it('vazio (só a própria pessoa): convida a convidar', async () => {
    renderizar(servicosDeUsuarios([eu]), '/configuracoes/usuarios')
    expect(
      await screen.findByRole('heading', { name: 'Você é a única pessoa por aqui' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Convidar pessoa' })).toHaveLength(2)
  })

  it('lista membros e convites com situação, acesso, último acesso (só a data) e contagem', async () => {
    renderizar(
      servicosDeUsuarios(
        [
          eu,
          membro(2, { nome: 'Bruno Sossai', ativo: false, ultimoAcesso: '2026-09-30' }),
          membro(3, { nome: 'Wagner Cypriano', temLogin: false, email: null }),
          membro(4, { nome: 'Carolina Surlo' }),
        ],
        [convite(1), convite(2, { situacao: 'expirado' })],
      ),
      '/configuracoes/usuarios',
    )
    const eul = await linhaDe('Alessandro Dias')
    expect(await within(eul).findByText('(você)')).toBeInTheDocument()
    expect(within(eul).getByText('Acesso em 12/10/2026')).toBeInTheDocument()
    // a própria pessoa não se desativa nem muda o próprio papel
    expect(within(eul).queryByRole('button')).toBeNull()
    expect(within(eul).getByRole('combobox', { name: /Papel de/ })).toBeDisabled()

    const bruno = screen.getByRole('listitem', { name: 'Bruno Sossai' })
    expect(within(bruno).getByText('Inativo')).toBeInTheDocument()
    expect(within(bruno).getByText('Acesso em 30/09/2026')).toBeInTheDocument()
    expect(within(bruno).getByRole('button', { name: 'Reativar' })).toBeInTheDocument()

    const wagner = screen.getByRole('listitem', { name: 'Wagner Cypriano' })
    expect(within(wagner).getByText('Sem acesso')).toBeInTheDocument()
    expect(within(wagner).getByText('Sem login')).toBeInTheDocument()
    expect(
      within(screen.getByRole('listitem', { name: 'Carolina Surlo' })).getByText('Nunca entrou'),
    ).toBeInTheDocument()

    const c1 = screen.getByRole('listitem', { name: 'Convite para convidado1@exemplo.com.br' })
    expect(within(c1).getByText('Convidado')).toBeInTheDocument()
    expect(within(c1).getByText(/Expira em 19\/10\/2026/)).toBeInTheDocument()
    expect(
      within(
        screen.getByRole('listitem', { name: 'Convite para convidado2@exemplo.com.br' }),
      ).getByText('Convite expirado'),
    ).toBeInTheDocument()
    expect(screen.getByText('3 ativos · 2 convites pendentes')).toBeInTheDocument()
  })
})

describe('Usuários: ações', () => {
  it('muda o papel de um vendedor na hora', async () => {
    const alterarMembro = vi.fn(async () => ok(membro(2, { papel: 'gestor' })))
    renderizar(
      servicosDeUsuarios([eu, membro(2)], [], { alterarMembro }),
      '/configuracoes/usuarios',
    )
    const linha = await linhaDe('Pessoa 2')
    await userEvent.selectOptions(within(linha).getByRole('combobox'), 'gestor')
    await waitFor(() => expect(alterarMembro).toHaveBeenCalledWith(id(2), { papel: 'gestor' }))
  })

  it('rebaixar um administrador pede confirmação; o erro da API aparece no diálogo', async () => {
    const alterarMembro = vi
      .fn()
      .mockResolvedValue(
        falha(
          'dono_da_conta',
          'O dono da conta não pode ser rebaixado nem desativado por outro administrador.',
          403,
        ),
      )
    renderizar(
      servicosDeUsuarios([eu, membro(2, { nome: 'Dono Da Conta', papel: 'admin' })], [], {
        alterarMembro,
      }),
      '/configuracoes/usuarios',
    )
    const linha = await linhaDe('Dono Da Conta')
    await userEvent.selectOptions(within(linha).getByRole('combobox'), 'gestor')
    const dialogo = await screen.findByRole('dialog', { name: 'Mudar o papel de Dono Da Conta?' })
    expect(alterarMembro).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Mudar papel' }))
    await waitFor(() => expect(alterarMembro).toHaveBeenCalledWith(id(2), { papel: 'gestor' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('dono da conta')
  })

  it('desativar pede confirmação e depois chama a API', async () => {
    const alterarMembro = vi.fn(async () => ok(membro(2, { ativo: false })))
    renderizar(
      servicosDeUsuarios([eu, membro(2)], [], { alterarMembro }),
      '/configuracoes/usuarios',
    )
    const linha = await linhaDe('Pessoa 2')
    await userEvent.click(within(linha).getByRole('button', { name: 'Desativar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Desativar Pessoa 2?' })
    expect(dialogo).toHaveTextContent('perde o acesso a esta empresa na hora')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Desativar' }))
    await waitFor(() => expect(alterarMembro).toHaveBeenCalledWith(id(2), { ativo: false }))
  })

  it('reativar é direto', async () => {
    const alterarMembro = vi.fn(async () => ok(membro(2)))
    renderizar(
      servicosDeUsuarios([eu, membro(2, { ativo: false })], [], { alterarMembro }),
      '/configuracoes/usuarios',
    )
    const linha = await linhaDe('Pessoa 2')
    await userEvent.click(within(linha).getByRole('button', { name: 'Reativar' }))
    await waitFor(() => expect(alterarMembro).toHaveBeenCalledWith(id(2), { ativo: true }))
  })

  it('reenviar convida de novo com o mesmo e-mail e papel; cancelar pede confirmação', async () => {
    const convidar = vi.fn(async () =>
      ok({ ...convite(1), emailEnviado: true, situacao: 'pendente' as const }),
    )
    const cancelarConvite = vi.fn(async () => ok(undefined))
    renderizar(
      servicosDeUsuarios([eu, membro(2)], [convite(1)], { convidar, cancelarConvite }),
      '/configuracoes/usuarios',
    )
    const linha = await linhaDe('Convite para convidado1@exemplo.com.br')
    await userEvent.click(within(linha).getByRole('button', { name: 'Reenviar' }))
    await waitFor(() =>
      expect(convidar).toHaveBeenCalledWith({
        email: 'convidado1@exemplo.com.br',
        papel: 'gestor',
      }),
    )
    await userEvent.click(within(linha).getByRole('button', { name: 'Cancelar' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Cancelar este convite?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar convite' }))
    await waitFor(() => expect(cancelarConvite).toHaveBeenCalledWith(id(101)))
  })
})

describe('Convidar pessoa', () => {
  it('valida o e-mail, envia com o papel escolhido e fecha', async () => {
    const convidar = vi.fn(async () =>
      ok({ ...convite(9), email: 'nova@exemplo.com.br', emailEnviado: true }),
    )
    renderizar(servicosDeUsuarios([eu, membro(2)], [], { convidar }), '/configuracoes/usuarios')
    await abrirUsuarios()
    await userEvent.click(screen.getByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Convidar pessoa' })
    expect(dialogo).toHaveTextContent('O convite vale por 7 dias.')

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar convite' }))
    expect(await within(dialogo).findByText('Informe um e-mail válido.')).toBeInTheDocument()
    expect(convidar).not.toHaveBeenCalled()

    await userEvent.type(within(dialogo).getByLabelText(/E-mail/), '  nova@exemplo.com.br ')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Papel'), 'gestor')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar convite' }))
    await waitFor(() =>
      expect(convidar).toHaveBeenCalledWith({ email: 'nova@exemplo.com.br', papel: 'gestor' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Convidar pessoa' })).toBeNull(),
    )
  })

  it('e-mail que já é da equipe: mensagem clara no diálogo, que fica aberto', async () => {
    const convidar = vi.fn(async () =>
      falha('ja_e_membro', 'Este e-mail já faz parte da equipe.', 409),
    )
    renderizar(servicosDeUsuarios([eu, membro(2)], [], { convidar }), '/configuracoes/usuarios')
    await abrirUsuarios()
    await userEvent.click(screen.getByRole('button', { name: 'Convidar pessoa' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Convidar pessoa' })
    await userEvent.type(within(dialogo).getByLabelText(/E-mail/), 'pessoa2@exemplo.com.br')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar convite' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Este e-mail já faz parte da equipe.',
    )
  })
})

describe('Configurações → Segurança da empresa', () => {
  it('mostra a política atual, só habilita Salvar ao mudar e salva', async () => {
    const alterarPoliticaDeDoisFatores = vi.fn(async (p: string) =>
      ok({ doisFatoresExigido: p as 'todos' }),
    )
    renderizar(
      servicosFalsos({ me: async () => meComPapel('admin'), alterarPoliticaDeDoisFatores }),
      '/configuracoes/seguranca',
    )
    const admins = await screen.findByRole('radio', {
      name: /^AdministradoresSó os administradores/,
    })
    expect(admins).toBeChecked()
    const salvar = screen.getByRole('button', { name: 'Salvar' })
    expect(salvar).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: /Todos os membros/ }))
    await userEvent.click(salvar)
    await waitFor(() => expect(alterarPoliticaDeDoisFatores).toHaveBeenCalledWith('todos'))
    expect(await screen.findByRole('radio', { name: /Todos os membros/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('erro ao carregar e erro ao salvar mostram a mensagem', async () => {
    const seguranca = vi
      .fn()
      .mockResolvedValueOnce(falha('x', 'Sem conexão com o servidor.', 0))
      .mockResolvedValue(ok({ doisFatoresExigido: 'admin' as const }))
    const alterarPoliticaDeDoisFatores = vi.fn(async () =>
      falha('acesso_negado', 'Só administradores da empresa podem alterar a segurança.', 403),
    )
    renderizar(
      servicosFalsos({
        me: async () => meComPapel('admin'),
        seguranca,
        alterarPoliticaDeDoisFatores,
      }),
      '/configuracoes/seguranca',
    )
    expect(await screen.findByText('Sem conexão com o servidor.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await userEvent.click(await screen.findByRole('radio', { name: /Todos os membros/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(
      await screen.findByText('Só administradores da empresa podem alterar a segurança.'),
    ).toBeInTheDocument()
  })
})

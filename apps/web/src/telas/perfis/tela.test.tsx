import type { PerfilDeAcesso } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  meDeAdmin,
  ok,
  perfisDeSistema,
  renderizar,
  servicosFalsos,
} from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const meAdmin = () =>
  meDeAdmin({
    empresas: [
      {
        id: A,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel: 'admin',
        situacao: 'ativo',
        ativa: true,
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

const daEmpresa = (extra: Partial<PerfilDeAcesso> = {}): PerfilDeAcesso => ({
  id: '0192f0a0-0000-7000-8000-0000000000e1',
  nome: 'Supervisor',
  descricao: null,
  sistema: false,
  chaveSistema: null,
  exige2fa: false,
  ativo: true,
  membros: 0,
  permissoes: { 'empresas.ver': 'equipe' },
  ...extra,
})

function servicos(perfis: PerfilDeAcesso[], extra: Record<string, unknown> = {}) {
  const s = servicosFalsos({ me: async () => meAdmin() })
  s.perfis.listar = vi.fn(async () => ok(perfis))
  Object.assign(s.perfis, extra)
  return s
}

const abrir = () => screen.findByRole('list', { name: 'Perfis' })

describe('Configurações → Perfis de acesso', () => {
  it('lista os perfis (nome, usuários, sistema ou da empresa) e abre o primeiro', async () => {
    const [admin, gestor, vendedor] = perfisDeSistema()
    renderizar(
      servicos([{ ...admin!, membros: 2 }, gestor!, vendedor!, daEmpresa({ membros: 1 })]),
      '/configuracoes/perfis',
    )
    await abrir()
    const lista = screen.getByRole('list', { name: 'Perfis' })
    expect(
      within(lista).getByRole('button', { name: /Administrador.*Sistema.*2 usuários/ }),
    ).toBeInTheDocument()
    expect(
      within(lista).getByRole('button', { name: /Supervisor.*Da empresa.*1 usuário/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Perfil Administrador' })).toBeInTheDocument()
    // o menu interno traz a seção
    const menu = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(menu).getByRole('link', { name: /Perfis de acesso/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('o Administrador não perde a gestão dos perfis nem a da equipe (caixas travadas)', async () => {
    renderizar(servicos(perfisDeSistema()), '/configuracoes/perfis')
    await abrir()
    const detalhe = screen.getByRole('region', { name: 'Perfil Administrador' })
    expect(
      within(detalhe).getByRole('checkbox', {
        name: 'Gerir perfis de acesso e atribuí-los aos membros',
      }),
    ).toBeDisabled()
    expect(
      within(detalhe).getByRole('checkbox', {
        name: 'Convidar, desativar e ver o acesso dos membros',
      }),
    ).toBeDisabled()
    expect(within(detalhe).queryByRole('button', { name: 'Excluir' })).toBeNull()
  })

  it('marca permissão com alcance e salva; com membros, avisa quantos serão afetados', async () => {
    const editar = vi.fn(async (_id: string, dados: object) => ok({ ...daEmpresa(), ...dados }))
    renderizar(servicos([daEmpresa({ membros: 3 })], { editar }), '/configuracoes/perfis')
    await abrir()
    const detalhe = screen.getByRole('region', { name: 'Perfil Supervisor' })
    await userEvent.click(within(detalhe).getByRole('checkbox', { name: 'Editar empresas' }))
    await userEvent.selectOptions(
      within(detalhe).getByRole('combobox', { name: 'Alcance: Editar empresas' }),
      'equipe',
    )
    await userEvent.click(within(detalhe).getByRole('button', { name: 'Salvar perfil' }))
    const aviso = await screen.findByRole('dialog', { name: '3 usuários serão afetados' })
    expect(editar).not.toHaveBeenCalled()
    await userEvent.click(within(aviso).getByRole('button', { name: 'Salvar mesmo assim' }))
    await waitFor(() =>
      expect(editar).toHaveBeenCalledWith(
        daEmpresa().id,
        expect.objectContaining({
          permissoes: { 'empresas.ver': 'equipe', 'empresas.editar': 'equipe' },
        }),
      ),
    )
  })

  it('perfil sem membros salva direto; Salvar fica desligado sem mudança', async () => {
    const editar = vi.fn(async () => ok(daEmpresa()))
    renderizar(servicos([daEmpresa()], { editar }), '/configuracoes/perfis')
    await abrir()
    const detalhe = screen.getByRole('region', { name: 'Perfil Supervisor' })
    const salvar = within(detalhe).getByRole('button', { name: 'Salvar perfil' })
    expect(salvar).toBeDisabled()
    await userEvent.click(
      within(detalhe).getByRole('checkbox', {
        name: 'Importar planilhas, ver prévias e relatórios',
      }),
    )
    await userEvent.click(salvar)
    await waitFor(() => expect(editar).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('duplicar e criar pedem o nome; excluir perfil da empresa sem membros', async () => {
    const copia = daEmpresa({ id: '0192f0a0-0000-7000-8000-0000000000e2', nome: 'Gestor regional' })
    const duplicar = vi.fn(async () => ok(copia))
    const criar = vi.fn(async () =>
      ok(daEmpresa({ id: '0192f0a0-0000-7000-8000-0000000000e3', nome: 'Externo' })),
    )
    const excluir = vi.fn(async () => ok(undefined))
    const [, gestor] = perfisDeSistema()
    renderizar(
      servicos([gestor!, daEmpresa()], { duplicar, criar, excluir }),
      '/configuracoes/perfis',
    )
    await abrir()

    await userEvent.click(screen.getByRole('button', { name: 'Duplicar' }))
    const dDup = await screen.findByRole('dialog', { name: 'Duplicar Gestor' })
    const campo = within(dDup).getByLabelText(/Nome do perfil/)
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Gestor regional')
    await userEvent.click(within(dDup).getByRole('button', { name: 'Duplicar' }))
    await waitFor(() => expect(duplicar).toHaveBeenCalledWith(gestor!.id, 'Gestor regional'))

    await userEvent.click(screen.getByRole('button', { name: 'Novo perfil' }))
    const dNovo = await screen.findByRole('dialog', { name: 'Novo perfil de acesso' })
    await userEvent.type(within(dNovo).getByLabelText(/Nome do perfil/), 'Externo')
    await userEvent.click(within(dNovo).getByRole('button', { name: 'Criar perfil' }))
    await waitFor(() => expect(criar).toHaveBeenCalledWith({ nome: 'Externo' }))

    await userEvent.click(
      within(screen.getByRole('list', { name: 'Perfis' })).getByRole('button', {
        name: /Supervisor/,
      }),
    )
    const detalhe = await screen.findByRole('region', { name: 'Perfil Supervisor' })
    await userEvent.click(within(detalhe).getByRole('button', { name: 'Excluir' }))
    const dExc = await screen.findByRole('dialog', { name: 'Excluir o perfil Supervisor?' })
    await userEvent.click(within(dExc).getByRole('button', { name: 'Excluir perfil' }))
    await waitFor(() => expect(excluir).toHaveBeenCalledWith(daEmpresa().id))
  })

  it('aba Usuários do perfil lista quem tem o perfil', async () => {
    const membros = vi.fn(async () =>
      ok([
        { id: '0192f0a0-0000-7000-8000-000000000071', nome: 'Ana', ativo: true, temLogin: true },
        { id: '0192f0a0-0000-7000-8000-000000000072', nome: 'Bia', ativo: false, temLogin: true },
      ]),
    )
    renderizar(servicos([daEmpresa({ membros: 2 })], { membros }), '/configuracoes/perfis')
    await abrir()
    await userEvent.click(screen.getByRole('tab', { name: /Usuários do perfil/ }))
    const lista = await screen.findByRole('list', { name: 'Usuários do perfil' })
    expect(within(lista).getByText('Ana')).toBeInTheDocument()
    expect(within(lista).getByText('Inativo')).toBeInTheDocument()
  })

  it('"Quem pode o quê" mostra cada permissão por perfil, com o alcance', async () => {
    renderizar(servicos(perfisDeSistema()), '/configuracoes/perfis')
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Quem pode o quê' }))
    const tabela = await screen.findByRole('table', { name: 'Quem pode o quê' })
    const linha = within(tabela).getByRole('row', { name: /Ver empresas/ })
    const celulas = within(linha)
      .getAllByRole('cell')
      .map((c) => c.textContent)
    expect(celulas).toEqual(['Todas', 'Todas', 'Só a própria carteira'])
  })

  it('sem perfis.gerir, a seção não aparece no menu', async () => {
    const me = meDeAdmin({
      empresas: [
        {
          id: A,
          razaoSocial: 'Aurora Ltda',
          nomeFantasia: 'Aurora',
          papel: 'vendedor',
          situacao: 'ativo',
          ativa: true,
          perfil: { id: '0192f0a0-0000-7000-8000-0000000000e9', nome: 'Cadastrista' },
          permissoes: { 'cadastros.gerir': true },
        },
      ],
      empresaAtivaId: A,
      administradorDeConta: false,
      doisFatoresObrigatorio: false,
    })
    renderizar(servicosFalsos({ me: async () => me }), '/configuracoes/tags')
    const menu = await screen.findByRole('navigation', { name: 'Configurações' })
    expect(within(menu).queryByRole('link', { name: /Perfis de acesso/ })).toBeNull()
  })
})

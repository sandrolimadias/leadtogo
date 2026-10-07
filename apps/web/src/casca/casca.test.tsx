import type { Me, Preferencias, PreferenciasPatch } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const empresa = (
  id: string,
  nome: string,
  papel: 'admin' | 'gestor' | 'vendedor',
  ativa: boolean,
) => ({
  id,
  razaoSocial: `${nome} Ltda`,
  nomeFantasia: nome,
  papel,
  situacao: 'ativo' as const,
  ativa,
})

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const B = '01a111e8-f08a-70b7-b5f3-52998ced0a3b'

function meComDuasEmpresas(ativa: string | null = A, extra: Partial<Me> = {}): Me {
  return meDeAdmin({
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
    empresaAtivaId: ativa,
    precisaEscolherEmpresa: ativa === null,
    empresas: [
      empresa(A, 'Aurora Móveis', 'admin', ativa === A),
      empresa(B, 'Borealis Logística', 'vendedor', ativa === B),
    ],
    ...extra,
  })
}

function largura(px: number) {
  Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true })
}
afterEach(() => {
  largura(1280)
  document.documentElement.removeAttribute('data-theme')
})

/** Sessão que muda quando a empresa é trocada (como a API faria). */
function servicosDaCasca(inicial: Me, extra = {}) {
  let atual = inicial
  let prefs: Preferencias = {
    tema: 'sistema',
    menuRecolhido: false,
    visaoDashboard: 'minha',
    filtroPadrao: {},
  }
  return servicosFalsos({
    me: async () => atual,
    trocarEmpresa: vi.fn(async (id: string) => {
      atual = meComDuasEmpresas(id)
      return ok(undefined)
    }),
    // como a API: guarda o que veio no patch e devolve o conjunto completo
    preferencias: async () => prefs,
    alterarPreferencias: vi.fn(async (patch: PreferenciasPatch) => {
      prefs = {
        ...prefs,
        ...(patch.tema != null ? { tema: patch.tema } : {}),
        ...(patch.menuRecolhido != null ? { menuRecolhido: patch.menuRecolhido } : {}),
      }
      return ok(prefs)
    }),
    ...extra,
  })
}

describe('casca no desktop', () => {
  it('mostra o menu lateral com a tela atual marcada, a empresa ativa e a barra superior', async () => {
    renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    for (const nome of [
      'Empresas',
      'Contatos',
      'Oportunidades',
      'Tarefas',
      'Prospecção',
      'Rotas',
    ]) {
      expect(within(nav).getByRole('link', { name: new RegExp(nome) })).toBeInTheDocument()
    }
    expect(within(nav).getByText('Carteira')).toBeInTheDocument()
    expect(within(nav).getByText('Fase 3')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /Aurora Móveis/ })).toHaveTextContent(
      'Administrador',
    )
    expect(screen.getByRole('searchbox', { name: /Buscar empresas/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar atividade' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Notificações' })).toBeInTheDocument()
  })

  it('navega sem recarregar e marca a nova tela', async () => {
    const { historico } = renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    await userEvent.click(await screen.findByRole('link', { name: 'Empresas' }))
    expect(await screen.findByRole('heading', { name: 'Empresas' })).toBeInTheDocument()
    expect(historico.location.pathname).toBe('/empresas')
    expect(screen.getByRole('link', { name: 'Empresas' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('recolhe e expande o menu e guarda a preferência', async () => {
    const servicos = servicosDaCasca(meComDuasEmpresas())
    renderizar(servicos, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Recolher menu' }))
    expect(await screen.findByRole('button', { name: 'Expandir menu' })).toBeInTheDocument()
    expect(screen.queryByText('Carteira')).toBeNull()
    await waitFor(() =>
      expect(servicos.alterarPreferencias).toHaveBeenCalledWith({ menuRecolhido: true }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Expandir menu' }))
    await waitFor(() =>
      expect(servicos.alterarPreferencias).toHaveBeenLastCalledWith({ menuRecolhido: false }),
    )
  })

  it('abre já recolhido quando a preferência salva é essa', async () => {
    renderizar(
      servicosDaCasca(meComDuasEmpresas(), {
        preferencias: async () => ({
          tema: 'sistema',
          menuRecolhido: true,
          visaoDashboard: 'minha',
          filtroPadrao: {},
        }),
      }),
      '/',
    )
    expect(await screen.findByRole('button', { name: 'Expandir menu' })).toBeInTheDocument()
    // recolhido: os itens seguem acessíveis pelo nome
    expect(screen.getByRole('link', { name: 'Empresas' })).toBeInTheDocument()
  })

  it('troca de empresa pelo seletor, mantém a tela e avisa', async () => {
    const servicos = servicosDaCasca(meComDuasEmpresas())
    const { historico } = renderizar(servicos, '/empresas')
    await userEvent.click(await screen.findByRole('button', { name: /Aurora Móveis/ }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Suas empresas')).toBeInTheDocument()
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: /Borealis Logística · Vendedor/ }),
    )
    await waitFor(() => expect(servicos.trocarEmpresa).toHaveBeenCalledWith(B))
    expect(await screen.findByText('Empresa ativa trocada')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Borealis Logística/ })).toHaveTextContent(
      'Vendedor',
    )
    expect(historico.location.pathname).toBe('/empresas')
  })

  it('muda o tema e guarda a preferência; "Sair" encerra a sessão', async () => {
    const servicos = servicosDaCasca(meComDuasEmpresas())
    renderizar(servicos, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Menu de Alessandro Dias' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Escuro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    await waitFor(() =>
      expect(servicos.alterarPreferencias).toHaveBeenCalledWith({ tema: 'escuro' }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Menu de Alessandro Dias' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))
    await waitFor(() => expect(servicos.sair).toHaveBeenCalled())
  })

  it('"Meu perfil → Segurança" abre a tela de segurança dentro da casca', async () => {
    const { historico } = renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Menu de Alessandro Dias' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Meu perfil → Segurança' }))
    expect(await screen.findByRole('heading', { name: 'Segurança' })).toBeInTheDocument()
    expect(historico.location.pathname).toBe('/perfil/seguranca')
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
  })

  it('o sino abre o painel de notificações (ainda vazio)', async () => {
    renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Notificações' }))
    expect(await screen.findByText('Nenhuma notificação')).toBeInTheDocument()
  })
})

describe('sem empresa ativa: seletor de empresa', () => {
  it('mostra a lista, escolhe uma e abre o app nela', async () => {
    const servicos = servicosDaCasca(meComDuasEmpresas(null))
    renderizar(servicos, '/')
    expect(await screen.findByRole('heading', { name: 'Escolha a empresa' })).toBeInTheDocument()
    const lista = screen.getByRole('list', { name: 'Suas empresas' })
    expect(within(lista).getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull() // o app só abre depois
    await userEvent.click(within(lista).getByRole('button', { name: /Borealis Logística/ }))
    await waitFor(() => expect(servicos.trocarEmpresa).toHaveBeenCalledWith(B))
    expect(await screen.findByRole('navigation', { name: 'Principal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Borealis Logística/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Escolha a empresa' })).toBeNull()
  })

  it('mostra o aviso quando a troca falha, sem abrir o app', async () => {
    renderizar(
      servicosDaCasca(meComDuasEmpresas(null), {
        trocarEmpresa: async () => ({
          ok: false as const,
          erro: {
            codigo: 'empresa_indisponivel',
            mensagem: 'Esta empresa está suspensa ou cancelada.',
            status: 403,
          },
        }),
      }),
      '/',
    )
    await userEvent.click(await screen.findByRole('button', { name: /Aurora Móveis/ }))
    expect(await screen.findByText('Não foi possível trocar de empresa')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Escolha a empresa' })).toBeInTheDocument()
  })

  it('empresa suspensa aparece, mas não dá para escolher', async () => {
    const me = meComDuasEmpresas(null)
    me.empresas[1] = { ...me.empresas[1]!, situacao: 'suspenso' }
    renderizar(servicosDaCasca(me), '/')
    expect(await screen.findByRole('button', { name: /Borealis Logística/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Aurora Móveis/ })).toBeEnabled()
  })
})

describe('casca no celular e no tablet', () => {
  it('celular: cabeçalho com o título, barra inferior e a folha de perfil com a troca de empresa', async () => {
    largura(390)
    const servicos = servicosDaCasca(meComDuasEmpresas())
    renderizar(servicos, '/')
    expect(
      await screen.findByRole('navigation', { name: 'Navegação do celular' }),
    ).toBeInTheDocument()
    const barra = screen.getByRole('navigation', { name: 'Navegação do celular' })
    for (const rotulo of ['Início', 'Empresas', 'Funil', 'Tarefas', 'Mais']) {
      expect(within(barra).getByText(rotulo)).toBeInTheDocument()
    }
    expect(within(barra).getByRole('link', { name: 'Início' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Abrir perfil' }))
    const folha = await screen.findByRole('dialog', { name: 'Meu perfil' })
    expect(within(folha).getByText('alessandro@exemplo.com.br')).toBeInTheDocument()
    expect(within(folha).getByRole('button', { name: /Aurora Móveis/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(folha).getByText('Ativa')).toBeInTheDocument()
    expect(within(folha).getByRole('link', { name: 'Meu perfil → Segurança' })).toBeInTheDocument()
    await userEvent.click(within(folha).getByRole('button', { name: /Borealis Logística/ }))
    await waitFor(() => expect(servicos.trocarEmpresa).toHaveBeenCalledWith(B))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Meu perfil' })).toBeNull())
  })

  it('celular: "Mais" abre a folha, o tema muda e "Sair" encerra', async () => {
    largura(390)
    const servicos = servicosDaCasca(meComDuasEmpresas())
    renderizar(servicos, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Mais' }))
    const folha = await screen.findByRole('dialog', { name: 'Meu perfil' })
    await userEvent.click(within(folha).getByRole('button', { name: 'Escuro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(within(folha).getByText(/versão/)).toBeInTheDocument()
    await userEvent.click(within(folha).getByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(servicos.sair).toHaveBeenCalled())
  })

  it('celular: o seletor de empresa também aparece sem empresa ativa', async () => {
    largura(390)
    renderizar(servicosDaCasca(meComDuasEmpresas(null)), '/')
    expect(await screen.findByRole('heading', { name: 'Escolha a empresa' })).toBeInTheDocument()
  })

  it('tablet: o menu fica sempre recolhido, sem botão de expandir', async () => {
    largura(800)
    renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Empresas' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expandir menu' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Recolher menu' })).toBeNull()
  })
})

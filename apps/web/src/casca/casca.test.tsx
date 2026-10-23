import type { Me, Preferencias, PreferenciasPatch } from '@leadtogo/api-client'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { VersaoDoApp } from './partes'

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
    porPagina: {},
    kanbanColapsadas: {},
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
    for (const nome of ['Empresas', 'Contatos', 'Oportunidades', 'Atividades', 'Prospecção']) {
      expect(within(nav).getByRole('link', { name: new RegExp(nome) })).toBeInTheDocument()
    }
    expect(within(nav).getByText('Carteira')).toBeInTheDocument()
    // item de fase futura (Rotas, Fase 3) fica oculto
    expect(within(nav).queryByRole('link', { name: /Rotas/ })).toBeNull()
    expect(screen.queryByText('Fase 3')).toBeNull()
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
          porPagina: {},
          kanbanColapsadas: {},
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

describe('a página nunca rola: só a área central', () => {
  const rola = (el: HTMLElement) => {
    expect(el.className).toContain('overflow-y-auto')
    expect(el.className).toContain('overflow-x-hidden')
    expect(el.className).toContain('min-h-0')
  }

  it('desktop: casca na altura da janela sem rolar, menu e barra do topo fixos, só #conteudo rola', async () => {
    const { container } = renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).toContain('h-dvh')
    expect(raiz.className).toContain('overflow-hidden')
    // o menu lateral não é o que rola a página, e não estoura na horizontal
    expect(nav.className).toContain('overflow-x-hidden')
    // a barra do topo fica fora da área que rola
    const conteudo = document.getElementById('conteudo') as HTMLElement
    rola(conteudo)
    expect(conteudo.contains(screen.getByRole('button', { name: 'Registrar atividade' }))).toBe(
      false,
    )
    expect(conteudo.contains(nav)).toBe(false)
  })

  it('celular: cabeçalho e barra inferior fixos, só #conteudo rola (sem rolagem dupla)', async () => {
    largura(390)
    const { container } = renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    const barra = await screen.findByRole('navigation', { name: 'Navegação do celular' })
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).toContain('h-dvh')
    expect(raiz.className).toContain('overflow-hidden')
    const conteudo = document.getElementById('conteudo') as HTMLElement
    rola(conteudo)
    // a barra inferior acompanha o fluxo (não fica solta sobre o conteúdo) e fica fora da rolagem
    expect(barra.className).not.toContain('fixed')
    expect(conteudo.contains(barra)).toBe(false)
    expect(conteudo.contains(screen.getByRole('button', { name: 'Abrir perfil' }))).toBe(false)
  })
})

describe('versão do app no rodapé', () => {
  const HASH = '44b9373c70095834775436d11e0826153b6ffc24'

  it('mostra só os 7 primeiros caracteres e o hash completo na dica (ao focar)', async () => {
    render(
      <TooltipProvider>
        <VersaoDoApp versao={HASH} />
      </TooltipProvider>,
    )
    const texto = screen.getByText('Leadtogo · versão 44b9373')
    expect(texto).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(HASH))).toBeNull()
    expect(texto.className).toContain('truncate')
    texto.focus()
    expect((await screen.findAllByText(HASH)).length).toBeGreaterThan(0)
  })

  it('"dev" (sem hash) aparece inteiro', () => {
    render(
      <TooltipProvider>
        <VersaoDoApp versao="dev" />
      </TooltipProvider>,
    )
    expect(screen.getByText('Leadtogo · versão dev')).toBeInTheDocument()
  })

  it('o rodapé do menu lateral usa a versão curta', async () => {
    renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    await screen.findByRole('navigation', { name: 'Principal' })
    expect(screen.getByText(/^Leadtogo · versão /)).toBeInTheDocument()
  })
})

describe('itens por papel', () => {
  it('administrador da conta: Painel consolidado e Configurações no menu e "Painel consolidado" + "Criar empresa" no seletor', async () => {
    const { historico } = renderizar(
      servicosDaCasca(meComDuasEmpresas(A, { administradorDeConta: true })),
      '/',
    )
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Painel consolidado' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Configurações' })).toBeInTheDocument()
    await userEvent.click(within(nav).getByRole('button', { name: /Aurora Móveis/ }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Painel consolidado' })).toBeInTheDocument()
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Criar empresa' }))
    await waitFor(() => expect(historico.location.pathname).toBe('/criar-empresa'))
  })

  it('administrador só de empresa vê Configurações, mas não o consolidado nem "Criar empresa"', async () => {
    renderizar(servicosDaCasca(meComDuasEmpresas(A)), '/')
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    expect(within(nav).getByRole('link', { name: 'Configurações' })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Painel consolidado' })).toBeNull()
    await userEvent.click(within(nav).getByRole('button', { name: /Aurora Móveis/ }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: 'Painel consolidado' })).toBeNull()
    expect(within(menu).queryByRole('menuitem', { name: 'Criar empresa' })).toBeNull()
  })

  it('vendedor não vê Configurações nem o consolidado', async () => {
    renderizar(servicosDaCasca(meComDuasEmpresas(B)), '/')
    const nav = await screen.findByRole('navigation', { name: 'Principal' })
    expect(within(nav).queryByRole('link', { name: 'Configurações' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: 'Painel consolidado' })).toBeNull()
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
    for (const rotulo of ['Início', 'Empresas', 'Funil', 'Atividades', 'Mais']) {
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
    expect(within(folha).getByText('Mais')).toBeInTheDocument()
    expect(within(folha).getByRole('link', { name: 'Contatos' })).toBeInTheDocument()
    expect(within(folha).getByRole('link', { name: 'Configurações' })).toBeInTheDocument()
    expect(within(folha).getByRole('link', { name: 'Meu perfil → Segurança' })).toBeInTheDocument()
    await userEvent.click(within(folha).getByRole('button', { name: /Borealis Logística/ }))
    await waitFor(() => expect(servicos.trocarEmpresa).toHaveBeenCalledWith(B))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Meu perfil' })).toBeNull())
  })

  it('celular: o avatar abre a folha de perfil, o tema muda e "Sair" encerra', async () => {
    largura(390)
    const servicos = servicosDaCasca(meComDuasEmpresas())
    renderizar(servicos, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir perfil' }))
    const folha = await screen.findByRole('dialog', { name: 'Meu perfil' })
    await userEvent.click(within(folha).getByRole('button', { name: 'Escuro' }))
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(within(folha).getByText(/versão/)).toBeInTheDocument()
    await userEvent.click(within(folha).getByRole('button', { name: 'Sair' }))
    await waitFor(() => expect(servicos.sair).toHaveBeenCalled())
  })

  it('celular: "Mais" lista as telas fora da barra, o perfil, a troca de empresa e Sair', async () => {
    largura(390)
    const servicos = servicosDaCasca(meComDuasEmpresas())
    renderizar(servicos, '/contatos')
    await userEvent.click(await screen.findByRole('button', { name: 'Mais' }))
    const folha = await screen.findByRole('dialog', { name: 'Mais' })
    const nomes = within(folha)
      .getAllByRole('link')
      .map((l) => l.textContent)
    expect(nomes.slice(0, 2)).toEqual(['Contatos', 'Mapa'])
    expect(nomes.at(-1)).toBe('Meu perfil')
    expect(within(folha).getByRole('link', { name: 'Contatos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(folha).getByRole('link', { name: 'Mapa' })).not.toHaveAttribute('aria-current')
    expect(within(folha).queryByRole('link', { name: 'Empresas' })).toBeNull()
    expect(within(folha).getByRole('button', { name: /Aurora Móveis/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(within(folha).getByRole('button', { name: /Borealis Logística/ }))
    await waitFor(() => expect(servicos.trocarEmpresa).toHaveBeenCalledWith(B))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mais' })).toBeNull())
  })

  it('celular: escolher uma tela no "Mais" navega e fecha a folha; Sair encerra', async () => {
    largura(390)
    const servicos = servicosDaCasca(meComDuasEmpresas())
    renderizar(servicos, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Mais' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Mais' })).getByRole('link', {
        name: 'Mapa',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mais' })).toBeNull())
    await userEvent.click(screen.getByRole('button', { name: 'Mais' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: 'Mais' })).getByRole('button', {
        name: 'Sair',
      }),
    )
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

describe('casca: teclado', () => {
  it('Tab percorre a casca na ordem certa: pular para o conteúdo, menu, empresa, telas, usuário, busca, ações', async () => {
    renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    await screen.findByRole('navigation', { name: 'Principal' })
    const ordem: string[] = []
    // 18 paradas: o menu ganhou 'Relatórios de visita' (G3b)
    for (let i = 0; i < 18; i++) {
      await userEvent.tab()
      const el = document.activeElement as HTMLElement
      ordem.push(el.getAttribute('aria-label') ?? el.textContent?.trim().replace(/\s+/g, ' ') ?? '')
    }
    expect(ordem[0]).toBe('Pular para o conteúdo')
    expect(ordem[1]).toBe('Recolher menu')
    expect(ordem[2]).toMatch(/Aurora Móveis/)
    expect(ordem.slice(3, 8).map((t) => t.replace(/\d+$/, '').trim())).toEqual([
      'Dashboard',
      'Empresas',
      'Contatos',
      'Oportunidades',
      'Atividades',
    ])
    expect(ordem).toContain('Menu de Alessandro Dias')
    expect(ordem.indexOf('Menu de Alessandro Dias')).toBeLessThan(
      ordem.indexOf('Registrar atividade'),
    )
  })

  it('"Pular para o conteúdo" leva o foco ao conteúdo (Enter)', async () => {
    renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    await screen.findByRole('navigation', { name: 'Principal' })
    await userEvent.tab()
    expect(document.activeElement).toHaveTextContent('Pular para o conteúdo')
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement?.id).toBe('conteudo')
  })

  it('o seletor de empresa abre e navega só pelo teclado e o Esc devolve o foco ao botão', async () => {
    const servicos = servicosDaCasca(meComDuasEmpresas())
    renderizar(servicos, '/')
    const botao = await screen.findByRole('button', { name: /Aurora Móveis/ })
    botao.focus()
    await userEvent.keyboard('{Enter}')
    const menu = await screen.findByRole('menu')
    expect(menu).toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')
    expect(document.activeElement).toHaveTextContent('Borealis Logística')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(botao).toHaveFocus()
    // de novo, e agora escolhe com Enter
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await waitFor(() => expect(servicos.trocarEmpresa).toHaveBeenCalledWith(B))
  })

  it('o menu de usuário também é todo por teclado (Enter abre, seta navega, Esc fecha)', async () => {
    renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    const botao = await screen.findByRole('button', { name: 'Menu de Alessandro Dias' })
    botao.focus()
    await userEvent.keyboard('{Enter}')
    await screen.findByRole('menu')
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toHaveTextContent(/Segurança|Claro|Escuro|Sistema|Sair/)
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(botao).toHaveFocus()
  })

  it('a folha de perfil do celular prende o foco, fecha com Esc e devolve o foco ao botão', async () => {
    largura(390)
    renderizar(servicosDaCasca(meComDuasEmpresas()), '/')
    const abrir = await screen.findByRole('button', { name: 'Abrir perfil' })
    await userEvent.click(abrir)
    const folha = await screen.findByRole('dialog', { name: 'Meu perfil' })
    for (let i = 0; i < 12; i++) {
      await userEvent.tab()
      expect(folha.contains(document.activeElement)).toBe(true)
    }
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Meu perfil' })).toBeNull())
    expect(abrir).toHaveFocus()
  })
})

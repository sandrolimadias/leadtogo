import type { PerfilDeImportacao } from '@leadtogo/api-client'
import { formatarCnae } from '@leadtogo/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const meComPapel = (papel: 'admin' | 'gestor' | 'vendedor') =>
  meDeAdmin({
    empresas: [
      {
        id: A,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel,
        situacao: 'ativo' as const,
        ativa: true,
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const perfil = (n: number, extra: Partial<PerfilDeImportacao> = {}): PerfilDeImportacao => ({
  id: id(n),
  nome: `Perfil ${n}`,
  exigeSituacaoAtiva: true,
  estabelecimento: 'ambas',
  excluirMei: false,
  cnaes: [],
  aceitarCnaeSecundario: false,
  acaoForaDoPerfil: 'pular',
  ativo: true,
  ...extra,
})

function servicos(perfis: PerfilDeImportacao[], extra: Record<string, unknown> = {}) {
  const base = servicosFalsos()
  const p = {
    ...base.importacao.perfis,
    listar: vi.fn(async () => ok(perfis)),
    criar: vi.fn(async () => ok(perfis[0] ?? perfil(1))),
    alterar: vi.fn(async () => ok(perfis[0] ?? perfil(1))),
    excluir: vi.fn(async () => ok(undefined)),
    ...extra,
  }
  return {
    p,
    s: servicosFalsos({ me: async () => meComPapel('admin'), importacao: { perfis: p } }),
  }
}

const secao = async () => {
  const regiao = await screen.findByRole('region', { name: 'Importação' })
  await waitFor(() => expect(within(regiao).queryByRole('status')).toBeNull())
  return regiao
}

describe('Configurações → Importação (perfis de regras)', () => {
  it('o menu traz "Importação" e gestor e vendedor voltam para o início', async () => {
    renderizar(servicos([]).s, '/configuracoes/importacao')
    const menu = await screen.findByRole('navigation', { name: 'Configurações' })
    expect(within(menu).getByRole('link', { name: /Importação/ })).toBeInTheDocument()
    for (const papel of ['gestor', 'vendedor'] as const) {
      const { historico, unmount } = renderizar(
        servicosFalsos({ me: async () => meComPapel(papel) }),
        '/configuracoes/importacao',
      )
      await waitFor(() => expect(historico.location.pathname).toBe('/'))
      unmount()
    }
  })

  it('sem perfis: estado vazio com a ação de criar (nenhum perfil nasce pronto)', async () => {
    renderizar(servicos([]).s, '/configuracoes/importacao')
    const regiao = await secao()
    expect(within(regiao).getByText('Nenhum perfil ainda')).toBeInTheDocument()
    expect(within(regiao).getAllByRole('button', { name: 'Novo perfil' }).length).toBeGreaterThan(0)
  })

  it('lista com o resumo das regras e o selo Inativo', async () => {
    const { s } = servicos([
      perfil(1, {
        nome: 'Metalurgia',
        cnaes: [2539001, 2543800],
        estabelecimento: 'matriz',
        excluirMei: true,
        aceitarCnaeSecundario: true,
        acaoForaDoPerfil: 'importar_com_tag',
      }),
      perfil(2, { nome: 'Antigo', ativo: false, exigeSituacaoAtiva: false }),
    ])
    renderizar(s, '/configuracoes/importacao')
    const regiao = await secao()
    const a = within(regiao).getByRole('listitem', { name: 'Metalurgia' })
    expect(a).toHaveTextContent(
      'Situação ativa · Só matriz · Sem MEI · 2 CNAEs (também nos secundários) · Importar com a tag "Fora do perfil"',
    )
    const b = within(regiao).getByRole('listitem', { name: 'Antigo' })
    expect(b).toHaveTextContent('Inativo')
    expect(b).toHaveTextContent('Qualquer situação · Matriz e filiais · Com MEI · Qualquer CNAE')
  })

  it('cola 126 códigos de uma vez: confere, mostra a contagem e cria o perfil com todos', async () => {
    const codigos = Array.from({ length: 126 }, (_, i) => 1_000_000 + i * 7)
    const conferirCnaes = vi.fn(async () =>
      ok({
        validos: codigos.map((codigo) => ({ codigo, descricao: `Atividade ${codigo}` })),
        invalidos: [],
        repetidos: 0,
      }),
    )
    const { s, p } = servicos([], { conferirCnaes })
    const usuario = userEvent.setup()
    renderizar(s, '/configuracoes/importacao')
    const regiao = await secao()
    await usuario.click(
      within(regiao).getAllByRole('button', { name: 'Novo perfil' })[0] as HTMLElement,
    )
    const janela = await screen.findByRole('dialog')
    await usuario.type(within(janela).getByRole('textbox', { name: /^Nome/ }), 'Meu perfil')
    const texto = codigos.map(formatarCnae).join('\n')
    // colar de uma vez (digitar 126 linhas seria lento e não é o que a pessoa faz)
    await usuario.click(within(janela).getByRole('textbox', { name: 'CNAEs aceitos' }))
    await usuario.paste(texto)
    await usuario.click(within(janela).getByRole('button', { name: 'Conferir CNAEs' }))
    expect(await within(janela).findByText('126 CNAEs válidos')).toBeInTheDocument()
    await usuario.click(within(janela).getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(p.criar).toHaveBeenCalledTimes(1))
    expect(p.criar).toHaveBeenCalledWith({
      nome: 'Meu perfil',
      exigeSituacaoAtiva: true,
      estabelecimento: 'ambas',
      excluirMei: false,
      cnaes: codigos,
      aceitarCnaeSecundario: false,
      acaoForaDoPerfil: 'pular',
    })
  })

  it('mostra os inválidos antes de salvar e não grava enquanto houver algum', async () => {
    const conferirCnaes = vi.fn(async () =>
      ok({
        validos: [{ codigo: 2539001, descricao: 'Serviços de usinagem' }],
        invalidos: [
          { texto: '123', motivo: 'o CNAE tem 6 ou 7 dígitos' },
          { texto: '1000001', motivo: 'não existe na tabela de CNAEs' },
        ],
        repetidos: 1,
      }),
    )
    const { s, p } = servicos([], { conferirCnaes })
    const usuario = userEvent.setup()
    renderizar(s, '/configuracoes/importacao')
    const regiao = await secao()
    await usuario.click(
      within(regiao).getAllByRole('button', { name: 'Novo perfil' })[0] as HTMLElement,
    )
    const janela = await screen.findByRole('dialog')
    await usuario.type(within(janela).getByRole('textbox', { name: /^Nome/ }), 'Com erro')
    await usuario.click(within(janela).getByRole('textbox', { name: 'CNAEs aceitos' }))
    await usuario.paste('2539001, 123, 1000001')
    await usuario.click(within(janela).getByRole('button', { name: 'Criar' }))
    const aviso = await within(janela).findByText('Corrija os códigos abaixo antes de salvar')
    expect(aviso).toBeInTheDocument()
    expect(within(janela).getByText(/não existe na tabela de CNAEs/)).toBeInTheDocument()
    expect(within(janela).getByText(/o CNAE tem 6 ou 7 dígitos/)).toBeInTheDocument()
    expect(
      within(janela).getByText('1 CNAE válido · 2 inválidos · 1 repetido ignorado'),
    ).toBeInTheDocument()
    expect(p.criar).not.toHaveBeenCalled()
  })

  it('sem CNAEs não consulta a tabela e cria "qualquer CNAE"; nome repetido mostra o aviso no campo', async () => {
    const criar = vi.fn(async () =>
      falha('nome_duplicado', 'Já existe um perfil com esse nome.', 409),
    )
    const { s, p } = servicos([], { criar })
    const usuario = userEvent.setup()
    renderizar(s, '/configuracoes/importacao')
    const regiao = await secao()
    await usuario.click(
      within(regiao).getAllByRole('button', { name: 'Novo perfil' })[0] as HTMLElement,
    )
    const janela = await screen.findByRole('dialog')
    await usuario.click(within(janela).getByRole('button', { name: 'Criar' }))
    expect(await within(janela).findByText('Informe o nome.')).toBeInTheDocument()
    await usuario.type(within(janela).getByRole('textbox', { name: /^Nome/ }), 'Repetido')
    await usuario.click(within(janela).getByRole('button', { name: 'Criar' }))
    expect(
      await within(janela).findByText('Já existe um perfil com esse nome.'),
    ).toBeInTheDocument()
    expect(p.conferirCnaes).not.toHaveBeenCalled()
    expect(criar).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Repetido', cnaes: [] }))
  })

  it('edita: abre com os CNAEs formatados, envia a situação (Ativo) junto das regras', async () => {
    const existente = perfil(1, { nome: 'Metalurgia', cnaes: [710301, 4711302] })
    const conferirCnaes = vi.fn(async () =>
      ok({
        validos: [
          { codigo: 710301, descricao: 'a' },
          { codigo: 4711302, descricao: 'b' },
        ],
        invalidos: [],
        repetidos: 0,
      }),
    )
    const { s, p } = servicos([existente], { conferirCnaes })
    const usuario = userEvent.setup()
    renderizar(s, '/configuracoes/importacao')
    const regiao = await secao()
    await usuario.click(within(regiao).getByRole('button', { name: 'Editar perfil Metalurgia' }))
    const janela = await screen.findByRole('dialog')
    expect(within(janela).getByRole('textbox', { name: 'CNAEs aceitos' })).toHaveValue(
      '0710-3/01\n4711-3/02',
    )
    await usuario.click(within(janela).getByRole('switch', { name: 'Ativo' }))
    await usuario.click(within(janela).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(p.alterar).toHaveBeenCalledTimes(1))
    expect(p.alterar).toHaveBeenCalledWith(
      id(1),
      expect.objectContaining({ nome: 'Metalurgia', cnaes: [710301, 4711302], ativo: false }),
    )
  })

  it('excluir: confirma; perfil já usado mostra o motivo e só dá para inativar', async () => {
    const excluir = vi.fn(async () =>
      falha(
        'perfil_em_uso',
        'Este perfil já foi usado em uma importação: só é possível inativá-lo.',
        409,
      ),
    )
    const { s } = servicos([perfil(1, { nome: 'Usado' })], { excluir })
    const usuario = userEvent.setup()
    renderizar(s, '/configuracoes/importacao')
    const regiao = await secao()
    await usuario.click(within(regiao).getByRole('button', { name: 'Excluir perfil Usado' }))
    const janela = await screen.findByRole('dialog')
    await usuario.click(within(janela).getByRole('button', { name: 'Excluir' }))
    expect(
      await within(janela).findByText(/já foi usado em uma importação: só é possível inativá-lo/),
    ).toBeInTheDocument()
    expect(excluir).toHaveBeenCalledWith(id(1))
  })

  it('erro ao carregar: mostra o motivo', async () => {
    const { s } = servicos([], { listar: vi.fn(async () => falha('x', 'Falhou feio.', 500)) })
    renderizar(s, '/configuracoes/importacao')
    expect(await screen.findByText('Falhou feio.')).toBeInTheDocument()
  })
})

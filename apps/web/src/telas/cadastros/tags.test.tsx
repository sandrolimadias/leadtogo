import type { TagGrupo } from '@leadtogo/api-client'
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
const tag = (
  n: number,
  grupo: number,
  nome: string,
  extra: Partial<TagGrupo['tags'][number]> = {},
): TagGrupo['tags'][number] => ({
  id: id(n),
  tagGrupoId: id(grupo),
  nome,
  cor: 'gray',
  ativo: true,
  ordem: n,
  chaveSistema: null,
  ...extra,
})

const dados = (): TagGrupo[] => [
  {
    id: id(1),
    nome: 'Status',
    selecao: 'unica',
    obrigatorio: true,
    sistema: true,
    automatico: false,
    ativo: true,
    ordem: 0,
    tags: [
      tag(11, 1, 'Lead', { cor: 'teal', chaveSistema: 'lead' }),
      tag(12, 1, 'Prospect', { cor: 'amber', chaveSistema: 'prospect' }),
      tag(13, 1, 'Cliente', { cor: 'green', chaveSistema: 'cliente' }),
    ],
  },
  {
    id: id(2),
    nome: 'Visitação',
    selecao: 'multipla',
    obrigatorio: false,
    sistema: true,
    automatico: true,
    ativo: true,
    ordem: 1,
    tags: [tag(21, 2, 'Visitada', { cor: 'orange', chaveSistema: 'visitada' })],
  },
  {
    id: id(3),
    nome: 'Interesse',
    selecao: 'multipla',
    obrigatorio: false,
    sistema: false,
    automatico: false,
    ativo: true,
    ordem: 2,
    tags: [tag(31, 3, 'Retrofit', { cor: 'blue' }), tag(32, 3, 'Monitoramento', { ativo: false })],
  },
]

function servicosDeTags(grupos: TagGrupo[] = dados(), extra: Record<string, unknown> = {}) {
  const tags = {
    listar: vi.fn(async () => ok(grupos)),
    criarGrupo: vi.fn(async () => ok(grupos[2] as TagGrupo)),
    alterarGrupo: vi.fn(async () => ok(grupos[2] as TagGrupo)),
    excluirGrupo: vi.fn(async () => ok(undefined)),
    reordenarGrupos: vi.fn(async () => ok(grupos)),
    criarTag: vi.fn(async () => ok(tag(99, 3, 'Nova'))),
    alterarTag: vi.fn(async () => ok(tag(31, 3, 'Retrofit'))),
    excluirTag: vi.fn(async () => ok(undefined)),
    reordenarTags: vi.fn(async () => ok(grupos[0] as TagGrupo)),
    ...extra,
  }
  return servicosFalsos({ me: async () => meComPapel('admin'), tags })
}

const abrir = async (servicos = servicosDeTags()) => {
  const r = renderizar(servicos, '/configuracoes/tags')
  await screen.findByRole('heading', { name: 'Tags' })
  await screen.findByRole('region', { name: 'Status' })
  return r
}
const grupo = (nome: string) => screen.getByRole('region', { name: nome })
const linha = (g: string, t: string) => within(grupo(g)).getByRole('listitem', { name: t })

describe('Configurações → Tags: acesso', () => {
  it.each(['gestor', 'vendedor'] as const)('%s volta para o início', async (papel) => {
    const { historico } = renderizar(
      servicosFalsos({ me: async () => meComPapel(papel) }),
      '/configuracoes/tags',
    )
    await waitFor(() => expect(historico.location.pathname).toBe('/'))
  })

  it('administrador: o menu interno traz Tags', async () => {
    await abrir()
    const menu = screen.getByRole('navigation', { name: 'Configurações' })
    expect(within(menu).getByRole('link', { name: /Tags/ })).toHaveAttribute('aria-current', 'page')
  })
})

describe('Configurações → Tags: estados', () => {
  it('carrega mostrando o esqueleto', async () => {
    renderizar(
      servicosDeTags([], { listar: () => new Promise(() => undefined) }),
      '/configuracoes/tags',
    )
    expect(await screen.findByRole('status', { name: 'Carregando as tags' })).toBeInTheDocument()
  })

  it('erro ao carregar: mostra o motivo e "Tentar de novo" recarrega', async () => {
    const listar = vi
      .fn()
      .mockResolvedValueOnce(falha('x', 'Servidor fora do ar.', 503))
      .mockResolvedValue(ok(dados()))
    renderizar(servicosDeTags([], { listar }), '/configuracoes/tags')
    expect(await screen.findByRole('alert')).toHaveTextContent('Servidor fora do ar.')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('region', { name: 'Status' })).toBeInTheDocument()
  })

  it('vazio: convida a criar o primeiro grupo', async () => {
    renderizar(servicosDeTags([]), '/configuracoes/tags')
    expect(await screen.findByRole('heading', { name: 'Nenhum grupo de tags' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Novo grupo' })).toHaveLength(2)
  })

  it('mostra os grupos com seleção, "obrigatório", sistema e as tags, inclusive a inativa', async () => {
    await abrir()
    const status = grupo('Status')
    expect(within(status).getByText('Seleção única')).toBeInTheDocument()
    expect(within(status).getByText('Obrigatório')).toBeInTheDocument()
    expect(within(status).getByText('Grupo do sistema')).toBeInTheDocument()
    expect(within(status).getAllByText('Usada pelas regras do sistema')).toHaveLength(2)

    const visitacao = grupo('Visitação')
    expect(within(visitacao).getByText('Aplicado pelo sistema')).toBeInTheDocument()
    expect(
      within(visitacao).getByText(/aplicadas pelo sistema: não dá para criar outras/),
    ).toBeInTheDocument()
    expect(within(visitacao).queryByRole('button', { name: /Nova tag/ })).toBeNull()

    const interesse = grupo('Interesse')
    expect(within(interesse).getByText('Seleção múltipla')).toBeInTheDocument()
    expect(within(interesse).queryByText('Grupo do sistema')).toBeNull()
    expect(within(linha('Interesse', 'Monitoramento')).getByText('Inativa')).toBeInTheDocument()
    expect(
      within(interesse).getByRole('button', { name: 'Nova tag em Interesse' }),
    ).toBeInTheDocument()
  })

  it('só oferece excluir o que pode ser excluído', async () => {
    await abrir()
    expect(
      within(grupo('Status')).queryByRole('button', { name: 'Excluir o grupo Status' }),
    ).toBeNull()
    expect(
      within(grupo('Interesse')).getByRole('button', { name: 'Excluir o grupo Interesse' }),
    ).toBeInTheDocument()
    // Lead e Cliente têm regra; Prospect não
    expect(within(linha('Status', 'Lead')).queryByRole('button', { name: /Excluir/ })).toBeNull()
    expect(within(linha('Status', 'Cliente')).queryByRole('button', { name: /Excluir/ })).toBeNull()
    expect(
      within(linha('Status', 'Prospect')).getByRole('button', { name: 'Excluir a tag Prospect' }),
    ).toBeInTheDocument()
  })
})

describe('Configurações → Tags: grupos', () => {
  it('cria um grupo (nome aparado, seleção única, obrigatório) e relê a lista', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    await userEvent.click(screen.getByRole('button', { name: 'Novo grupo' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Novo grupo de tags' })
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), '  Porte  ')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Seleção'), 'unica')
    await userEvent.click(within(dialogo).getByRole('checkbox', { name: /Obrigatório/ }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar grupo' }))
    await waitFor(() =>
      expect(servicos.tags.criarGrupo).toHaveBeenCalledWith({
        nome: 'Porte',
        selecao: 'unica',
        obrigatorio: true,
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(servicos.tags.listar).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Grupo criado')).toBeInTheDocument()
  })

  it('nome vazio: avisa no campo e não chama a API', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    await userEvent.click(screen.getByRole('button', { name: 'Novo grupo' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar grupo' }))
    expect(await within(dialogo).findByText('Informe o nome do grupo.')).toBeInTheDocument()
    expect(servicos.tags.criarGrupo).not.toHaveBeenCalled()
  })

  it('nome repetido: o erro aparece no campo e o diálogo continua aberto', async () => {
    const servicos = servicosDeTags(dados(), {
      criarGrupo: vi.fn(async () =>
        falha('nome_duplicado', 'Já existe um item com esse nome.', 409),
      ),
    })
    await abrir(servicos)
    await userEvent.click(screen.getByRole('button', { name: 'Novo grupo' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), 'Status')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar grupo' }))
    expect(await within(dialogo).findByText('Já existe um item com esse nome.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('grupo do sistema: só o nome muda (seleção e "obrigatório" travados)', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    await userEvent.click(screen.getByRole('button', { name: 'Editar o grupo Status' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Editar o grupo Status' })
    expect(within(dialogo).getByLabelText('Seleção')).toBeDisabled()
    expect(within(dialogo).getByRole('checkbox', { name: /Obrigatório/ })).toBeDisabled()
    const campo = within(dialogo).getByLabelText(/Nome/)
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Situação')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(servicos.tags.alterarGrupo).toHaveBeenCalledWith(id(1), { nome: 'Situação' }),
    )
  })

  it('grupo comum: edita seleção e "obrigatório" junto com o nome', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    await userEvent.click(screen.getByRole('button', { name: 'Editar o grupo Interesse' }))
    const dialogo = await screen.findByRole('dialog')
    await userEvent.selectOptions(within(dialogo).getByLabelText('Seleção'), 'unica')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(servicos.tags.alterarGrupo).toHaveBeenCalledWith(id(3), {
        nome: 'Interesse',
        selecao: 'unica',
        obrigatorio: false,
      }),
    )
  })

  it('exclui o grupo comum depois de confirmar', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    await userEvent.click(screen.getByRole('button', { name: 'Excluir o grupo Interesse' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir o grupo Interesse?' })
    expect(servicos.tags.excluirGrupo).not.toHaveBeenCalled()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir grupo' }))
    await waitFor(() => expect(servicos.tags.excluirGrupo).toHaveBeenCalledWith(id(3)))
    expect(await screen.findByText('Grupo Interesse excluído')).toBeInTheDocument()
  })

  it('reordena os grupos pelos botões (e o primeiro não sobe, o último não desce)', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    expect(screen.getByRole('button', { name: 'Mover o grupo Status para cima' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Mover o grupo Interesse para baixo' }),
    ).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Mover o grupo Status para baixo' }))
    await waitFor(() =>
      expect(servicos.tags.reordenarGrupos).toHaveBeenCalledWith([id(2), id(1), id(3)]),
    )
  })
})

describe('Configurações → Tags: tags', () => {
  it('cria uma tag com a cor escolhida; o exemplo mostra como vai aparecer', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    await userEvent.click(screen.getByRole('button', { name: 'Nova tag em Interesse' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Nova tag em Interesse' })
    await userEvent.type(within(dialogo).getByLabelText(/Nome/), 'Manutenção')
    expect(within(dialogo).getAllByRole('radio')).toHaveLength(10)
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Verde' }))
    expect(within(dialogo).getByRole('radio', { name: 'Verde' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(dialogo).getByText('Como vai aparecer:')).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Criar tag' }))
    await waitFor(() =>
      expect(servicos.tags.criarTag).toHaveBeenCalledWith({
        tagGrupoId: id(3),
        nome: 'Manutenção',
        cor: 'green',
      }),
    )
    expect(await screen.findByText('Tag criada')).toBeInTheDocument()
  })

  it('o seletor de cor anda com as setas do teclado', async () => {
    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Nova tag em Interesse' }))
    const dialogo = await screen.findByRole('dialog')
    const cinza = within(dialogo).getByRole('radio', { name: 'Cinza' })
    cinza.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(within(dialogo).getByRole('radio', { name: 'Vermelho' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(within(dialogo).getByRole('radio', { name: 'Rosa' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('tag com regra do sistema: muda nome e cor, mas "Tag ativa" fica travada', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    await userEvent.click(
      within(linha('Status', 'Lead')).getByRole('button', { name: 'Editar a tag Lead' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Editar a tag Lead' })
    const ativa = within(dialogo).getByRole('switch', { name: 'Tag ativa' })
    expect(ativa).toBeDisabled()
    expect(ativa).toBeChecked()
    expect(within(dialogo).getByText(/usada pelas regras do sistema/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('radio', { name: 'Azul-petróleo' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Azul' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(servicos.tags.alterarTag).toHaveBeenCalledWith(id(11), {
        nome: 'Lead',
        cor: 'blue',
        ativo: true,
      }),
    )
  })

  it('tag comum: pode ser inativada', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    await userEvent.click(
      within(linha('Interesse', 'Retrofit')).getByRole('button', { name: 'Editar a tag Retrofit' }),
    )
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('switch', { name: 'Tag ativa' }))
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(servicos.tags.alterarTag).toHaveBeenCalledWith(id(31), {
        nome: 'Retrofit',
        cor: 'blue',
        ativo: false,
      }),
    )
  })

  it('erro da API ao salvar a tag aparece no diálogo', async () => {
    const servicos = servicosDeTags(dados(), {
      alterarTag: vi.fn(async () =>
        falha('tag_de_sistema', 'A tag "Lead" é usada pelas regras do sistema.', 409),
      ),
    })
    await abrir(servicos)
    await userEvent.click(
      within(linha('Interesse', 'Retrofit')).getByRole('button', { name: 'Editar a tag Retrofit' }),
    )
    const dialogo = await screen.findByRole('dialog')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'usada pelas regras do sistema',
    )
  })

  it('exclui a tag depois de confirmar; o erro da API fica no diálogo de confirmação', async () => {
    const excluirTag = vi
      .fn()
      .mockResolvedValueOnce(falha('conflito', 'A tag está em uso.', 409))
      .mockResolvedValue(ok(undefined))
    const servicos = servicosDeTags(dados(), { excluirTag })
    await abrir(servicos)
    await userEvent.click(
      within(linha('Status', 'Prospect')).getByRole('button', { name: 'Excluir a tag Prospect' }),
    )
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir a tag Prospect?' })
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir tag' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('A tag está em uso.')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Excluir tag' }))
    await waitFor(() => expect(excluirTag).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Tag Prospect excluída')).toBeInTheDocument()
  })

  it('reordena as tags do grupo pelos botões', async () => {
    const servicos = servicosDeTags()
    await abrir(servicos)
    expect(
      within(linha('Status', 'Lead')).getByRole('button', { name: 'Mover a tag Lead para cima' }),
    ).toBeDisabled()
    await userEvent.click(
      within(linha('Status', 'Prospect')).getByRole('button', {
        name: 'Mover a tag Prospect para baixo',
      }),
    )
    await waitFor(() =>
      expect(servicos.tags.reordenarTags).toHaveBeenCalledWith(id(1), [id(11), id(13), id(12)]),
    )
  })
})

import { definicaoInicial, type Formulario, type ItemDeFormulario } from '@leadtogo/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

import { id, meComChamados } from '../chamados/fixtures'

const item = (extra: Partial<ItemDeFormulario> = {}): ItemDeFormulario => ({
  id: id(800),
  nome: 'Inscrição no encontro',
  finalidade: 'inscricao_evento',
  acesso: 'logado',
  situacao: 'publicado',
  slug: 'inscricao-no-encontro-ab12cd',
  versaoPublicada: 2,
  temMudancas: false,
  respostas: 3,
  ultimaRespostaEm: '2026-10-30T12:00:00.000Z',
  atualizadoEm: '2026-10-30T12:00:00.000Z',
  ...extra,
})

const formulario = (extra: Partial<Formulario> = {}): Formulario => ({
  ...item(),
  captcha: true,
  definicao: definicaoInicial(),
  ...extra,
})

function servicos(troca: Record<string, unknown> = {}, permissoes: Record<string, true> = {}) {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () =>
      meComChamados({
        'chamados.ver': 'todas',
        'portal.ver': true,
        'portal.formularios': true,
        ...permissoes,
      }),
    portal: {
      ...base.portal,
      formularios: {
        ...base.portal.formularios,
        listar: vi.fn(async () => ok({ itens: [item()], total: 1 })),
        obter: vi.fn(async () => ok(formulario())),
        salvar: vi.fn(async (_id: string, d: { definicao: Formulario['definicao'] }) =>
          ok(formulario({ definicao: d.definicao, temMudancas: true })),
        ),
        publicar: vi.fn(async () => ok(formulario({ versaoPublicada: 3 }))),
        respostas: vi.fn(async () =>
          ok({
            itens: [
              {
                id: id(900),
                versao: 2,
                origem: 'portal' as const,
                botao: 'enviar',
                valores: { nome: 'Marta Lopes' },
                pessoa: 'Marta Lopes',
                empresa: 'Usidantec',
                contexto: null,
                criadoEm: '2026-10-30T12:00:00.000Z',
              },
            ],
            total: 1,
            campos: [{ id: 'nome', rotulo: 'Nome', tipo: 'texto' }],
          }),
        ),
        ...troca,
      },
    },
  })
}

async function abrirAba() {
  const usuario = userEvent.setup()
  await usuario.click(await screen.findByRole('tab', { name: 'Formulários' }))
  return usuario
}

describe('hub do portal: formulários (Fase 4E)', () => {
  it('lista com a finalidade, a versão e o total de respostas', async () => {
    renderizar(servicos(), '/portal')
    await abrirAba()
    const lista = await screen.findByRole('list', { name: 'Formulários' })
    expect(within(lista).getByText('Inscrição no encontro')).toBeInTheDocument()
    expect(
      within(lista).getByText(/Inscrição em evento · Clientes logados · 3 respostas/),
    ).toBeInTheDocument()
    expect(within(lista).getByText('Publicado · v2')).toBeInTheDocument()
  })

  it('constrói: acrescenta um campo condicional, salva e publica', async () => {
    const s = servicos()
    renderizar(s, '/portal')
    const usuario = await abrirAba()
    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    const campos = await screen.findByRole('list', { name: 'Campos do formulário' })
    expect(within(campos).getByText('Nome')).toBeInTheDocument()
    await usuario.selectOptions(screen.getByLabelText('Novo campo'), 'email')
    await usuario.click(screen.getByRole('button', { name: 'Acrescentar' }))
    const props = screen.getByRole('region', { name: 'Propriedades do campo' })
    await usuario.click(within(props).getByLabelText('Obrigatório'))
    await usuario.click(within(props).getByRole('button', { name: 'Condição' }))
    await usuario.selectOptions(within(props).getByLabelText('Condição'), 'preenchido')
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(s.portal.formularios.salvar).toHaveBeenCalled())
    const salvo = vi.mocked(s.portal.formularios.salvar).mock.calls[0]
    expect(salvo?.[0]).toBe(id(800))
    expect(salvo?.[1]?.definicao.campos).toMatchObject([
      { id: 'nome' },
      {
        id: 'e_mail',
        tipo: 'email',
        obrigatorio: true,
        visivelQuando: {
          combinacao: 'todas',
          condicoes: [{ campo: 'nome', operador: 'preenchido' }],
        },
      },
    ])
    await usuario.click(screen.getByRole('button', { name: 'Publicar' }))
    await waitFor(() => expect(s.portal.formularios.publicar).toHaveBeenCalledWith(id(800)))
  })

  it('botões e ações: e-mail para o campo de e-mail digitado', async () => {
    const s = servicos()
    renderizar(s, '/portal')
    const usuario = await abrirAba()
    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    await usuario.selectOptions(await screen.findByLabelText('Novo campo'), 'email')
    await usuario.click(screen.getByRole('button', { name: 'Acrescentar' }))
    await usuario.click(screen.getByRole('button', { name: 'Botões e ações' }))
    await usuario.click(screen.getByRole('button', { name: 'Enviar e-mail' }))
    await usuario.selectOptions(screen.getByLabelText('Para'), 'campo')
    await usuario.selectOptions(screen.getByLabelText('Campo de e-mail'), 'e_mail')
    await usuario.type(screen.getByLabelText(/Mensagem/), 'Olá, {{{{nome}}!')
    await usuario.click(screen.getByRole('button', { name: 'Salvar rascunho' }))
    await waitFor(() => expect(s.portal.formularios.salvar).toHaveBeenCalled())
    const salvo = vi.mocked(s.portal.formularios.salvar).mock.calls[0]
    expect(salvo?.[1]?.definicao.botoes[0]?.acoes).toEqual([
      expect.objectContaining({
        tipo: 'email',
        para: 'campo',
        campo: 'e_mail',
        mensagem: 'Olá, {{nome}}!',
      }),
    ])
  })

  it('pré-visualiza o formulário sem enviar', async () => {
    renderizar(servicos(), '/portal')
    const usuario = await abrirAba()
    await usuario.click(await screen.findByRole('button', { name: 'Editar' }))
    await usuario.click(await screen.findByRole('button', { name: 'Pré-visualizar' }))
    const dialogo = await screen.findByRole('dialog', { name: /Pré-visualização/ })
    expect(within(dialogo).getByLabelText(/^Nome/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Enviar' })).toBeInTheDocument()
  })

  it('mostra as respostas em tabela, com a pessoa, a empresa e cada campo', async () => {
    renderizar(servicos({}, {}), '/portal')
    const usuario = await abrirAba()
    await usuario.click(await screen.findByRole('button', { name: 'Respostas' }))
    const secao = await screen.findByRole('region', { name: /Respostas de/ })
    expect((await within(secao).findAllByText('Marta Lopes', { selector: 'td' })).length).toBe(2)
    expect(within(secao).getByText('Usidantec')).toBeInTheDocument()
    expect(within(secao).getByRole('button', { name: 'Exportar CSV' })).toBeInTheDocument()
  })
})

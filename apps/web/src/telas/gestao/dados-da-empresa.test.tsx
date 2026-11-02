import type { DadosDaEmpresa } from '@leadtogo/api-client'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const me = (papel: 'admin' | 'cadastros') =>
  meDeAdmin({
    empresas: [
      {
        id: A,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel: papel === 'admin' ? 'admin' : 'gestor',
        situacao: 'ativo' as const,
        ativa: true,
        // perfil que entra nas Configurações (cadastros) mas não configura a empresa
        ...(papel === 'cadastros' ? { permissoes: { 'cadastros.gerir': true as const } } : {}),
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

const dados = (extra: Partial<DadosDaEmpresa> = {}): DadosDaEmpresa => ({
  razaoSocial: 'Aurora Ltda',
  nomeFantasia: 'Aurora',
  cnpj: '12345678000195',
  email: null,
  telefone: null,
  website: null,
  endereco: {
    cep: null,
    tipoLogradouro: null,
    logradouro: null,
    numero: null,
    complemento: null,
    bairro: null,
    municipio: null,
  },
  ...extra,
})

function servicos(atual = dados(), papel: 'admin' | 'cadastros' = 'admin') {
  const obter = vi.fn(async () => ok(atual))
  const alterar = vi.fn(async (_d: Record<string, unknown>) =>
    ok(
      dados({
        endereco: {
          ...atual.endereco,
          municipio: { codigo: 3205309, nome: 'Vitória', uf: 'ES' },
        },
      }),
    ),
  )
  const municipios = vi.fn(async (uf: string) =>
    ok(
      uf === 'ES'
        ? [
            { codigo: 3201308, nome: 'Cariacica' },
            { codigo: 3205309, nome: 'Vitória' },
          ]
        : [{ codigo: 3550308, nome: 'São Paulo' }],
    ),
  )
  return {
    s: servicosFalsos({
      me: async () => me(papel),
      dadosDaEmpresa: { obter, alterar, municipios },
    }),
    obter,
    alterar,
    municipios,
  }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  const r = renderizar(x.s, '/configuracoes/empresa')
  await screen.findByLabelText(/Razão social/)
  return r
}

describe('Configurações → Empresa', () => {
  it('aparece no menu das Configurações para o administrador e mostra os dados (CNPJ só leitura)', async () => {
    const x = servicos()
    await abrir(x)
    expect(screen.getByRole('link', { name: /^Empresa$/ })).toHaveAttribute(
      'href',
      '/configuracoes/empresa',
    )
    expect(screen.getByLabelText(/Razão social/)).toHaveValue('Aurora Ltda')
    expect(screen.getByLabelText(/CNPJ/)).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/Cidade/)).toBeDisabled()
  })

  it('escolher o estado carrega as cidades; salvar manda o endereço com o código da cidade', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.type(screen.getByLabelText(/Logradouro/), 'Das Flores')
    await userEvent.type(screen.getByLabelText(/CEP/), '29100001')
    await userEvent.selectOptions(screen.getByLabelText(/Estado/), 'ES')
    await waitFor(() => expect(x.municipios).toHaveBeenCalledWith('ES'))
    const cidade = screen.getByLabelText(/Cidade/)
    await waitFor(() => expect(cidade).toBeEnabled())
    await userEvent.selectOptions(cidade, '3205309')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(x.alterar).toHaveBeenCalledTimes(1))
    expect(x.alterar.mock.calls[0]?.[0]).toMatchObject({
      razaoSocial: 'Aurora Ltda',
      endereco: { logradouro: 'Das Flores', cep: '29100-001', municipioCodigo: 3205309 },
    })
    expect(await screen.findByText('Dados da empresa salvos')).toBeInTheDocument()
  })

  it('estado sem cidade não salva; erro da API aparece', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.selectOptions(screen.getByLabelText(/Estado/), 'SP')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha a cidade.')
    expect(x.alterar).not.toHaveBeenCalled()
    x.alterar.mockResolvedValueOnce(falha('municipio_invalido', 'Cidade não encontrada.', 400))
    await waitFor(() => expect(screen.getByLabelText(/Cidade/)).toBeEnabled())
    await userEvent.selectOptions(screen.getByLabelText(/Cidade/), '3550308')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Cidade não encontrada.')
  })

  it('com a cidade já cadastrada, abre com o estado e a cidade escolhidos', async () => {
    const x = servicos(
      dados({
        endereco: {
          ...dados().endereco,
          municipio: { codigo: 3205309, nome: 'Vitória', uf: 'ES' },
        },
      }),
    )
    await abrir(x)
    expect(screen.getByLabelText(/Estado/)).toHaveValue('ES')
    await waitFor(() => expect(screen.getByLabelText(/Cidade/)).toHaveValue('3205309'))
  })

  it('sem empresa.configurar: só leitura, sem Salvar e sem a seção no menu', async () => {
    const x = servicos(dados(), 'cadastros')
    await abrir(x)
    expect(screen.getByLabelText(/Razão social/)).toHaveAttribute('readonly')
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
    expect(screen.getByText(/Só quem pode configurar a empresa altera/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Empresa$/ })).toBeNull()
  })
})

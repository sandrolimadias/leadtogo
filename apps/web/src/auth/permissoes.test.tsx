import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { comPerfil, meDeAdmin, servicosFalsos } from '@/testes/servicos-falsos'

import { ServicosProvider } from './contexto'
import { alcanceCom, permissoesDaAtiva, podeCom } from './permissoes'
import { Pode } from './pode'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const B = '01a111e8-f08a-70b7-b5f3-52998ced0a3b'
const empresa = (
  id: string,
  ativa: boolean,
  permissoes: Record<string, 'propria' | 'equipe' | 'todas' | true>,
) =>
  comPerfil({
    id,
    razaoSocial: 'X Ltda',
    nomeFantasia: null,
    papel: 'vendedor',
    situacao: 'ativo',
    ativa,
    permissoes,
  })

describe('permissões do perfil no front', () => {
  it('lê só as da empresa ativa; sem empresa ativa, nenhuma', () => {
    const me = meDeAdmin({
      empresas: [
        empresa(A, false, { 'perfis.gerir': true }),
        empresa(B, true, { 'empresas.ver': 'equipe' }),
      ],
    })
    expect(permissoesDaAtiva(me)).toEqual({ 'empresas.ver': 'equipe' })
    expect(
      permissoesDaAtiva(meDeAdmin({ empresas: [empresa(A, false, { 'perfis.gerir': true })] })),
    ).toEqual({})
    expect(permissoesDaAtiva(null)).toEqual({})
  })

  it('pode: basta uma das chaves; alcance só nas que admitem', () => {
    const p = { 'empresas.ver': 'equipe' as const, 'importacao.executar': true as const }
    expect(podeCom(p, 'importacao.executar')).toBe(true)
    expect(podeCom(p, ['perfis.gerir', 'empresas.ver'])).toBe(true)
    expect(podeCom(p, 'perfis.gerir')).toBe(false)
    expect(alcanceCom(p, 'empresas.ver')).toBe('equipe')
    expect(alcanceCom(p, 'importacao.executar')).toBeUndefined()
  })
})

describe('<Pode>', () => {
  it('mostra o conteúdo só com a permissão (e o "senão" sem ela)', async () => {
    const me = meDeAdmin({ empresas: [empresa(A, true, { 'cadastros.gerir': true })] })
    const cliente = new QueryClient()
    cliente.setQueryData(['me'], me)
    render(
      <QueryClientProvider client={cliente}>
        <ServicosProvider servicos={servicosFalsos({ me: async () => me })}>
          <Pode chave="cadastros.gerir">pode gerir</Pode>
          <Pode chave="perfis.gerir" senao={<span>sem perfis</span>}>
            pode perfis
          </Pode>
        </ServicosProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('pode gerir')).toBeInTheDocument()
    expect(screen.getByText('sem perfis')).toBeInTheDocument()
    expect(screen.queryByText('pode perfis')).toBeNull()
  })
})

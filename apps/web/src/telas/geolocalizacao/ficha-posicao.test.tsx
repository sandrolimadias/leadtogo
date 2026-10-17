import type { EmpresaCarteira, PosicaoDaEmpresa } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { empresaDeTeste } from '@/telas/empresas/fixtures'
import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

// O mapa de verdade (WebGL) não roda no jsdom: este falso expõe o pin como um botão "soltar".
vi.mock('@/components/mapa/mapa-base', () => ({
  MapaBase: (p: {
    rotulo: string
    arrastavel?: { latitude: number; longitude: number; aoSoltar: (la: number, lo: number) => void }
    aoClicarNoMapa?: (la: number, lo: number) => void
  }) => (
    <div role="application" aria-label={p.rotulo}>
      {p.arrastavel ? (
        <button type="button" onClick={() => p.arrastavel?.aoSoltar(-20.1, -40.2)}>
          Soltar o pin em -20,1 e -40,2
        </button>
      ) : null}
      <button type="button" onClick={() => p.aoClicarNoMapa?.(-20.5, -40.5)}>
        Tocar no mapa em -20,5 e -40,5
      </button>
    </div>
  ),
}))

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const me = meDeAdmin({
  empresas: [
    {
      id: A,
      razaoSocial: 'Aurora Ltda',
      nomeFantasia: 'Aurora',
      papel: 'admin',
      situacao: 'ativo' as const,
      ativa: true,
    },
  ],
  empresaAtivaId: A,
  administradorDeConta: false,
  doisFatoresObrigatorio: false,
})

const posicao = (extra: Partial<PosicaoDaEmpresa> = {}): PosicaoDaEmpresa => ({
  estado: 'exata',
  latitude: -20.3,
  longitude: -40.3,
  precisao: 'exata',
  aproximacao: null,
  origem: 'cnefe',
  raioM: 100,
  atualizadoEm: '2026-10-16T13:00:00.000Z',
  ajusteManual: false,
  enderecoMudouDepoisDoAjuste: false,
  centroSugerido: { latitude: -20.3, longitude: -40.3 },
  faltas: [],
  ...extra,
})

function abrir(p: PosicaoDaEmpresa, extra: Partial<EmpresaCarteira> = {}) {
  const base = servicosFalsos()
  const geo = {
    ...base.geolocalizacao,
    posicao: {
      ler: vi.fn(),
      ajustar: vi.fn(async () => ok(posicao({ origem: 'manual', ajusteManual: true }))),
      confirmarEndereco: vi.fn(async () => ok(posicao())),
      geocodificarDeNovo: vi.fn(async () =>
        ok(
          posicao({
            estado: 'sem_coordenada',
            latitude: null,
            longitude: null,
            precisao: null,
            origem: null,
            raioM: null,
          }),
        ),
      ),
    },
  }
  const s = servicosFalsos({
    me: async () => me,
    carteira: {
      ...base.carteira,
      detalhar: vi.fn(async () => ok(empresaDeTeste({ posicao: p, ...extra }))),
      historico: vi.fn(async () => ok({ itens: [], total: 0, pagina: 1, porPagina: 20 })),
    },
    geolocalizacao: geo,
  })
  renderizar(s, `/empresas/${empresaDeTeste().id}`)
  return geo
}

const cartao = async () => screen.findByRole('region', { name: 'Localização' })

describe('Ficha: o cartão Localização', () => {
  it('posição exata: selo, origem e o raio de 100 m', async () => {
    abrir(posicao())
    const c = await cartao()
    expect(within(c).getByText('Posição exata')).toBeInTheDocument()
    expect(within(c).getByText('Censo 2022 do IBGE (CNEFE)')).toBeInTheDocument()
    expect(within(c).getByText(/cerca de 100 m da porta/)).toBeInTheDocument()
  })

  it('posição aproximada explica por quê e o tamanho da incerteza', async () => {
    abrir(
      posicao({
        estado: 'aproximada',
        precisao: 'aproximada',
        aproximacao: 'rua',
        origem: 'nominatim',
        raioM: 1000,
      }),
    )
    const c = await cartao()
    expect(within(c).getByText('Posição aproximada')).toBeInTheDocument()
    expect(within(c).getByText('OpenStreetMap')).toBeInTheDocument()
    expect(within(c).getByText(/na rua, sem o número/)).toBeInTheDocument()
    expect(within(c).getByText(/até 1 km da porta/)).toBeInTheDocument()
  })

  it('sem coordenada: convida a marcar o ponto', async () => {
    abrir(
      posicao({
        estado: 'sem_coordenada',
        latitude: null,
        longitude: null,
        precisao: null,
        origem: null,
        raioM: null,
      }),
    )
    const c = await cartao()
    expect(within(c).getByText('Sem coordenada')).toBeInTheDocument()
    expect(within(c).getByText(/ainda não tem posição no mapa/)).toBeInTheDocument()
    expect(within(c).queryByRole('button', { name: 'Procurar de novo' })).not.toBeInTheDocument()
  })

  it('endereço a confirmar: diz o que falta e leva a editar o endereço', async () => {
    abrir(
      posicao({
        estado: 'a_confirmar',
        latitude: null,
        longitude: null,
        precisao: null,
        origem: null,
        raioM: null,
        faltas: ['numero', 'bairro'],
      }),
    )
    const c = await cartao()
    expect(within(c).getByText('Endereço a confirmar')).toBeInTheDocument()
    expect(within(c).getByText(/Faltam o número e o bairro\./)).toBeInTheDocument()
    expect(within(c).getByRole('link', { name: /Editar endereço/ })).toBeInTheDocument()
  })

  it('ajustar: arrasta o pin, confirma e manda a posição nova', async () => {
    const geo = abrir(posicao())
    await userEvent.click(await screen.findByRole('button', { name: 'Ajustar posição' }))
    const d = await screen.findByRole('dialog', { name: 'Ajustar a posição' })
    expect(within(d).getByRole('button', { name: 'Confirmar posição' })).toBeDisabled()
    await userEvent.click(within(d).getByRole('button', { name: /Soltar o pin/ }))
    expect(within(d).getByText(/nova, ainda não confirmada/)).toBeInTheDocument()
    await userEvent.click(within(d).getByRole('button', { name: 'Confirmar posição' }))
    await waitFor(() =>
      expect(geo.posicao.ajustar).toHaveBeenCalledWith(empresaDeTeste().id, {
        latitude: -20.1,
        longitude: -40.2,
      }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Ajustar a posição' })).not.toBeInTheDocument(),
    )
  })

  it('sem posição, tocar no mapa já marca o ponto e libera o botão', async () => {
    const geo = abrir(
      posicao({
        estado: 'sem_coordenada',
        latitude: null,
        longitude: null,
        precisao: null,
        origem: null,
        raioM: null,
        centroSugerido: null,
      }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Ajustar posição' }))
    const d = await screen.findByRole('dialog', { name: 'Ajustar a posição' })
    expect(within(d).getByRole('button', { name: 'Confirmar posição' })).toBeDisabled()
    await userEvent.click(within(d).getByRole('button', { name: /Tocar no mapa/ }))
    await userEvent.click(within(d).getByRole('button', { name: 'Confirmar posição' }))
    await waitFor(() =>
      expect(geo.posicao.ajustar).toHaveBeenCalledWith(empresaDeTeste().id, {
        latitude: -20.5,
        longitude: -40.5,
      }),
    )
  })

  it('erro da API ao ajustar aparece no diálogo (e ele continua aberto)', async () => {
    const geo = abrir(posicao())
    geo.posicao.ajustar.mockResolvedValueOnce(
      falha('fora_do_brasil', 'Essa posição está fora do Brasil.', 400),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Ajustar posição' }))
    const d = await screen.findByRole('dialog', { name: 'Ajustar a posição' })
    await userEvent.click(within(d).getByRole('button', { name: /Soltar o pin/ }))
    await userEvent.click(within(d).getByRole('button', { name: 'Confirmar posição' }))
    expect(await within(d).findByText('Essa posição está fora do Brasil.')).toBeInTheDocument()
  })

  it('o endereço mudou depois do ajuste: manter a posição ou procurar de novo', async () => {
    const geo = abrir(
      posicao({ origem: 'manual', ajusteManual: true, enderecoMudouDepoisDoAjuste: true }),
    )
    const c = await cartao()
    expect(within(c).getByText('O endereço mudou depois do ajuste')).toBeInTheDocument()
    expect(within(c).queryByRole('button', { name: 'Procurar de novo' })).not.toBeInTheDocument()
    await userEvent.click(within(c).getByRole('button', { name: 'Manter a posição' }))
    await waitFor(() =>
      expect(geo.posicao.confirmarEndereco).toHaveBeenCalledWith(empresaDeTeste().id, {
        acao: 'manter_posicao',
      }),
    )
    await userEvent.click(within(c).getByRole('button', { name: 'Procurar o endereço novo' }))
    await waitFor(() =>
      expect(geo.posicao.confirmarEndereco).toHaveBeenCalledWith(empresaDeTeste().id, {
        acao: 'refazer',
      }),
    )
  })

  it('"Procurar de novo" pede a geocodificação', async () => {
    const geo = abrir(posicao())
    await userEvent.click(await screen.findByRole('button', { name: 'Procurar de novo' }))
    await waitFor(() =>
      expect(geo.posicao.geocodificarDeNovo).toHaveBeenCalledWith(empresaDeTeste().id),
    )
  })

  it('sem permissão de editar, só lê (sem botões)', async () => {
    abrir(posicao(), { permissoes: { editar: false, excluir: false, transferir: false } })
    const c = await cartao()
    expect(within(c).getByText('Posição exata')).toBeInTheDocument()
    expect(within(c).queryByRole('button')).not.toBeInTheDocument()
  })

  it('empresa no exterior não vai ao mapa', async () => {
    abrir(
      posicao({
        estado: 'sem_coordenada',
        latitude: null,
        longitude: null,
        precisao: null,
        origem: null,
        raioM: null,
      }),
      {
        endereco: { ...empresaDeTeste().endereco, paisCodigo: 249 },
      },
    )
    const c = await cartao()
    expect(within(c).getByText(/Empresa no exterior: não aparece no mapa/)).toBeInTheDocument()
  })
})

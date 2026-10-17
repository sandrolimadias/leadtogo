import type { LegendaDoMapa } from '@leadtogo/api-client'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const me = (papel: 'admin' | 'gestor') =>
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

const legenda = (): LegendaDoMapa => ({
  entradas: [
    {
      chave: 'tag:x',
      fixa: false,
      nomePadrao: 'Cliente',
      corPadrao: 'verde',
      nome: 'Associado',
      cor: 'azul',
      personalizada: true,
      regra: 'Empresa com o Status Cliente.',
    },
    {
      chave: 'sem_visita',
      fixa: true,
      nomePadrao: 'Sem visita há 60+ dias',
      corPadrao: 'alerta',
      nome: 'Sem visita há 60+ dias',
      cor: 'alerta',
      personalizada: false,
      regra: 'Cliente sem visita há 60 dias ou mais.',
    },
  ],
})

function servicos(papel: 'admin' | 'gestor' = 'admin') {
  const base = servicosFalsos()
  const mapa = {
    ...base.mapa,
    legenda: {
      ler: vi.fn(async () => ok(legenda())),
      alterar: vi.fn(async (_c: string, _d: unknown) => ok(legenda())),
      restaurar: vi.fn(async () => ok(legenda())),
    },
  }
  return {
    mapa,
    s: servicosFalsos({
      me: async () => me(papel),
      mapa: mapa,
      geolocalizacao: {
        ...base.geolocalizacao,
        resumo: vi.fn(async () =>
          ok({
            cnefeCarregado: true,
            uf: 'ES',
            nominatimConfigurado: true,
            totalEmpresas: 0,
            exatas: 0,
            aproximadas: 0,
            semCoordenada: 0,
            aConfirmar: 0,
            ajustadasAMao: 0,
          }),
        ),
      },
    }),
  }
}

const abrir = async (x: ReturnType<typeof servicos>) => {
  renderizar(x.s, '/geolocalizacao')
  await userEvent.click(await screen.findByRole('tab', { name: 'Legenda do mapa' }))
}

describe('Geolocalização → Legenda do mapa (administrador)', () => {
  it('lista os estados com a cor e o nome atuais e a regra de cada um', async () => {
    await abrir(servicos())
    expect(await screen.findByText('Associado')).toBeInTheDocument()
    expect(screen.getByText('Estado fixo · padrão')).toBeInTheDocument()
    expect(screen.getByText('Tag de Status · personalizado')).toBeInTheDocument()
    expect(screen.getByText('Cliente sem visita há 60 dias ou mais.')).toBeInTheDocument()
    const cores = screen.getByRole('radiogroup', { name: 'Cor de Associado' })
    expect(within(cores).getAllByRole('radio')).toHaveLength(12)
    expect(within(cores).getByRole('radio', { name: 'Azul' })).toBeChecked()
  })

  it('escolher uma cor da paleta salva na hora', async () => {
    const x = servicos()
    await abrir(x)
    const cores = await screen.findByRole('radiogroup', { name: 'Cor de Sem visita há 60+ dias' })
    await userEvent.click(within(cores).getByRole('radio', { name: 'Laranja' }))
    await waitFor(() =>
      expect(x.mapa.legenda.alterar).toHaveBeenCalledWith('sem_visita', { cor: 'laranja' }),
    )
  })

  it('o nome muda ao sair do campo; vazio volta ao padrão', async () => {
    const x = servicos()
    await abrir(x)
    const campos = await screen.findAllByLabelText('Nome na legenda')
    const cliente = campos[0] as HTMLElement
    expect(cliente).toHaveValue('Associado')
    await userEvent.clear(cliente)
    await userEvent.type(cliente, 'Parceiro')
    await userEvent.tab()
    await waitFor(() =>
      expect(x.mapa.legenda.alterar).toHaveBeenCalledWith('tag:x', { nome: 'Parceiro' }),
    )
    await userEvent.clear(cliente)
    await userEvent.tab()
    await waitFor(() =>
      expect(x.mapa.legenda.alterar).toHaveBeenLastCalledWith('tag:x', { nome: null }),
    )
  })

  it('"Restaurar padrão" pede confirmação e chama a API', async () => {
    const x = servicos()
    await abrir(x)
    await userEvent.click(await screen.findByRole('button', { name: 'Restaurar padrão' }))
    const d = await screen.findByRole('dialog')
    expect(x.mapa.legenda.restaurar).not.toHaveBeenCalled()
    await userEvent.click(within(d).getByRole('button', { name: 'Restaurar' }))
    await waitFor(() => expect(x.mapa.legenda.restaurar).toHaveBeenCalled())
  })

  it('o gestor não vê a aba da legenda', async () => {
    renderizar(servicos('gestor').s, '/geolocalizacao')
    await screen.findByRole('tab', { name: 'Resumo e lotes' })
    expect(screen.queryByRole('tab', { name: 'Legenda do mapa' })).not.toBeInTheDocument()
  })
})

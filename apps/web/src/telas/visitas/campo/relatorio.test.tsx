import type { ModeloDeVisita, ResultadoDeVisita } from '@leadtogo/api-client'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { armazemEmMemoria, prepararParaUsuario, usarArmazem } from '@/lib/offline/banco'
import { enfileirar, relatorioLocal } from '@/lib/offline/visitas'
import { falha, meDeAdmin, ok, renderizar, servicosFalsos } from '@/testes/servicos-falsos'

const id = (n: number) => `0192f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`
const RELATORIO = id(900)
const EMPRESA = id(800)
// a pessoa e a empresa ativa do /me: o banco do aparelho é preparado para elas (outra pessoa apagaria tudo)
const USUARIO = '0192f0a0-0000-7000-8000-000000000001'
const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const me = () =>
  meDeAdmin({
    empresas: [
      {
        id: A,
        razaoSocial: 'Aurora Ltda',
        nomeFantasia: 'Aurora',
        papel: 'vendedor',
        situacao: 'ativo' as const,
        ativa: true,
      },
    ],
    empresaAtivaId: A,
    administradorDeConta: false,
    doisFatoresObrigatorio: false,
  })

const modelo: ModeloDeVisita = {
  id: id(1),
  nome: 'Relatório de visita',
  padrao: true,
  ativo: true,
  ordem: 0,
  resultados: 2,
  emUso: false,
  versaoAtual: {
    id: id(2),
    numero: 1,
    criadoEm: '2026-10-22T12:00:00.000Z',
    campos: [{ id: id(10), rotulo: 'Turnos', tipo: 'numero', obrigatorio: true }],
  },
}
const resultados: ResultadoDeVisita[] = [
  {
    id: id(30),
    nome: 'Visita realizada',
    chaveSistema: null,
    modeloId: id(1),
    ativo: true,
    ordem: 0,
  },
  {
    id: id(31),
    nome: 'Empresa encerrada',
    chaveSistema: 'encerrada',
    modeloId: id(1),
    ativo: true,
    ordem: 1,
  },
]

function servicos() {
  const base = servicosFalsos()
  return servicosFalsos({
    me: async () => me(),
    visitas: {
      ...base.visitas,
      resultados: { ...base.visitas.resultados, listar: vi.fn(async () => ok(resultados)) },
      modelos: { ...base.visitas.modelos, listar: vi.fn(async () => ok([modelo])) },
      campo: {
        ...base.visitas.campo,
        // sem sinal: tudo que vai ao servidor falha por rede
        obter: vi.fn(async () => falha('sem_rede', 'Sem conexão.', 0)),
        salvar: vi.fn(async () => falha('sem_rede', 'Sem conexão.', 0)),
        offline: vi.fn(async () => falha('sem_rede', 'Sem conexão.', 0)),
      },
    },
  })
}

let online: PropertyDescriptor | undefined
beforeEach(async () => {
  usarArmazem(armazemEmMemoria())
  await prepararParaUsuario(USUARIO, A)
  online = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
  Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false })
  await enfileirar({
    id: RELATORIO,
    empresaNome: 'Mercado Central',
    dados: {
      empresaId: EMPRESA,
      checkin: {
        em: '2026-10-22T13:00:00.000Z',
        posicao: { latitude: -20.3, longitude: -40.3 },
        offline: true,
      },
      resultadoId: null,
      respostas: [],
      concluir: false,
    },
  })
})
afterEach(() => {
  if (online) Object.defineProperty(Navigator.prototype, 'onLine', online)
  usarArmazem(null)
})

describe('Relatório de visita sem sinal', () => {
  it('abre do aparelho, pede os obrigatórios e conclui na fila', async () => {
    renderizar(servicos(), `/visitas/${RELATORIO}`)
    expect(
      await screen.findByRole('heading', { name: 'Visita a Mercado Central' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Ainda no aparelho/)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText(/Resultado da visita/), id(30))
    await userEvent.click(screen.getByRole('button', { name: 'Concluir relatório' }))
    expect(await screen.findByText('Confira os campos destacados.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Turnos/), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Concluir relatório' }))
    await waitFor(async () =>
      expect((await relatorioLocal(RELATORIO))?.dados).toMatchObject({
        resultadoId: id(30),
        concluir: true,
        respostas: [{ campoId: id(10), valor: 2 }],
        checkin: { offline: true },
      }),
    )
  })

  it('"Empresa encerrada" pergunta se a empresa vai para Inativo', async () => {
    renderizar(servicos(), `/visitas/${RELATORIO}`)
    await userEvent.selectOptions(await screen.findByLabelText(/Resultado da visita/), id(31))
    await userEvent.type(screen.getByLabelText(/Turnos/), '1')
    await userEvent.click(screen.getByRole('button', { name: 'Concluir relatório' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Sim, mudar para Inativo' }))
    await waitFor(async () =>
      expect((await relatorioLocal(RELATORIO))?.dados).toMatchObject({
        concluir: true,
        inativarEmpresa: true,
      }),
    )
  })
})

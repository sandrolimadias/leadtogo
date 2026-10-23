import { describe, expect, it } from 'vitest'

import {
  adicionarParadas,
  aplicarOrdem,
  desenhoDoRascunho,
  entradaDoRascunho,
  moverParada,
  novoRascunho,
  type ParadaDoRascunho,
  removerParada,
  totaisEmLinhaReta,
} from './rascunho'

const parada = (n: number): Omit<ParadaDoRascunho, 'resolvida' | 'distanciaTrechoM'> => ({
  empresaId: `e${n}`,
  nome: `Empresa ${n}`,
  detalhe: 'Centro · Vitória',
  latitude: -20.3 - n / 100,
  longitude: -40.3,
  precisao: 'exata',
})

const base = () =>
  novoRascunho({
    responsavelId: 'm1',
    minutosPorVisita: 40,
    pontos: [
      {
        id: 'p1',
        nome: 'Sede',
        endereco: null,
        latitude: -20.2,
        longitude: -40.3,
        padrao: true,
        ativo: true,
        ordem: 1,
      },
    ],
    agora: new Date('2026-10-26T12:00:00-03:00'),
  })

describe('rascunho da rota', () => {
  it('nasce hoje, da própria pessoa, com o ponto padrão sugerido e a posição atual como partida', () => {
    const r = base()
    expect(r).toMatchObject({
      nome: 'Rota de 26/10/2026',
      data: '2026-10-26',
      responsavelId: 'm1',
      partida: 'posicao_atual',
      pontoPartidaId: 'p1',
      voltarAoInicio: true,
      minutosPorVisita: 40,
    })
  })

  it('adicionar conta o que entrou, o que já estava e o que passou do limite', () => {
    const r1 = adicionarParadas(base(), [parada(1), parada(2)], 3)
    expect(r1).toMatchObject({ adicionadas: 2, jaNaRota: 0, excedentes: 0 })
    const r2 = adicionarParadas(r1.rascunho, [parada(2), parada(3), parada(4)], 3)
    expect(r2).toMatchObject({ adicionadas: 1, jaNaRota: 1, excedentes: 1 })
    expect(r2.rascunho.paradas.map((p) => p.empresaId)).toEqual(['e1', 'e2', 'e3'])
    expect(r2.rascunho.alterado).toBe(true)
  })

  it('mover, remover e aplicar a ordem otimizada; parada resolvida não sai', () => {
    let r = adicionarParadas(base(), [parada(1), parada(2), parada(3)], 30).rascunho
    r = moverParada(r, 0, 2)
    expect(r.paradas.map((p) => p.empresaId)).toEqual(['e2', 'e3', 'e1'])
    r = aplicarOrdem(r, ['e1', 'e2', 'e3'])
    expect(r.otimizada).toBe(true)
    r = removerParada(r, 'e2')
    expect(r.otimizada).toBe(false)
    expect(r.paradas.map((p) => p.empresaId)).toEqual(['e1', 'e3'])
    const comResolvida = { ...r, paradas: r.paradas.map((p) => ({ ...p, resolvida: true })) }
    expect(removerParada(comResolvida, 'e1').paradas).toHaveLength(2)
  })

  it('a entrada leva a posição atual só com essa partida, e o ponto só com "ponto"', () => {
    const r = adicionarParadas(base(), [parada(1)], 30).rascunho
    const posicao = { latitude: -20.25, longitude: -40.28 }
    expect(entradaDoRascunho(r, posicao)).toMatchObject({
      partida: 'posicao_atual',
      pontoPartidaId: null,
      posicaoAtual: posicao,
      empresaIds: ['e1'],
    })
    const comPonto = entradaDoRascunho({ ...r, partida: 'ponto' }, posicao)
    expect(comPonto.pontoPartidaId).toBe('p1')
    expect(comPonto).not.toHaveProperty('posicaoAtual')
  })

  it('o desenho usa o trajeto salvo enquanto nada muda; depois, a linha reta com a volta', () => {
    const r = { ...adicionarParadas(base(), [parada(1), parada(2)], 30).rascunho, alterado: false }
    const salvo: [number, number][] = [
      [-40.3, -20.31],
      [-40.31, -20.315],
      [-40.3, -20.32],
    ]
    expect(desenhoDoRascunho(r, null, salvo)).toMatchObject({ linha: salvo, emLinhaReta: false })
    const inicio = { latitude: -20.2, longitude: -40.3 }
    const d = desenhoDoRascunho({ ...r, alterado: true }, inicio, salvo)
    expect(d?.emLinhaReta).toBe(true)
    expect(d?.linha).toHaveLength(4)
    expect(d?.paradas.map((p) => p.numero)).toEqual([1, 2])
    expect(totaisEmLinhaReta(r, inicio).distanciaM).toBeGreaterThan(0)
  })
})

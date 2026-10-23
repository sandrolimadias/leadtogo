import { describe, expect, it } from 'vitest'

import { EXPEDIENTE_PADRAO, type CalendarioUtil } from './chamados-prazo.js'
import { calcularPrazo, intervalosAtivos } from './prazo-do-chamado.js'

const cal: CalendarioUtil = { ...EXPEDIENTE_PADRAO, feriados: [], fusoHorario: 'America/Sao_Paulo' }
// 11:00Z = 08:00 em São Paulo (UTC-3). Quinta 22/10/2026.
const z = (dia: string, hora: string) => new Date(`2026-10-${dia}T${hora}:00Z`)

describe('intervalosAtivos', () => {
  it('pausa em Aguardando cliente e para em Resolvido', () => {
    const r = intervalosAtivos([
      { em: z('22', '11:00'), statusPara: 'pendente' },
      { em: z('22', '12:00'), statusPara: 'em_atendimento' },
      { em: z('22', '13:00'), statusPara: 'aguardando_cliente' },
      { em: z('22', '15:00'), statusPara: 'em_atendimento' },
      { em: z('22', '16:00'), statusPara: 'resolvido' },
    ])
    expect(r).toEqual([
      { de: z('22', '11:00'), ate: z('22', '13:00') },
      { de: z('22', '15:00'), ate: z('22', '16:00') },
    ])
  })

  it('sem fim: o trecho aberto corre até agora', () => {
    expect(intervalosAtivos([{ em: z('22', '11:00'), statusPara: 'pendente' }])).toEqual([
      { de: z('22', '11:00'), ate: null },
    ])
  })
})

describe('calcularPrazo', () => {
  const abertura = [{ em: z('22', '11:00'), statusPara: 'pendente' as const }]

  it('sem meta não há prazo nem alerta', () => {
    expect(
      calcularPrazo({
        metaMin: null,
        mudancas: abertura,
        statusAtual: 'pendente',
        cumpridoEm: null,
        agora: z('22', '20:00'),
        calendario: cal,
      }),
    ).toBeNull()
  })

  it('dentro do prazo: consome só horas úteis e diz quando vence', () => {
    const r = calcularPrazo({
      metaMin: 120,
      mudancas: abertura,
      statusAtual: 'pendente',
      cumpridoEm: null,
      agora: z('22', '12:00'),
      calendario: cal,
    })
    expect(r).toMatchObject({ metaMin: 120, consumidoMin: 60, atrasado: false, pausado: false })
    expect(r?.venceEm).toEqual(z('22', '13:00'))
  })

  it('a noite não conta: aberto às 17h, 2 h de meta vencem 9h do dia seguinte', () => {
    const r = calcularPrazo({
      metaMin: 120,
      mudancas: [{ em: z('22', '20:00'), statusPara: 'pendente' }],
      statusAtual: 'pendente',
      cumpridoEm: null,
      agora: z('22', '23:00'),
      calendario: cal,
    })
    // 17:00 local (20:00Z) + 1 h na quinta (até 18h) + 1 h na sexta (08h-09h)
    expect(r?.venceEm).toEqual(z('23', '12:00'))
    expect(r?.atrasado).toBe(false)
  })

  it('atrasado: passou do vencimento sem resposta', () => {
    const r = calcularPrazo({
      metaMin: 60,
      mudancas: abertura,
      statusAtual: 'pendente',
      cumpridoEm: null,
      agora: z('22', '14:00'),
      calendario: cal,
    })
    expect(r?.atrasado).toBe(true)
    expect(r?.venceEm).toEqual(z('22', '12:00'))
  })

  it('Aguardando cliente pausa: sem vencimento e sem atraso enquanto espera', () => {
    const r = calcularPrazo({
      metaMin: 120,
      mudancas: [
        { em: z('22', '11:00'), statusPara: 'pendente' },
        { em: z('22', '12:00'), statusPara: 'aguardando_cliente' },
      ],
      statusAtual: 'aguardando_cliente',
      cumpridoEm: null,
      agora: z('25', '15:00'),
      calendario: cal,
    })
    expect(r).toMatchObject({ pausado: true, venceEm: null, atrasado: false, consumidoMin: 60 })
  })

  it('cumprido: para o relógio e informa se estourou a meta', () => {
    const dentro = calcularPrazo({
      metaMin: 120,
      mudancas: abertura,
      statusAtual: 'em_atendimento',
      cumpridoEm: z('22', '12:30'),
      agora: z('25', '15:00'),
      calendario: cal,
    })
    expect(dentro).toMatchObject({
      consumidoMin: 90,
      atrasado: false,
      cumpridoEm: z('22', '12:30'),
    })
    const fora = calcularPrazo({
      metaMin: 60,
      mudancas: abertura,
      statusAtual: 'em_atendimento',
      cumpridoEm: z('22', '12:30'),
      agora: z('25', '15:00'),
      calendario: cal,
    })
    expect(fora).toMatchObject({ consumidoMin: 90, atrasado: true })
  })

  it('sem expediente configurado: sem vencimento e sem atraso', () => {
    const r = calcularPrazo({
      metaMin: 60,
      mudancas: abertura,
      statusAtual: 'pendente',
      cumpridoEm: null,
      agora: z('25', '15:00'),
      calendario: { ...cal, faixas: [] },
    })
    expect(r).toMatchObject({ venceEm: null, atrasado: false, consumidoMin: 0 })
  })
})

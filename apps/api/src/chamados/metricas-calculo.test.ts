import { type CalendarioUtil, EXPEDIENTE_PADRAO } from '@leadtogo/shared'
import { describe, expect, it } from 'vitest'

import { agregar, type LinhaParaMedir, medir } from './metricas-calculo.js'

const cal: CalendarioUtil = { ...EXPEDIENTE_PADRAO, feriados: [], fusoHorario: 'America/Sao_Paulo' }
// 11:00Z = 08:00 em São Paulo (UTC-3). Quinta 22/10/2026.
const z = (dia: string, hora: string) => new Date(`2026-10-${dia}T${hora}:00Z`)
const agora = z('25', '15:00')

const linha = (extra: Partial<LinhaParaMedir>): LinhaParaMedir => ({
  status: 'pendente',
  area_id: 'a1',
  area_nome: 'Jurídico',
  meta_resposta_min: 60,
  meta_resolucao_min: 480,
  responsavel_id: 'm1',
  responsavel_nome: 'Ana',
  criado_em: z('22', '11:00'),
  primeira_resposta_em: null,
  resolvido_em: null,
  ...extra,
})
const abertura = [{ em: z('22', '11:00'), statusPara: 'pendente' as const }]

describe('medir', () => {
  it('respondido em 30 min úteis dentro da meta de 60; resolvido em 3 h úteis dentro da de 8 h', () => {
    const m = medir(
      linha({
        status: 'resolvido',
        primeira_resposta_em: z('22', '11:30'),
        resolvido_em: z('22', '14:00'),
      }),
      [...abertura, { em: z('22', '14:00'), statusPara: 'resolvido' }],
      cal,
      agora,
    )
    expect(m).toMatchObject({
      aberto: false,
      respostaMin: 30,
      resolucaoMin: 180,
      respostaNoPrazo: true,
      resolucaoNoPrazo: true,
      diasEmAberto: null,
    })
  })

  it('respondeu fora da meta: não é dentro do prazo', () => {
    const m = medir(linha({ primeira_resposta_em: z('22', '13:00') }), abertura, cal, agora)
    expect(m).toMatchObject({ respostaMin: 120, respostaNoPrazo: false })
  })

  it('sem resposta e já estourou: fora; sem resposta e ainda no prazo: ainda não conta', () => {
    expect(medir(linha({}), abertura, cal, z('22', '14:00')).respostaNoPrazo).toBe(false)
    expect(medir(linha({}), abertura, cal, z('22', '11:20')).respostaNoPrazo).toBeNull()
  })

  it('sem meta na área não há resultado de prazo, mas o tempo é medido', () => {
    const m = medir(
      linha({
        meta_resposta_min: null,
        meta_resolucao_min: null,
        primeira_resposta_em: z('22', '12:00'),
      }),
      abertura,
      cal,
      agora,
    )
    expect(m).toMatchObject({ respostaMin: 60, respostaNoPrazo: null, resolucaoNoPrazo: null })
  })

  it('aberto: conta os dias corridos desde a abertura', () => {
    const m = medir(linha({}), abertura, cal, z('24', '11:00'))
    expect(m.aberto).toBe(true)
    expect(m.diasEmAberto).toBe(2)
  })

  it('a pausa de Aguardando cliente não entra no tempo de resolução', () => {
    const mudancas = [
      ...abertura,
      { em: z('22', '12:00'), statusPara: 'aguardando_cliente' as const },
      { em: z('23', '11:00'), statusPara: 'em_atendimento' as const },
      { em: z('23', '12:00'), statusPara: 'resolvido' as const },
    ]
    const m = medir(
      linha({ status: 'resolvido', resolvido_em: z('23', '12:00') }),
      mudancas,
      cal,
      agora,
    )
    expect(m.resolucaoMin).toBe(120)
  })
})

describe('agregar', () => {
  it('médias, abertos e percentuais; vazio devolve nulos', () => {
    const base = {
      areaId: null,
      areaNome: null,
      responsavelId: null,
      responsavelNome: null,
      status: 'pendente' as const,
    }
    const r = agregar([
      {
        ...base,
        aberto: false,
        diasEmAberto: null,
        respostaMin: 10,
        resolucaoMin: 100,
        respostaNoPrazo: true,
        resolucaoNoPrazo: true,
      },
      {
        ...base,
        aberto: false,
        diasEmAberto: null,
        respostaMin: 30,
        resolucaoMin: 300,
        respostaNoPrazo: false,
        resolucaoNoPrazo: true,
      },
      {
        ...base,
        aberto: true,
        diasEmAberto: 3,
        respostaMin: null,
        resolucaoMin: null,
        respostaNoPrazo: null,
        resolucaoNoPrazo: null,
      },
    ])
    expect(r).toEqual({
      total: 3,
      abertos: 1,
      resolvidos: 2,
      tempoPrimeiraRespostaMin: 20,
      tempoResolucaoMin: 200,
      diasEmAberto: 3,
      respostaNoPrazoPct: 50,
      resolucaoNoPrazoPct: 100,
    })
    expect(agregar([])).toMatchObject({
      total: 0,
      tempoPrimeiraRespostaMin: null,
      respostaNoPrazoPct: null,
    })
  })
})

import { describe, expect, it } from 'vitest'

import {
  adicionarMinutosUteis,
  EXPEDIENTE_PADRAO,
  minutosUteisDosIntervalos,
  minutosUteisEntre,
  type CalendarioUtil,
} from './chamados-prazo.js'

// São Paulo é UTC-3 o ano todo (sem horário de verão desde 2019): 08:00 local = 11:00Z
const cal: CalendarioUtil = {
  ...EXPEDIENTE_PADRAO,
  feriados: [{ data: '2026-12-25', recorrente: true }],
  fusoHorario: 'America/Sao_Paulo',
}
const z = (iso: string) => new Date(`${iso}Z`)

describe('minutosUteisEntre', () => {
  it('conta só o expediente do mesmo dia', () => {
    // quinta 22/10/2026, 07:00 a 19:00 locais (10:00Z a 22:00Z) = 10 h
    expect(minutosUteisEntre(z('2026-10-22T10:00:00'), z('2026-10-22T22:00:00'), cal)).toBe(600)
  })

  it('pula a noite e o fim de semana', () => {
    // sexta 23/10 17:00 local (20:00Z) até segunda 26/10 09:00 local (12:00Z) = 1 h + 1 h
    expect(minutosUteisEntre(z('2026-10-23T20:00:00'), z('2026-10-26T12:00:00'), cal)).toBe(120)
  })

  it('pula o feriado (recorrente) e respeita o fuso', () => {
    // sexta 25/12/2026 é feriado: das 09h de quinta 24 às 09h de segunda 28 = 9 h (quinta) + 1 h (segunda)
    expect(minutosUteisEntre(z('2026-12-24T12:00:00'), z('2026-12-28T12:00:00'), cal)).toBe(600)
  })

  it('várias faixas no dia (almoço fora)', () => {
    const comAlmoco: CalendarioUtil = {
      ...cal,
      faixas: [
        { diaSemana: 4, inicio: '08:00', fim: '12:00' },
        { diaSemana: 4, inicio: '13:00', fim: '18:00' },
      ],
    }
    expect(minutosUteisEntre(z('2026-10-22T11:00:00'), z('2026-10-22T21:00:00'), comAlmoco)).toBe(
      540,
    )
  })

  it('sem expediente ou intervalo invertido = 0', () => {
    expect(
      minutosUteisEntre(z('2026-10-22T11:00:00'), z('2026-10-22T21:00:00'), { ...cal, faixas: [] }),
    ).toBe(0)
    expect(minutosUteisEntre(z('2026-10-22T21:00:00'), z('2026-10-22T11:00:00'), cal)).toBe(0)
  })
})

describe('adicionarMinutosUteis', () => {
  it('dentro do expediente soma direto', () => {
    expect(adicionarMinutosUteis(z('2026-10-22T12:00:00'), 60, cal)).toEqual(
      z('2026-10-22T13:00:00'),
    )
  })

  it('atravessa a noite e o fim de semana', () => {
    // sexta 17:30 local + 90 min: 30 min na sexta, 60 min na segunda 08:00-09:00
    expect(adicionarMinutosUteis(z('2026-10-23T20:30:00'), 90, cal)).toEqual(
      z('2026-10-26T12:00:00'),
    )
  })

  it('começando fora do expediente, conta da próxima abertura', () => {
    // sábado 24/10 10:00 local + 30 min => segunda 08:30 local
    expect(adicionarMinutosUteis(z('2026-10-24T13:00:00'), 30, cal)).toEqual(
      z('2026-10-26T11:30:00'),
    )
  })

  it('sem expediente devolve nulo; zero minutos devolve o início', () => {
    const t = z('2026-10-22T12:00:00')
    expect(adicionarMinutosUteis(t, 30, { ...cal, faixas: [] })).toBeNull()
    expect(adicionarMinutosUteis(t, 0, cal)).toEqual(t)
  })
})

describe('minutosUteisDosIntervalos', () => {
  it('soma só os trechos em que o prazo correu (a pausa fica de fora)', () => {
    const t = (h: string) => z(`2026-10-22T${h}:00:00`)
    expect(
      minutosUteisDosIntervalos(
        [
          { de: t('11'), ate: t('13') },
          { de: t('15'), ate: t('16') },
        ],
        cal,
      ),
    ).toBe(180)
  })
})

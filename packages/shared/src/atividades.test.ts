import { describe, expect, it } from 'vitest'

import {
  alterarAtividadeSchema,
  criarAtividadeSchema,
  diaNoFuso,
  estaAtrasada,
  estaNoFuturo,
  fusoValido,
  inicioDoDiaNoFuso,
} from './atividades.js'

const TIPO = '0191f2b4-0000-7000-8000-000000000001'

describe('fuso e dias (America/Sao_Paulo, nunca UTC)', () => {
  it('22h e 00h30 de Brasília caem em dias diferentes, ao contrário do que o UTC diria', () => {
    // 22h de 14/10 em Brasília = 01h de 15/10 em UTC; 00h30 de 15/10 em Brasília = 03h30 UTC
    const as22 = '2026-10-15T01:00:00Z'
    const as0030 = '2026-10-15T03:30:00Z'
    expect(diaNoFuso(as22, 'America/Sao_Paulo')).toBe('2026-10-14')
    expect(diaNoFuso(as0030, 'America/Sao_Paulo')).toBe('2026-10-15')
    // em UTC as duas seriam do mesmo dia
    expect(diaNoFuso(as22, 'UTC')).toBe(diaNoFuso(as0030, 'UTC'))
  })

  it('início do dia no fuso: meia-noite de Brasília é 03h UTC', () => {
    expect(inicioDoDiaNoFuso('2026-10-15', 'America/Sao_Paulo').toISOString()).toBe(
      '2026-10-15T03:00:00.000Z',
    )
    expect(inicioDoDiaNoFuso('2026-10-15', 'UTC').toISOString()).toBe('2026-10-15T00:00:00.000Z')
    // fuso a leste de UTC: a meia-noite local é no dia anterior em UTC
    expect(inicioDoDiaNoFuso('2026-10-15', 'Asia/Tokyo').toISOString()).toBe(
      '2026-10-14T15:00:00.000Z',
    )
  })

  it('início do dia respeita o horário de verão (Nova York, 08/03/2026: -05 antes, -04 depois)', () => {
    expect(inicioDoDiaNoFuso('2026-03-07', 'America/New_York').toISOString()).toBe(
      '2026-03-07T05:00:00.000Z',
    )
    expect(inicioDoDiaNoFuso('2026-03-09', 'America/New_York').toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    )
    // o dia da virada começa ainda no horário antigo
    expect(inicioDoDiaNoFuso('2026-03-08', 'America/New_York').toISOString()).toBe(
      '2026-03-08T05:00:00.000Z',
    )
  })

  it('valida o nome do fuso', () => {
    expect(fusoValido('America/Sao_Paulo')).toBe(true)
    expect(fusoValido('Marte/Olympus')).toBe(false)
  })
})

describe('atrasada (calculada, no fuso da empresa)', () => {
  const agora = new Date('2026-10-15T15:00:00Z') // 12h de Brasília

  it('aberta com a data passada está atrasada; realizada e cancelada nunca', () => {
    const base = { dataInicio: '2026-10-15T14:00:00Z', diaInteiro: false }
    expect(estaAtrasada({ ...base, situacao: 'pendente' }, agora)).toBe(true)
    expect(estaAtrasada({ ...base, situacao: 'em_execucao' }, agora)).toBe(true)
    expect(estaAtrasada({ ...base, situacao: 'realizada' }, agora)).toBe(false)
    expect(estaAtrasada({ ...base, situacao: 'cancelada' }, agora)).toBe(false)
    expect(
      estaAtrasada({ ...base, dataInicio: '2026-10-15T16:00:00Z', situacao: 'pendente' }, agora),
    ).toBe(false)
  })

  it('dia inteiro de hoje não está atrasado; o de ontem, sim (no fuso, não em UTC)', () => {
    const hoje = inicioDoDiaNoFuso('2026-10-15').toISOString()
    const ontem = inicioDoDiaNoFuso('2026-10-14').toISOString()
    expect(estaAtrasada({ situacao: 'pendente', dataInicio: hoje, diaInteiro: true }, agora)).toBe(
      false,
    )
    expect(estaAtrasada({ situacao: 'pendente', dataInicio: ontem, diaInteiro: true }, agora)).toBe(
      true,
    )
  })

  it('às 00h30 de Brasília o "hoje" já virou, embora em UTC ainda seja o mesmo dia', () => {
    const meiaNoite30 = new Date('2026-10-15T03:30:00Z') // 00h30 de 15/10 em Brasília
    const ontem = inicioDoDiaNoFuso('2026-10-14').toISOString()
    expect(
      estaAtrasada({ situacao: 'pendente', dataInicio: ontem, diaInteiro: true }, meiaNoite30),
    ).toBe(true)
    const as22 = new Date('2026-10-15T01:00:00Z') // 22h de 14/10 em Brasília
    expect(estaAtrasada({ situacao: 'pendente', dataInicio: ontem, diaInteiro: true }, as22)).toBe(
      false,
    )
  })
})

describe('data no futuro (tolerância de 5 minutos)', () => {
  const agora = new Date('2026-10-15T15:00:00Z')
  it('aceita até 5 minutos à frente e recusa mais que isso', () => {
    expect(estaNoFuturo('2026-10-15T15:05:00Z', agora)).toBe(false)
    expect(estaNoFuturo('2026-10-15T15:05:01Z', agora)).toBe(true)
    expect(estaNoFuturo('2026-10-15T14:00:00Z', agora)).toBe(false)
  })
})

describe('schemas', () => {
  it('registrar: padrão Realizada, que exige o resultado', () => {
    const base = { tipoAtividadeId: TIPO, titulo: 'Visita', dataInicio: '2026-10-15T14:00:00Z' }
    const r = criarAtividadeSchema.safeParse(base)
    expect(r.success).toBe(false)
    const ok = criarAtividadeSchema.parse({ ...base, resultado: ' Fechou a proposta ' })
    expect(ok.situacao).toBe('realizada')
    expect(ok.resultado).toBe('Fechou a proposta')
    expect(ok.importante).toBe(false)
    // pendente não exige resultado
    expect(criarAtividadeSchema.safeParse({ ...base, situacao: 'pendente' }).success).toBe(true)
    // cancelada não se cria
    expect(criarAtividadeSchema.safeParse({ ...base, situacao: 'cancelada' }).success).toBe(false)
  })

  it('o fim não vem antes do início', () => {
    const r = criarAtividadeSchema.safeParse({
      tipoAtividadeId: TIPO,
      titulo: 'Reunião',
      situacao: 'pendente',
      dataInicio: '2026-10-15T14:00:00Z',
      dataFim: '2026-10-15T13:00:00Z',
    })
    expect(r.success).toBe(false)
  })

  it('editar: exige algum campo e recusa o que não existe', () => {
    expect(alterarAtividadeSchema.safeParse({}).success).toBe(false)
    expect(alterarAtividadeSchema.safeParse({ situacao: 'cancelada' }).success).toBe(false)
    expect(alterarAtividadeSchema.safeParse({ titulo: 'Novo' }).success).toBe(true)
  })
})

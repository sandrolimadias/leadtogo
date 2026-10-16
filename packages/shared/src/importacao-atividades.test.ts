import { describe, expect, it } from 'vitest'

import { decidirAtividade, lerLinhaDeAtividade, lerSituacao } from './importacao-atividades.js'
import { INVALIDO } from './importacao-leitura.js'

const CAMPOS = {
  documento: 'CNPJ',
  tipo: 'Tipo',
  titulo: 'Título',
  data: 'Data',
  hora: 'Hora',
  situacao: 'Situação',
  resultado: 'Resultado',
  emailContato: 'E-mail do contato',
  emailResponsavel: 'E-mail do responsável',
  importante: 'Importante',
  urgente: 'Urgente',
  observacoes: 'Obs',
}
const linha = (extra: Record<string, string> = {}) => ({
  CNPJ: '00.000.000/0001-91',
  Tipo: 'Visita',
  Data: '05/03/2026',
  ...extra,
})
const ler = (extra: Record<string, string> = {}) => {
  const r = lerLinhaDeAtividade(linha(extra), CAMPOS)
  if (!r.ok) throw new Error(r.motivo)
  return r
}
const AGORA = new Date('2026-10-16T15:00:00.000Z') // 12:00 em São Paulo

describe('lerSituacao', () => {
  it('aceita as variações; em branco é nulo; outro valor é inválido', () => {
    expect(lerSituacao('Realizada')).toBe('realizada')
    expect(lerSituacao('realizado')).toBe('realizada')
    expect(lerSituacao('Feita')).toBe('realizada')
    expect(lerSituacao('Agendada')).toBe('pendente')
    expect(lerSituacao('PENDENTE')).toBe('pendente')
    expect(lerSituacao('Cancelado')).toBe('cancelada')
    expect(lerSituacao('')).toBeNull()
    expect(lerSituacao('adiada')).toBe(INVALIDO)
  })
})

describe('lerLinhaDeAtividade', () => {
  it('lê a linha completa', () => {
    const r = ler({
      Título: 'Visita ao cliente',
      Hora: '9h30',
      Situação: 'realizada',
      Resultado: 'Fechou',
      'E-mail do contato': 'Maria@Exemplo.com',
      'E-mail do responsável': 'ana@exemplo.com',
      Importante: 'sim',
      Urgente: 'não',
      Obs: 'Levar proposta',
    })
    expect(r.atividade).toEqual({
      tipo: 'Visita',
      titulo: 'Visita ao cliente',
      dia: '2026-03-05',
      hora: '09:30',
      situacao: 'realizada',
      resultado: 'Fechou',
      emailContato: 'maria@exemplo.com',
      emailResponsavel: 'ana@exemplo.com',
      importante: true,
      urgente: false,
      observacoes: 'Levar proposta',
    })
    expect(r.avisos).toEqual([])
  })

  it('pula tipo em branco, data em branco ou inválida, hora e situação inválidas', () => {
    expect(lerLinhaDeAtividade(linha({ Tipo: '' }), CAMPOS)).toMatchObject({ ok: false })
    expect(lerLinhaDeAtividade(linha({ Data: '' }), CAMPOS)).toMatchObject({
      ok: false,
      motivo: 'Data em branco.',
    })
    expect(lerLinhaDeAtividade(linha({ Data: '31/02/2026' }), CAMPOS)).toMatchObject({ ok: false })
    expect(lerLinhaDeAtividade(linha({ Hora: '25:00' }), CAMPOS)).toMatchObject({ ok: false })
    const s = lerLinhaDeAtividade(linha({ Situação: 'adiada' }), CAMPOS)
    expect(s.ok === false && s.motivo).toContain('Situação desconhecida')
  })

  it('a hora pode vir na própria data do Excel (AAAA-MM-DD HH:mm)', () => {
    const r = ler({ Data: '2026-03-05 14:30' })
    expect(r.atividade).toMatchObject({ dia: '2026-03-05', hora: '14:30' })
  })

  it('e-mails ruins e sim/não estranhos viram aviso, não pulam a linha', () => {
    const r = ler({
      'E-mail do contato': 'maria@',
      'E-mail do responsável': 'sem arroba',
      Importante: 'talvez',
    })
    expect(r.atividade.emailContato).toBeNull()
    expect(r.atividade.emailResponsavel).toBeNull()
    expect(r.atividade.importante).toBe(false)
    expect(r.avisos).toHaveLength(3)
  })
})

describe('decidirAtividade (fuso America/Sao_Paulo)', () => {
  const decidir = (extra: Record<string, string>, agora = AGORA) =>
    decidirAtividade(ler(extra).atividade, agora, 'America/Sao_Paulo')

  it('sem hora é dia inteiro (meia-noite do dia no fuso); com hora, aquele relógio', () => {
    const d = decidir({ Resultado: 'ok' })
    expect(d).toMatchObject({ ok: true, diaInteiro: true, situacao: 'realizada' })
    expect(d.ok && d.dataInicio.toISOString()).toBe('2026-03-05T03:00:00.000Z')
    const h = decidir({ Hora: '22:00', Resultado: 'ok' })
    expect(h.ok && h.dataInicio.toISOString()).toBe('2026-03-06T01:00:00.000Z') // 22h em SP já é o dia 06 em UTC
    const meia = decidir({ Hora: '00:30', Resultado: 'ok' })
    expect(meia.ok && meia.dataInicio.toISOString()).toBe('2026-03-05T03:30:00.000Z')
  })

  it('situação em branco: data passada é Realizada; futura é Pendente; o dia inteiro de HOJE é Pendente', () => {
    expect(decidir({ Data: '01/10/2026', Resultado: 'ok' })).toMatchObject({
      ok: true,
      situacao: 'realizada',
    })
    expect(decidir({ Data: '30/10/2026' })).toMatchObject({
      ok: true,
      situacao: 'pendente',
      realizadaEm: null,
    })
    expect(decidir({ Data: '16/10/2026' })).toMatchObject({ ok: true, situacao: 'pendente' })
    // com hora compara o instante: 09:00 de hoje já passou (agora é 12:00); 18:00 ainda não
    expect(decidir({ Data: '16/10/2026', Hora: '09:00', Resultado: 'ok' })).toMatchObject({
      situacao: 'realizada',
    })
    expect(decidir({ Data: '16/10/2026', Hora: '18:00' })).toMatchObject({ situacao: 'pendente' })
  })

  it('a virada do dia no fuso: 22h e 00h30 (o "hoje" não é o de UTC)', () => {
    const as2230 = new Date('2026-10-17T01:30:00.000Z') // 22:30 do dia 16 em SP; já é dia 17 em UTC
    expect(decidir({ Data: '16/10/2026' }, as2230)).toMatchObject({ situacao: 'pendente' })
    expect(decidir({ Data: '15/10/2026', Resultado: 'ok' }, as2230)).toMatchObject({
      situacao: 'realizada',
    })
    const as0030 = new Date('2026-10-17T03:30:00.000Z') // 00:30 do dia 17 em SP
    expect(decidir({ Data: '16/10/2026', Resultado: 'ok' }, as0030)).toMatchObject({
      situacao: 'realizada',
    })
    expect(decidir({ Data: '17/10/2026' }, as0030)).toMatchObject({ situacao: 'pendente' })
  })

  it('Realizada no futuro (passados os 5 minutos de tolerância) é pulada; dentro da tolerância entra', () => {
    const futuro = decidir({ Data: '30/10/2026', Situação: 'Realizada', Resultado: 'ok' })
    expect(futuro).toMatchObject({ ok: false, resultado: 'pulada_no_futuro' })
    // 12:04 em SP com "agora" 12:00: dentro de 5 minutos
    expect(
      decidir({ Data: '16/10/2026', Hora: '12:04', Situação: 'Realizada', Resultado: 'ok' }),
    ).toMatchObject({ ok: true })
    expect(
      decidir({ Data: '16/10/2026', Hora: '12:06', Situação: 'Realizada', Resultado: 'ok' }),
    ).toMatchObject({
      ok: false,
      resultado: 'pulada_no_futuro',
    })
  })

  it('Realizada exige o Resultado (a regra do cadastro, que o banco também confere)', () => {
    expect(decidir({ Data: '01/10/2026' })).toMatchObject({
      ok: false,
      resultado: 'pulada_invalida',
    })
    expect(decidir({ Data: '01/10/2026', Situação: 'cancelada' })).toMatchObject({
      ok: true,
      situacao: 'cancelada',
    })
  })

  it('Pendente ignora o Resultado, com aviso; Cancelada guarda o resultado', () => {
    const p = decidir({ Data: '30/10/2026', Resultado: 'Combinar' })
    expect(p).toMatchObject({ ok: true, situacao: 'pendente', resultado: null })
    expect(p.ok && p.avisos).toEqual(['Resultado ignorado: a atividade está Pendente.'])
    const c = decidir({ Data: '01/10/2026', Situação: 'Cancelada', Resultado: 'Cliente desistiu' })
    expect(c).toMatchObject({
      ok: true,
      situacao: 'cancelada',
      resultado: 'Cliente desistiu',
      realizadaEm: null,
    })
  })

  it('realizada guarda realizadaEm = data de início', () => {
    const d = decidir({ Data: '01/10/2026', Hora: '10:00', Resultado: 'ok' })
    expect(d.ok && d.realizadaEm?.toISOString()).toBe('2026-10-01T13:00:00.000Z')
  })
})

import { describe, expect, it } from 'vitest'

import { formatarTelefone, linkDeLigacao, linkDoWhatsapp, normalizarTelefone } from './telefone.js'

describe('normalizarTelefone', () => {
  it('fixo com 8 dígitos e DDD, com ou sem máscara, +55 ou zero da operadora', () => {
    for (const entrada of [
      '2730643021',
      '(27) 3064-3021',
      '27 3064 3021',
      '+55 27 3064-3021',
      '552730643021',
      '0 27 3064-3021',
      '027 30643021',
    ]) {
      expect(normalizarTelefone(entrada), entrada).toEqual({
        numero: '2730643021',
        e164: '+552730643021',
        tipo: 'fixo',
      })
    }
  })

  it('celular com 9 dígitos começando em 9', () => {
    expect(normalizarTelefone('(27) 99812-4410')).toEqual({
      numero: '27998124410',
      e164: '+5527998124410',
      tipo: 'celular',
    })
    expect(normalizarTelefone('+5527998124410')?.e164).toBe('+5527998124410')
  })

  it('celular antigo (8 dígitos começando em 6 a 9) vem da Receita e é aceito como celular', () => {
    expect(normalizarTelefone('2788123456')).toEqual({
      numero: '2788123456',
      e164: '+552788123456',
      tipo: 'celular',
    })
  })

  it('DDD 55 (Rio Grande do Sul) não é confundido com o código do país', () => {
    expect(normalizarTelefone('5532221234')).toEqual({
      numero: '5532221234',
      e164: '+555532221234',
      tipo: 'fixo',
    })
    expect(normalizarTelefone('55991234567')?.e164).toBe('+5555991234567')
  })

  it('0800 e afins são números de serviço (tipo outro)', () => {
    expect(normalizarTelefone('0800 123 4567')).toEqual({
      numero: '08001234567',
      e164: '+558001234567',
      tipo: 'outro',
    })
  })

  it('número de outro país: só com "+", de 8 a 15 dígitos', () => {
    expect(normalizarTelefone('+1 415 555 2671')).toEqual({
      numero: '+14155552671',
      e164: '+14155552671',
      tipo: 'outro',
    })
    expect(normalizarTelefone('+351 21 123 4567')?.e164).toBe('+351211234567')
    expect(normalizarTelefone('+1234')).toBeNull()
    expect(normalizarTelefone('+1234567890123456')).toBeNull()
  })

  it('recusa vazio, letras, DDD inexistente, tamanho errado e nono dígito que não é 9', () => {
    for (const ruim of [
      '',
      '   ',
      'abc',
      '27 3064-30x1',
      '1030643021', // DDD 10 não existe
      '273064302', // 9 dígitos
      '273064302100',
      '27 88123-4567', // 9 dígitos que não começam com 9
      '27 13064021', // fixo começando em 1
      '+0123456789',
    ]) {
      expect(normalizarTelefone(ruim), `"${ruim}"`).toBeNull()
    }
  })
})

describe('links e formatação', () => {
  it('WhatsApp e ligação a partir do E.164', () => {
    expect(linkDoWhatsapp('+5527998124410')).toBe('https://wa.me/5527998124410')
    expect(linkDeLigacao('+5527998124410')).toBe('tel:+5527998124410')
  })
  it('formata o número nacional', () => {
    expect(formatarTelefone('2730643021')).toBe('(27) 3064-3021')
    expect(formatarTelefone('27998124410')).toBe('(27) 99812-4410')
    expect(formatarTelefone('+14155552671')).toBe('+14155552671')
  })
})

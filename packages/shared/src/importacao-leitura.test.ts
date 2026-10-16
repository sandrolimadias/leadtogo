import { describe, expect, it } from 'vitest'

import {
  horaDaData,
  INVALIDO,
  lerAniversario,
  lerData,
  lerHora,
  lerLinkedin,
  lerSimNao,
  paraComparar,
} from './importacao-leitura.js'

describe('leitura das células da planilha', () => {
  it('sim e não, com variações; em branco é nulo; o resto é inválido', () => {
    for (const v of ['sim', 'Sim', ' S ', 'x', '1', 'TRUE']) expect(lerSimNao(v), v).toBe(true)
    for (const v of ['não', 'Nao', 'n', '0', 'false']) expect(lerSimNao(v), v).toBe(false)
    expect(lerSimNao('')).toBeNull()
    expect(lerSimNao('   ')).toBeNull()
    expect(lerSimNao('talvez')).toBe(INVALIDO)
  })

  it('datas dd/mm/aaaa, AAAA-MM-DD (Excel) e com hora; dia que não existe é inválido', () => {
    expect(lerData('05/03/2026')).toBe('2026-03-05')
    expect(lerData('5/3/2026')).toBe('2026-03-05')
    expect(lerData('05-03-2026')).toBe('2026-03-05')
    expect(lerData('29/02/2028')).toBe('2028-02-29')
    expect(lerData('2026-03-05')).toBe('2026-03-05')
    expect(lerData('2026-03-05 14:30')).toBe('2026-03-05')
    expect(lerData('31/02/2026')).toBe(INVALIDO)
    expect(lerData('29/02/2027')).toBe(INVALIDO)
    expect(lerData('2026-13-01')).toBe(INVALIDO)
    expect(lerData('ontem')).toBe(INVALIDO)
    expect(lerData('5/3/26')).toBe(INVALIDO) // ano de 2 dígitos é ambíguo
    expect(lerData('')).toBeNull()
  })

  it('a hora que vem junto da data do Excel', () => {
    expect(horaDaData('2026-03-05 14:30')).toBe('14:30')
    expect(horaDaData('2026-03-05 09:05')).toBe('09:05')
    expect(horaDaData('2026-03-05')).toBeNull()
  })

  it('horas: 9:30, 09:30:00, 9h30, 14h e a fração de dia do Excel', () => {
    expect(lerHora('9:30')).toBe('09:30')
    expect(lerHora('09:30:15')).toBe('09:30')
    expect(lerHora('9h30')).toBe('09:30')
    expect(lerHora('14h')).toBe('14:00')
    expect(lerHora('0.5')).toBe('12:00')
    expect(lerHora('0,75')).toBe('18:00')
    expect(lerHora('0')).toBe('00:00')
    expect(lerHora('24:00')).toBe(INVALIDO)
    expect(lerHora('10:61')).toBe(INVALIDO)
    expect(lerHora('tarde')).toBe(INVALIDO)
    expect(lerHora('')).toBeNull()
  })

  it('aniversário sem ano: dd/mm, dd/mm/aaaa e a data do Excel; 29/02 vale e 31/02 não', () => {
    expect(lerAniversario('15/03')).toEqual({ dia: 15, mes: 3 })
    expect(lerAniversario('5/3/1990')).toEqual({ dia: 5, mes: 3 })
    expect(lerAniversario('1990-03-15')).toEqual({ dia: 15, mes: 3 })
    expect(lerAniversario('29/02')).toEqual({ dia: 29, mes: 2 })
    expect(lerAniversario('31/02')).toBe(INVALIDO)
    expect(lerAniversario('13/13')).toBe(INVALIDO)
    expect(lerAniversario('março')).toBe(INVALIDO)
    expect(lerAniversario('')).toBeNull()
  })

  it('LinkedIn: só o endereço do perfil', () => {
    expect(lerLinkedin('https://www.linkedin.com/in/maria')).toBe(
      'https://www.linkedin.com/in/maria',
    )
    expect(lerLinkedin('linkedin.com/in/maria')).toBe(INVALIDO)
    expect(lerLinkedin('https://exemplo.com/maria')).toBe(INVALIDO)
    expect(lerLinkedin('')).toBeNull()
  })

  it('compara nomes sem maiúsculas, acento e pontuação', () => {
    expect(paraComparar('  Visita   Técnica ')).toBe('visita tecnica')
    expect(paraComparar('Diretor(a)')).toBe('diretor a')
  })
})

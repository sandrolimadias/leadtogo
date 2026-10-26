import { describe, expect, it } from 'vitest'

import { dobrarLinha, gerarIcs } from './ics.js'

const base = {
  id: '0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b',
  titulo: 'Encontro anual de clientes',
  descricao: null,
  local: null,
  linkOnline: null,
  inicioEm: new Date('2026-11-12T21:30:00.000Z'),
  fimEm: new Date('2026-11-13T01:00:00.000Z'),
  cancelado: false,
  atualizadoEm: new Date('2026-10-26T12:00:00.000Z'),
}

describe('gerarIcs', () => {
  it('monta um VEVENT válido com datas em UTC e CRLF', () => {
    const ics = gerarIcs(base)
    expect(ics.endsWith('\r\n')).toBe(true)
    const linhas = ics.split('\r\n')
    expect(linhas[0]).toBe('BEGIN:VCALENDAR')
    expect(linhas).toContain('UID:0192f5b0-7c3a-7b1e-8f4a-3c2d1e0f9a8b@portal.leadtogo')
    expect(linhas).toContain('DTSTART:20261112T213000Z')
    expect(linhas).toContain('DTEND:20261113T010000Z')
    expect(linhas).toContain('DTSTAMP:20261026T120000Z')
    expect(linhas).toContain('SUMMARY:Encontro anual de clientes')
    expect(linhas).toContain('STATUS:CONFIRMED')
    expect(ics).not.toContain('\n\n')
    expect(linhas.filter((l) => l.startsWith('LOCATION'))).toHaveLength(0)
  })

  it('escapa vírgula, ponto e vírgula, barra e quebra de linha; inclui local e link', () => {
    const ics = gerarIcs({
      ...base,
      titulo: 'Treinamento: módulo; novo, 2026',
      descricao: 'Linha 1\nLinha 2 \\ fim',
      local: 'Auditório, 2º andar',
      linkOnline: 'https://meet.exemplo.com/abc',
    })
    expect(ics).toContain('SUMMARY:Treinamento: módulo\\; novo\\, 2026')
    expect(ics).toContain(
      'DESCRIPTION:Linha 1\\nLinha 2 \\\\ fim\\n\\nLink: https://meet.exemplo.com/abc',
    )
    expect(ics).toContain('LOCATION:Auditório\\, 2º andar')
    expect(ics).toContain('URL:https://meet.exemplo.com/abc')
  })

  it('evento cancelado sai como CANCELLED', () => {
    expect(gerarIcs({ ...base, cancelado: true })).toContain('STATUS:CANCELLED')
  })
})

describe('dobrarLinha', () => {
  it('não dobra linha curta; dobra a longa em até 75 octetos com espaço na continuação', () => {
    expect(dobrarLinha('curta')).toEqual(['curta'])
    const longa = 'DESCRIPTION:' + 'a'.repeat(200)
    const partes = dobrarLinha(longa)
    expect(partes.length).toBeGreaterThan(2)
    for (const p of partes) expect(Buffer.byteLength(p, 'utf8')).toBeLessThanOrEqual(75)
    expect(partes.slice(1).every((p) => p.startsWith(' '))).toBe(true)
    expect(partes.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(longa)
  })

  it('não corta um caractere acentuado ao meio', () => {
    const partes = dobrarLinha('SUMMARY:' + 'ç'.repeat(100))
    for (const p of partes) expect(Buffer.byteLength(p, 'utf8')).toBeLessThanOrEqual(75)
    expect(partes.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(
      'SUMMARY:' + 'ç'.repeat(100),
    )
  })
})

// Arquivo .ics (iCalendar, RFC 5545) de um evento da agenda do portal: o cliente "adiciona à agenda" no Google,
// Outlook ou Apple. Texto escapado (`\`, `;`, `,` e quebra de linha), linhas dobradas em 75 octetos e CRLF.

export interface EventoParaIcs {
  id: string
  titulo: string
  descricao: string | null
  local: string | null
  linkOnline: string | null
  inicioEm: Date
  fimEm: Date
  cancelado: boolean
  /** Última alteração (vira DTSTAMP e SEQUENCE estável) */
  atualizadoEm: Date
}

const escapar = (t: string): string =>
  t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

const instante = (d: Date): string =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

/** Dobra a linha em até 75 octetos (UTF-8), sem cortar um caractere ao meio; as continuações começam com espaço. */
export function dobrarLinha(linha: string): string[] {
  const partes: string[] = []
  let atual = ''
  let octetos = 0
  for (const caractere of linha) {
    const tamanho = Buffer.byteLength(caractere, 'utf8')
    const limite = partes.length === 0 ? 75 : 74 // a continuação gasta 1 octeto no espaço
    if (octetos + tamanho > limite) {
      partes.push(atual)
      atual = ''
      octetos = 0
    }
    atual += caractere
    octetos += tamanho
  }
  partes.push(atual)
  return partes.map((p, i) => (i === 0 ? p : ` ${p}`))
}

export function gerarIcs(e: EventoParaIcs): string {
  const descricao = [e.descricao, e.linkOnline ? `Link: ${e.linkOnline}` : null]
    .filter((x): x is string => !!x)
    .join('\n\n')
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Leadtogo//Portal do Cliente//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.id}@portal.leadtogo`,
    `DTSTAMP:${instante(e.atualizadoEm)}`,
    `DTSTART:${instante(e.inicioEm)}`,
    `DTEND:${instante(e.fimEm)}`,
    `SUMMARY:${escapar(e.titulo)}`,
    ...(descricao ? [`DESCRIPTION:${escapar(descricao)}`] : []),
    ...(e.local ? [`LOCATION:${escapar(e.local)}`] : []),
    ...(e.linkOnline ? [`URL:${e.linkOnline}`] : []),
    `STATUS:${e.cancelado ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return linhas.flatMap(dobrarLinha).join('\r\n') + '\r\n'
}

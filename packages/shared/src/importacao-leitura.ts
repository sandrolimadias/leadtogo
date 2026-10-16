import { aniversarioSchema } from './carteira-contatos.js'

// Leitura das células das planilhas de contatos e de atividades (sem banco, sem rede): sim/não, datas,
// horas, aniversário. Tudo devolve `null` para "em branco" e `'invalido'` para "preenchido, mas não entendi".

/** "Preenchido, mas não entendi" (um símbolo, para nunca se confundir com um texto lido). */
export const INVALIDO: unique symbol = Symbol('invalido')
export type Invalido = typeof INVALIDO

/** Texto para comparar nomes: minúsculas, sem acento e sem pontuação ("Visita técnica" = "visita tecnica"). */
export const paraComparar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** "sim", "s", "x", "1", "true" → verdadeiro; "não", "nao", "n", "0", "false" → falso; em branco → `null`. */
export function lerSimNao(valor: string): boolean | null | Invalido {
  const t = paraComparar(valor)
  if (t === '') return null
  if (['sim', 's', 'x', '1', 'true', 'verdadeiro', 'yes', 'y'].includes(t)) return true
  if (['nao', 'n', '0', 'false', 'falso', 'no'].includes(t)) return false
  return INVALIDO
}

const diaDoMesExiste = (a: number, m: number, d: number): boolean => {
  const data = new Date(Date.UTC(a, m - 1, d))
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d
}

/**
 * Uma data da planilha como AAAA-MM-DD: "dd/mm/aaaa" (também com "-" ou "."), "AAAA-MM-DD" e a data de
 * uma célula do Excel ("AAAA-MM-DD" ou "AAAA-MM-DD HH:mm", como a leitura da planilha entrega).
 */
export function lerData(valor: string): string | null | Invalido {
  const t = valor.trim()
  if (t === '') return null
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t)
  if (br) {
    const [d, m, a] = [Number(br[1]), Number(br[2]), Number(br[3])]
    return diaDoMesExiste(a, m, d)
      ? `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      : INVALIDO
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t)
  if (iso) {
    const [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    return diaDoMesExiste(a, m, d) ? `${iso[1]}-${iso[2]}-${iso[3]}` : INVALIDO
  }
  return INVALIDO
}

/** A hora que vem junto da data numa célula do Excel ("AAAA-MM-DD HH:mm"), ou `null`. */
export function horaDaData(valor: string): string | null {
  const m = /[ T](\d{1,2}):(\d{2})(?::\d{2})?$/.exec(valor.trim())
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : null
}

/** Uma hora como HH:mm: "9:30", "09:30", "09:30:00", "9h30", "14h" e a fração de dia do Excel ("0.5" = 12:00). */
export function lerHora(valor: string): string | null | Invalido {
  const t = valor.trim().toLowerCase()
  if (t === '') return null
  const pad = (n: number) => String(n).padStart(2, '0')
  const relogio = /^(\d{1,2})(?::|h)(\d{2})(?::\d{2})?$/.exec(t) ?? /^(\d{1,2})h$/.exec(t)
  if (relogio) {
    const h = Number(relogio[1])
    const min = Number(relogio[2] ?? 0)
    return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : INVALIDO
  }
  if (/^0?[.,]\d+$/.test(t) || t === '0') {
    const minutos = Math.round(Number(t.replace(',', '.')) * 24 * 60)
    return minutos >= 0 && minutos < 24 * 60
      ? `${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`
      : INVALIDO
  }
  return INVALIDO
}

/** Aniversário sem ano: "15/03", "15/03/1990" ou a data do Excel ("1990-03-15"). */
export function lerAniversario(valor: string): { dia: number; mes: number } | null | Invalido {
  const t = valor.trim()
  if (t === '') return null
  let dia: number
  let mes: number
  const diaMes = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t)
  const iso = /^\d{4}-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(t)
  if (diaMes) {
    dia = Number(diaMes[1])
    mes = Number(diaMes[2])
  } else if (iso) {
    mes = Number(iso[1])
    dia = Number(iso[2])
  } else return INVALIDO
  const r = aniversarioSchema.safeParse({ dia, mes })
  return r.success ? r.data : INVALIDO
}

/** O endereço do perfil do LinkedIn, ou `INVALIDO`. */
export function lerLinkedin(valor: string): string | null | Invalido {
  const t = valor.trim()
  if (t === '') return null
  return t.length <= 300 && /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/.+/i.test(t) ? t : INVALIDO
}

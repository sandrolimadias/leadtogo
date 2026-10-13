// Telefone em E.164. Só o Brasil tem regra própria (DDD + 8 ou 9 dígitos); número de outro país é
// aceito com "+" e de 8 a 15 dígitos, sem tipo. Uma biblioteca completa de telefones pesaria no PWA.

export type TipoDeTelefone = 'fixo' | 'celular' | 'outro'

export interface TelefoneNormalizado {
  /** Só os dígitos do número nacional (BR) ou "+" e os dígitos (outro país) */
  numero: string
  /** "+552730643021" */
  e164: string
  tipo: TipoDeTelefone
}

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
])

/**
 * Normaliza um telefone digitado (com ou sem máscara, com ou sem +55 e zero da operadora).
 * Devolve `null` se não for um número reconhecível. O telefone da Receita vem como DDD + número
 * ("2730643021"), às vezes vazio: vazio também vira `null`.
 */
export function normalizarTelefone(texto: string): TelefoneNormalizado | null {
  const bruto = texto.trim()
  if (bruto === '') return null
  if (/[^\d\s().\-+]/.test(bruto)) return null
  const comMais = bruto.startsWith('+')
  const digitos = bruto.replace(/\D/g, '')
  if (digitos === '') return null

  // Outro país: confere só o tamanho do E.164 (8 a 15 dígitos, sem zero na frente)
  if (comMais && !digitos.startsWith('55')) {
    if (digitos.length < 8 || digitos.length > 15 || digitos.startsWith('0')) return null
    return { numero: `+${digitos}`, e164: `+${digitos}`, tipo: 'outro' }
  }

  // Número de serviço (0800, 0300...): sem DDD
  const servico = /^0(800|300|303|400)\d{6,7}$/.exec(digitos)
  if (servico && !comMais) {
    return { numero: digitos, e164: `+55${digitos.slice(1)}`, tipo: 'outro' }
  }

  // Tira o código do país: "+55..." ou 55 colado ao DDD (um número nacional tem 10 ou 11 dígitos)
  let nacional = digitos
  if (comMais || (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13))) {
    nacional = digitos.slice(2)
  }
  nacional = nacional.replace(/^0+/, '') // zero da operadora ("0 27 3064-3021")

  if (nacional.length !== 10 && nacional.length !== 11) return null
  if (!DDDS_VALIDOS.has(Number(nacional.slice(0, 2)))) return null
  const local = nacional.slice(2)
  if (local.length === 9) {
    if (local[0] !== '9') return null
    return { numero: nacional, e164: `+55${nacional}`, tipo: 'celular' }
  }
  // 8 dígitos: fixo (começa em 2 a 5); a Receita ainda traz celular antigo sem o nono dígito (6 a 9)
  if (!/^[2-9]/.test(local)) return null
  return {
    numero: nacional,
    e164: `+55${nacional}`,
    tipo: /^[2-5]/.test(local) ? 'fixo' : 'celular',
  }
}

/** Link `https://wa.me/...` do telefone (E.164 sem o "+"). */
export const linkDoWhatsapp = (e164: string): string => `https://wa.me/${e164.replace(/\D/g, '')}`

/** Link `tel:` do telefone. */
export const linkDeLigacao = (e164: string): string => `tel:${e164}`

/** "(27) 3064-3021" ou "(27) 99999-1234" a partir do número nacional; outro formato volta como está. */
export function formatarTelefone(numero: string): string {
  if (/^\d{10}$/.test(numero))
    return `(${numero.slice(0, 2)}) ${numero.slice(2, 6)}-${numero.slice(6)}`
  if (/^\d{11}$/.test(numero))
    return `(${numero.slice(0, 2)}) ${numero.slice(2, 7)}-${numero.slice(7)}`
  return numero
}

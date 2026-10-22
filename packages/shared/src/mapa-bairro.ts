import { tirarAcentos } from './geo-normalizar.js'

// O bairro como o mapa o agrupa (bolha de bairro). O endereço é digitado à mão ("Jd. Camburi", "JARDIM  CAMBURÍ",
// "jardim camburi"): a chave tira acentos e pontuação, põe em maiúsculas, junta espaços e expande as abreviações
// mais comuns. Duas empresas do MESMO município com a mesma chave caem na mesma bolha. Não é a chave do CNEFE
// (`chaveDoBairro`): aquela tem de ficar igual à da carga dos endereços.

/** Abreviações de bairro, por palavra inteira (já sem acento e em maiúsculas). */
const ABREVIACOES: Record<string, string> = {
  JD: 'JARDIM',
  JDM: 'JARDIM',
  JARD: 'JARDIM',
  VL: 'VILA',
  VLA: 'VILA',
  STA: 'SANTA',
  STO: 'SANTO',
  PQ: 'PARQUE',
  PRQ: 'PARQUE',
  PARQ: 'PARQUE',
  CJ: 'CONJUNTO',
  CONJ: 'CONJUNTO',
  RES: 'RESIDENCIAL',
  RESID: 'RESIDENCIAL',
  LOT: 'LOTEAMENTO',
  LOTEAM: 'LOTEAMENTO',
  COND: 'CONDOMINIO',
  CENT: 'CENTRO',
  CTR: 'CENTRO',
  POV: 'POVOADO',
  DISTR: 'DISTRITO',
  DIST: 'DISTRITO',
  IND: 'INDUSTRIAL',
  JDS: 'JARDINS',
  NSA: 'NOSSA',
  SRA: 'SENHORA',
}

/** Respostas que significam "não informado" (viram o grupo "Sem bairro"). */
const SEM_BAIRRO = new Set([
  '',
  'SB',
  'S B',
  'SEM BAIRRO',
  'NAO INFORMADO',
  'NAO INFORMADA',
  'NI',
  'N I',
  'NULL',
])

/**
 * A chave do bairro para agrupar: sem acento, em maiúsculas, sem pontuação, espaços únicos e abreviações
 * expandidas. Vazia = sem bairro. "Jd. Camburí" e "JARDIM  CAMBURI" dão "JARDIM CAMBURI".
 */
export function chaveDoBairroNoMapa(texto: string | null | undefined): string {
  let palavras = tirarAcentos(texto)
    .toUpperCase()
    .replace(/['`´]/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  // "BAIRRO SANTA LUCIA" e "SANTA LUCIA" são o mesmo bairro
  if (palavras[0] === 'BAIRRO' && palavras.length > 1) palavras = palavras.slice(1)
  const chave = palavras.map((p) => ABREVIACOES[p] ?? p).join(' ')
  return SEM_BAIRRO.has(chave) ? '' : chave
}

const MINUSCULAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E'])

/** O nome mostrado na bolha: a chave em caixa de título ("JARDIM CAMBURI" → "Jardim Camburi"). */
export function rotuloDoBairro(chave: string): string {
  if (chave === '') return 'Sem bairro'
  return chave
    .split(' ')
    .map((p, i) =>
      i > 0 && MINUSCULAS.has(p) ? p.toLowerCase() : p.charAt(0) + p.slice(1).toLowerCase(),
    )
    .join(' ')
}

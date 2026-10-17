// Normalização de endereço para a geocodificação (docs/plano_geolocalizacao.md, G1). Portada de
// experimentos/geo-g0/scripts/normalizar.py, que foi medida no G0: sem acento, maiúsculas, tipo do
// logradouro removido e títulos abreviados expandidos. É a MESMA função da carga do CNEFE
// (scripts/geo/) e da consulta: se uma mudar, a outra tem de mudar junto e o CNEFE ser recarregado.

const TIPOS: Record<string, string> = {
  R: 'RUA',
  AV: 'AVENIDA',
  AVE: 'AVENIDA',
  AVEN: 'AVENIDA',
  ROD: 'RODOVIA',
  RDV: 'RODOVIA',
  EST: 'ESTRADA',
  ETR: 'ESTRADA',
  TRAV: 'TRAVESSA',
  TV: 'TRAVESSA',
  TRV: 'TRAVESSA',
  PC: 'PRACA',
  PCA: 'PRACA',
  PRC: 'PRACA',
  AL: 'ALAMEDA',
  ALA: 'ALAMEDA',
  LGO: 'LARGO',
  LRG: 'LARGO',
  BC: 'BECO',
  VL: 'VILA',
  VLA: 'VILA',
  LOT: 'LOTEAMENTO',
  LOTEAM: 'LOTEAMENTO',
  CAM: 'CAMINHO',
  PRQ: 'PARQUE',
  CJ: 'CONJUNTO',
  COND: 'CONDOMINIO',
  FAZ: 'FAZENDA',
  SIT: 'SITIO',
  ACS: 'ACESSO',
  VIA: 'VIA',
  VD: 'VIADUTO',
}

const TITULOS: Record<string, string> = {
  DR: 'DOUTOR',
  DRA: 'DOUTORA',
  PROF: 'PROFESSOR',
  PROFA: 'PROFESSORA',
  CEL: 'CORONEL',
  CAP: 'CAPITAO',
  TEN: 'TENENTE',
  GEN: 'GENERAL',
  MAL: 'MARECHAL',
  PE: 'PADRE',
  PDE: 'PADRE',
  DEP: 'DEPUTADO',
  SEN: 'SENADOR',
  ENG: 'ENGENHEIRO',
  ENGO: 'ENGENHEIRO',
  PRES: 'PRESIDENTE',
  GOV: 'GOVERNADOR',
  PREF: 'PREFEITO',
  VER: 'VEREADOR',
  COM: 'COMENDADOR',
  CONS: 'CONSELHEIRO',
  MONS: 'MONSENHOR',
  SGT: 'SARGENTO',
  ALM: 'ALMIRANTE',
  BARAO: 'BARAO',
  STA: 'SANTA',
  STO: 'SANTO',
  SRA: 'SENHORA',
  SR: 'SENHOR',
  S: 'SAO',
}

const TIPOS_COMPLETOS = new Set([
  ...Object.values(TIPOS),
  'RUA',
  'AVENIDA',
  'RODOVIA',
  'ESTRADA',
  'TRAVESSA',
  'PRACA',
  'ALAMEDA',
  'LARGO',
  'BECO',
  'VILA',
  'CAMINHO',
  'PARQUE',
  'VIA',
  'LADEIRA',
  'SERVIDAO',
  'RAMAL',
  'LINHA',
  'CORREGO',
  'PASSAGEM',
  'TUNEL',
  'ESCADARIA',
  'ACESSO',
  'LOTEAMENTO',
  'CONJUNTO',
  'CONDOMINIO',
  'FAZENDA',
  'SITIO',
  'VIADUTO',
  'ESTACAO',
  'BOULEVARD',
  'TREVO',
  'RETORNO',
  'MARGINAL',
  'RODOANEL',
  'AREA',
  'QUADRA',
  'NUCLEO',
  'COMUNIDADE',
  'DISTRITO',
  'LOCALIDADE',
  'POVOADO',
])

/** Tira os acentos (decompõe e descarta as marcas combinantes). */
export function tirarAcentos(texto: string | null | undefined): string {
  return (texto ?? '').normalize('NFD').replace(/\p{Mn}/gu, '')
}

function tokens(texto: string | null | undefined): string[] {
  const limpo = tirarAcentos(texto)
    .toUpperCase()
    .replace(/'/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
  return limpo.split(/\s+/).filter(Boolean)
}

/**
 * Chave de busca da rua: "AV. DR. FULANO" → "DOUTOR FULANO". Remove o tipo (RUA, AVENIDA...) e
 * expande os títulos abreviados (só quando a rua tem mais de uma palavra).
 */
export function chaveDaRua(texto: string | null | undefined, removerTipo = true): string {
  let ts = tokens(texto)
  const primeiro = ts[0]
  if (removerTipo && primeiro !== undefined) {
    const completo = TIPOS[primeiro] ?? primeiro
    if (TIPOS_COMPLETOS.has(completo)) ts = ts.slice(1)
  }
  const varias = ts.length > 1
  return ts.map((t) => (varias ? (TITULOS[t] ?? t) : t)).join(' ')
}

/** Bairro ou localidade como o CNEFE guarda: sem acento e em maiúsculas. */
export function chaveDoBairro(texto: string | null | undefined): string {
  return tirarAcentos(texto).toUpperCase().replace(/\s+/g, ' ').trim()
}

/** "S/N", "SN", "sem número", "0", "-" ou vazio: o endereço não tem número de porta. */
const SEM_NUMERO = /^\s*(|S\s*\/?\s*N|SN|S\.N\.?|SEM\s*N.*|0+|-+)\s*$/i

export function semNumeroDePorta(numero: string | null | undefined): boolean {
  return SEM_NUMERO.test(numero ?? '')
}

/**
 * O número de porta como inteiro (só os dígitos: "123-A" → 123); `null` quando não há número
 * ("S/N", vazio) ou não há dígito ("KM"). "KM 12" vira 12: a rodovia é buscada pela rua e o
 * número só ajuda quando o CNEFE tem aquele ponto.
 */
export function numeroDePorta(numero: string | null | undefined): number | null {
  if (semNumeroDePorta(numero)) return null
  const digitos = /\d+/.exec(numero ?? '')
  if (!digitos) return null
  const n = Number.parseInt(digitos[0], 10)
  return n > 0 ? n : null
}

/** Os 8 dígitos do CEP, ou `null` se não forem 8. */
export function cepNormalizado(cep: string | null | undefined): string | null {
  const d = (cep ?? '').replace(/\D/g, '')
  return d.length === 8 ? d : null
}

/** Endereço como a empresa guarda (docs/modelagem_banco.md, seção Empresas). */
export interface EnderecoDaEmpresa {
  cep?: string | null
  tipoLogradouro?: string | null
  logradouro?: string | null
  numero?: string | null
  bairro?: string | null
  municipioCodigo?: number | null
}

export type FaltaNoEndereco = 'logradouro' | 'numero' | 'bairro' | 'cidade'

/**
 * O que falta para o endereço ser geocodificável (sem rua, número, bairro ou cidade). "S/N" NÃO é
 * falta: o endereço sem número de porta é um endereço completo. Número em branco é falta.
 */
export function faltasNoEndereco(e: EnderecoDaEmpresa): FaltaNoEndereco[] {
  const faltas: FaltaNoEndereco[] = []
  if (!e.logradouro?.trim()) faltas.push('logradouro')
  if (!(e.numero ?? '').trim()) faltas.push('numero')
  if (!e.bairro?.trim()) faltas.push('bairro')
  if (!e.municipioCodigo) faltas.push('cidade')
  return faltas
}

/** Texto do endereço para o registro de consulta (auditoria): "rua, número, bairro, município". */
export function textoDoEndereco(e: EnderecoDaEmpresa, municipio: string | null): string {
  const rua = [e.tipoLogradouro, e.logradouro]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ')
  return [rua, e.numero?.trim(), e.bairro?.trim(), municipio?.trim(), cepNormalizado(e.cep)]
    .filter(Boolean)
    .join(', ')
}

/** Semelhança entre dois textos, de 0 a 1 (1 - distância de edição / tamanho do maior). */
export function semelhanca(a: string, b: string): number {
  if (a === b) return 1
  if (a.length === 0 || b.length === 0) return 0
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const atual = [i]
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      atual[j] = Math.min(
        (anterior[j] ?? 0) + 1,
        (atual[j - 1] ?? 0) + 1,
        (anterior[j - 1] ?? 0) + custo,
      )
    }
    anterior = atual
  }
  return 1 - (anterior[b.length] ?? 0) / Math.max(a.length, b.length)
}

import { cepNormalizado, chaveDaRua, chaveDoBairro } from './geo-normalizar.js'

// Conversão de uma linha do CSV do CNEFE 2022 (IBGE, Censo) para o que `referencia_geo` guarda.
// Usada por scripts/geo/carregar-cnefe.mjs (preparo, fora da VPS). Função pura e testada.

/** As colunas do CSV do CNEFE que a carga usa (nomes oficiais do layout). */
export interface RegistroDoCnefe {
  COD_MUNICIPIO?: string
  CEP?: string
  DSC_LOCALIDADE?: string
  NOM_TIPO_SEGLOGR?: string
  NOM_TITULO_SEGLOGR?: string
  NOM_SEGLOGR?: string
  NUM_ENDERECO?: string
  DSC_MODIFICADOR?: string
  LATITUDE?: string
  LONGITUDE?: string
  COD_ESPECIE?: string
  NV_GEO_COORD?: string
}

export interface EnderecoDoCnefe {
  municipioCodigo: number
  cep: string | null
  localidade: string | null
  logradouroNormalizado: string
  /** Como veio no CNEFE: tipo, título e nome */
  logradouroOriginal: string
  /** Nulo = sem número (S/N) */
  numero: number | null
  modificador: string | null
  latitude: number
  longitude: number
  nivelCoordenada: number
  especie: number
}

/** `null` quando a linha não tem coordenada válida ou município (não serve para geocodificar). */
export function converterLinhaDoCnefe(r: RegistroDoCnefe): EnderecoDoCnefe | null {
  const latitude = Number.parseFloat((r.LATITUDE ?? '').replace(',', '.'))
  const longitude = Number.parseFloat((r.LONGITUDE ?? '').replace(',', '.'))
  const municipioCodigo = Number.parseInt(r.COD_MUNICIPIO ?? '', 10)
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(municipioCodigo)
  ) {
    return null
  }
  const original = [r.NOM_TIPO_SEGLOGR, r.NOM_TITULO_SEGLOGR, r.NOM_SEGLOGR]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ')
  const numero = Number.parseInt(r.NUM_ENDERECO ?? '', 10)
  const localidade = chaveDoBairro(r.DSC_LOCALIDADE)
  const modificador = (r.DSC_MODIFICADOR ?? '').trim()
  return {
    municipioCodigo,
    cep: cepNormalizado(r.CEP),
    localidade: localidade || null,
    logradouroNormalizado: chaveDaRua(original),
    logradouroOriginal: original,
    numero: Number.isFinite(numero) && numero > 0 ? numero : null,
    modificador: modificador || null,
    latitude,
    longitude,
    nivelCoordenada: Number.parseInt(r.NV_GEO_COORD ?? '', 10) || 0,
    especie: Number.parseInt(r.COD_ESPECIE ?? '', 10) || 0,
  }
}

/** Divide uma linha do CSV (separador `;`, aspas duplas opcionais, `""` dentro das aspas). */
export function dividirLinhaDoCsv(linha: string, separador = ';'): string[] {
  const campos: string[] = []
  let atual = ''
  let entreAspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (entreAspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else if (c === '"') entreAspas = false
      else atual += c
    } else if (c === '"') entreAspas = true
    else if (c === separador) {
      campos.push(atual)
      atual = ''
    } else atual += c
  }
  campos.push(atual)
  return campos
}

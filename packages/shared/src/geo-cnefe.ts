import { cepNormalizado } from './geo-normalizar.js'

// Escolha do ponto dentro do CNEFE, depois de achada a rua (docs/plano_geolocalizacao.md, G1).
// Portada de experimentos/geo-g0/scripts/cnefe_busca.py, que foi medida no G0. Função pura: a
// consulta ao banco só traz as linhas da rua e esta função decide o nível e a posição.

/** Um endereço do CNEFE (`referencia_geo.cnefe_enderecos`). */
export interface LinhaCnefe {
  latitude: number
  longitude: number
  /** Nulo = sem número (S/N) */
  numero: number | null
  /** NV_GEO_COORD: 1 original, 2 modificada, 3 estimada, 4 face, 5 localidade, 6 setor */
  nivelCoordenada: number
  cep: string | null
}

export type NivelCnefe = 'numero' | 'numero_interpolado' | 'rua'

export interface PontoCnefe {
  nivel: NivelCnefe
  latitude: number
  longitude: number
  detalhe: string
  /**
   * Só no nível `numero`: o mesmo número aparece em pontos distantes entre si (mesmo nome de rua em
   * bairros diferentes) e o CEP não resolveu. Vira "aproximada", mesmo com o número casado.
   */
  ambiguo: boolean
}

/** Raio que define "exata" (docs/plano_geolocalizacao.md): o número casado dentro de 100 m. */
export const RAIO_EXATA_M = 100
/** Vizinhos mais distantes que isto (em números de porta) não servem para interpolar. */
const LIMITE_INTERPOLACAO = 200

const mediana = (valores: number[]): number => {
  const v = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(v.length / 2)
  return v.length % 2 === 1 ? (v[meio] ?? 0) : ((v[meio - 1] ?? 0) + (v[meio] ?? 0)) / 2
}

const centro = (linhas: LinhaCnefe[]): { latitude: number; longitude: number } => ({
  latitude: mediana(linhas.map((l) => l.latitude)),
  longitude: mediana(linhas.map((l) => l.longitude)),
})

/** Distância em metros entre dois pontos (haversine). */
export function distanciaEmMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/**
 * Decide o ponto numa rua do CNEFE: número exato (com desempate por CEP), número interpolado entre
 * os dois vizinhos do mesmo lado (até 200 números de distância) ou o centro da rua.
 * `linhas` são TODOS os endereços da rua no município; devolve `null` se a lista for vazia.
 */
export function escolherNaRua(
  linhas: LinhaCnefe[],
  numero: number | null,
  cep: string | null | undefined,
): PontoCnefe | null {
  if (linhas.length === 0) return null
  const cepDaRua = cepNormalizado(cep)
  // O mesmo nome de rua existe em vários bairros: com CEP, fica só o trecho daquele CEP
  const doMesmoCep = cepDaRua ? linhas.filter((l) => l.cep === cepDaRua) : []
  const trecho = doMesmoCep.length > 0 ? doMesmoCep : linhas
  const cepResolveu = doMesmoCep.length > 0

  if (numero !== null) {
    const exatas = trecho.filter((l) => l.numero === numero)
    if (exatas.length > 0) {
      const c = centro(exatas)
      const espalhamento = Math.max(
        ...exatas.map((l) => distanciaEmMetros(c.latitude, c.longitude, l.latitude, l.longitude)),
      )
      const menorNivel = Math.min(...exatas.map((l) => l.nivelCoordenada))
      return {
        nivel: 'numero',
        ...c,
        detalhe: `número ${numero} (${exatas.length} pontos, nível ${menorNivel})`,
        ambiguo: !cepResolveu && espalhamento > RAIO_EXATA_M,
      }
    }
    // Só números com coordenada boa (original ou modificada) servem de vizinho
    const comNumero = trecho.filter(
      (l) => l.numero !== null && l.numero > 0 && l.nivelCoordenada <= 2,
    )
    if (comNumero.length > 0) {
      // O mesmo lado da rua (mesma paridade), quando houver
      const doMesmoLado = comNumero.filter((l) => (l.numero ?? 0) % 2 === numero % 2)
      const lado = doMesmoLado.length > 0 ? doMesmoLado : comNumero
      const abaixo = lado.filter((l) => (l.numero ?? 0) < numero)
      const acima = lado.filter((l) => (l.numero ?? 0) > numero)
      if (abaixo.length > 0 && acima.length > 0) {
        const n1 = Math.max(...abaixo.map((l) => l.numero ?? 0))
        const n2 = Math.min(...acima.map((l) => l.numero ?? 0))
        if (n2 - n1 <= LIMITE_INTERPOLACAO) {
          const p1 = centro(abaixo.filter((l) => l.numero === n1))
          const p2 = centro(acima.filter((l) => l.numero === n2))
          const f = (numero - n1) / (n2 - n1)
          return {
            nivel: 'numero_interpolado',
            latitude: p1.latitude + (p2.latitude - p1.latitude) * f,
            longitude: p1.longitude + (p2.longitude - p1.longitude) * f,
            detalhe: `${numero} entre ${n1} e ${n2}`,
            ambiguo: false,
          }
        }
      }
      const proximo = Math.min(...comNumero.map((l) => Math.abs((l.numero ?? 0) - numero)))
      const vizinhas = comNumero.filter((l) => Math.abs((l.numero ?? 0) - numero) === proximo)
      return {
        nivel: 'rua',
        ...centro(vizinhas),
        detalhe: `número ${numero} não existe; o mais próximo está a ${proximo} números`,
        ambiguo: false,
      }
    }
  }
  return {
    nivel: 'rua',
    ...centro(trecho),
    detalhe: `centro de ${trecho.length} endereços`,
    ambiguo: false,
  }
}

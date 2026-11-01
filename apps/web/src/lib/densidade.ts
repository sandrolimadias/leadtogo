// Mapa de densidade (coroplético) do Dashboard: classes, cores e o desenho dos contornos em SVG.
// Funções puras, testadas à parte. Regra visual em docs/design_system.md ("Mapa de densidade").

export type TomDaDensidade = 'azul' | 'vermelho'

/** Uma faixa da legenda: de `de` a `ate` (inclusive), na classe `classe` (1 = a mais clara). */
export interface FaixaDeDensidade {
  classe: number
  de: number
  ate: number
}

/**
 * Até `maximo` classes por quantis dos valores positivos DISTINTOS (zero fica fora: é "sem empresas"), para
 * que as muitas cidades com 1 ou 2 não engulam as faixas. Com poucos valores, as classes se juntam (só 1, 2
 * e 3 → 3 classes). Devolve as faixas em ordem crescente.
 */
export function faixasDeDensidade(valores: number[], maximo = 5): FaixaDeDensidade[] {
  const positivos = [...new Set(valores.filter((v) => v > 0))].sort((a, b) => a - b)
  if (positivos.length === 0) return []
  const ordenados = positivos
  const k = Math.min(maximo, positivos.length)
  const limites: number[] = []
  for (let i = 1; i <= k; i++) {
    const limite = ordenados[Math.ceil((i * ordenados.length) / k) - 1] as number
    if (limites.length === 0 || limite > (limites[limites.length - 1] as number)) {
      limites.push(limite)
    }
  }
  return limites.map((ate, i) => ({
    classe: i + 1,
    de: i === 0 ? (positivos[0] as number) : (limites[i - 1] as number) + 1,
    ate,
  }))
}

/** A classe do valor (0 = sem empresas). */
export function classeDe(valor: number, faixas: FaixaDeDensidade[]): number {
  if (valor <= 0) return 0
  return (faixas.find((f) => valor <= f.ate) ?? faixas[faixas.length - 1])?.classe ?? 0
}

/** Intensidade da cor (%) de cada classe, da mais clara à mais escura, conforme quantas classes há. */
const INTENSIDADES = [22, 40, 58, 78, 100]

/**
 * A cor da classe, sempre derivada dos tokens (`--tag-blue-fg` ou `--tag-red-fg` misturados com
 * `--surface`): acompanha o tema escuro e não inventa hexadecimal. Classe 0: `--surface-sunken`.
 */
export function corDaClasse(classe: number, total: number, tom: TomDaDensidade): string {
  if (classe <= 0 || total <= 0) return 'var(--surface-sunken)'
  const indice = total === 1 ? 4 : Math.round(((classe - 1) * 4) / (total - 1))
  const base = tom === 'azul' ? 'var(--tag-blue-fg)' : 'var(--tag-red-fg)'
  return `color-mix(in oklch, ${base} ${INTENSIDADES[indice] ?? 100}%, var(--surface))`
}

/** Polígonos → anéis → pontos [longitude, latitude] (MultiPolygon do GeoJSON). */
export type Poligonos = [number, number][][][]

export interface DesenhoDoMapa {
  largura: number
  altura: number
  /** O atributo `d` de cada município, pelo código IBGE */
  caminhos: Map<number, string>
}

/**
 * Projeta os contornos num SVG de `largura` fixa: equirretangular com a correção pelo cosseno da latitude
 * média (para um estado, a distorção é desprezível). A altura sai da proporção do próprio estado.
 */
export function desenharMapa(
  municipios: { codigo: number; poligonos: Poligonos }[],
  largura = 1000,
  margem = 8,
): DesenhoDoMapa {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const m of municipios) {
    for (const poligono of m.poligonos) {
      for (const anel of poligono) {
        for (const [x, y] of anel) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
  }
  if (!Number.isFinite(minX)) return { largura, altura: 0, caminhos: new Map() }
  const cosseno = Math.cos((((minY + maxY) / 2) * Math.PI) / 180)
  const spanX = Math.max((maxX - minX) * cosseno, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const escala = (largura - 2 * margem) / spanX
  const altura = Math.round(spanY * escala + 2 * margem)
  const px = (x: number) => ((x - minX) * cosseno * escala + margem).toFixed(1)
  const py = (y: number) => ((maxY - y) * escala + margem).toFixed(1)
  const caminhos = new Map<number, string>()
  for (const m of municipios) {
    const partes: string[] = []
    for (const poligono of m.poligonos) {
      for (const anel of poligono) {
        partes.push(`M${anel.map(([x, y]) => `${px(x)},${py(y)}`).join('L')}Z`)
      }
    }
    caminhos.set(m.codigo, partes.join(''))
  }
  return { largura, altura, caminhos }
}

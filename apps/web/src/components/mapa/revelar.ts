/** Um retângulo em pixels (coordenadas do contêiner do mapa). */
export interface Retangulo {
  esquerda: number
  topo: number
  direita: number
  base: number
}

/** A caixa que o pin ocupa na tela: a gota tem 30 px de altura e a ponta fica na coordenada. */
const CAIXA_DO_PIN = { esquerda: -20, direita: 20, acima: 40, abaixo: 6 }
const FOLGA = 14
const MARGEM_DO_MAPA = 8

const cruza = (a: Retangulo, b: Retangulo) =>
  a.esquerda < b.direita && a.direita > b.esquerda && a.topo < b.base && a.base > b.topo

/**
 * Quanto o mapa precisa deslizar (em pixels, o quanto o PIN anda na tela) para o pin não ficar atrás dos
 * `bloqueios` (os painéis). É o MENOR deslocamento numa das quatro direções que deixa o pin livre, dentro do mapa e
 * fora de todos os bloqueios; `{ dx: 0, dy: 0 }` se já está visível, se está fora do mapa (não centraliza nada) ou
 * se nenhum deslocamento resolve.
 */
export function deslocamentoMinimo(
  pino: { x: number; y: number },
  mapa: { largura: number; altura: number },
  bloqueios: Retangulo[],
): { dx: number; dy: number } {
  const nulo = { dx: 0, dy: 0 }
  const caixa = (dx: number, dy: number): Retangulo => ({
    esquerda: pino.x + CAIXA_DO_PIN.esquerda + dx,
    direita: pino.x + CAIXA_DO_PIN.direita + dx,
    topo: pino.y - CAIXA_DO_PIN.acima + dy,
    base: pino.y + CAIXA_DO_PIN.abaixo + dy,
  })
  const dentro = (c: Retangulo) =>
    c.esquerda >= MARGEM_DO_MAPA &&
    c.topo >= MARGEM_DO_MAPA &&
    c.direita <= mapa.largura - MARGEM_DO_MAPA &&
    c.base <= mapa.altura - MARGEM_DO_MAPA
  const atual = caixa(0, 0)
  // fora do mapa: a aproximação e o deslocamento são sempre manuais
  if (
    atual.direita < 0 ||
    atual.base < 0 ||
    atual.esquerda > mapa.largura ||
    atual.topo > mapa.altura
  ) {
    return nulo
  }
  const cobrindo = bloqueios.filter((b) => cruza(atual, b))
  if (cobrindo.length === 0) return nulo
  const candidatos: { dx: number; dy: number }[] = []
  for (const b of cobrindo) {
    candidatos.push(
      { dx: b.direita + FOLGA - atual.esquerda, dy: 0 },
      { dx: b.esquerda - FOLGA - atual.direita, dy: 0 },
      { dx: 0, dy: b.base + FOLGA - atual.topo },
      { dx: 0, dy: b.topo - FOLGA - atual.base },
    )
  }
  const livres = candidatos
    .filter((c) => {
      const nova = caixa(c.dx, c.dy)
      return dentro(nova) && !bloqueios.some((b) => cruza(nova, b))
    })
    .sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)))
  return livres[0] ?? nulo
}

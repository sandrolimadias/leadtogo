/**
 * O pin do mapa como elemento HTML (SVG): gota com a cor do estado e, quando a empresa já foi visitada,
 * um visto. O estado nunca depende só da cor (visto, contorno e rótulo acessível).
 */
export interface OpcoesDoPin {
  cor: string
  visitada?: boolean
  /** O pin do cursor/painel: maior e com contorno forte */
  selecionado?: boolean
  rotulo: string
  /** O pin arrastável da tela "Ajustar posição" */
  arrastavel?: boolean
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Zera o visual padrão do <button> SEM `all:unset`. O elemento do pin é o próprio elemento do Marker do MapLibre,
 * e o CSS do MapLibre põe `position:absolute` na classe `.maplibregl-marker`: `all:unset` no estilo inline
 * (mais forte que a classe) devolvia `position:static`, os pins se empilhavam em fila (30 px cada um) e só o
 * primeiro caía no lugar. Nada aqui pode mexer em `position`, `top`, `left` nem `transform`.
 */
export const ZERAR_BOTAO =
  'appearance:none;margin:0;padding:0;border:0;background:none;font:inherit;color:inherit;'

export function criarPin(o: OpcoesDoPin): HTMLButtonElement {
  const botao = document.createElement('button')
  botao.type = 'button'
  botao.setAttribute('aria-label', o.rotulo)
  botao.title = o.rotulo
  const tamanho = o.selecionado || o.arrastavel ? 40 : 30
  botao.style.cssText = `${ZERAR_BOTAO}cursor:${o.arrastavel ? 'grab' : 'pointer'};display:block;width:${tamanho}px;height:${tamanho}px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));`
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 30 30')
  svg.setAttribute('width', String(tamanho))
  svg.setAttribute('height', String(tamanho))
  svg.setAttribute('aria-hidden', 'true')
  const gota = document.createElementNS(SVG_NS, 'path')
  gota.setAttribute('d', 'M15 28C15 28 4 17.5 4 11a11 11 0 0 1 22 0c0 6.5-11 17-11 17z')
  gota.setAttribute('fill', o.cor)
  gota.setAttribute('stroke', o.selecionado || o.arrastavel ? 'var(--ink)' : '#ffffff')
  gota.setAttribute('stroke-width', o.selecionado || o.arrastavel ? '2' : '1.5')
  svg.appendChild(gota)
  if (o.visitada) {
    const visto = document.createElementNS(SVG_NS, 'path')
    visto.setAttribute('d', 'M10 11.5l3.2 3.2L20 8')
    visto.setAttribute('fill', 'none')
    visto.setAttribute('stroke', '#ffffff')
    visto.setAttribute('stroke-width', '2.4')
    visto.setAttribute('stroke-linecap', 'round')
    visto.setAttribute('stroke-linejoin', 'round')
    svg.appendChild(visto)
  } else {
    const miolo = document.createElementNS(SVG_NS, 'circle')
    miolo.setAttribute('cx', '15')
    miolo.setAttribute('cy', '11')
    miolo.setAttribute('r', '3.6')
    miolo.setAttribute('fill', '#ffffff')
    svg.appendChild(miolo)
  }
  botao.appendChild(svg)
  return botao
}

/** Polígono aproximado de um círculo (metros) em volta de um ponto, para o raio de incerteza. */
export function circulo(
  latitude: number,
  longitude: number,
  raioM: number,
  passos = 48,
): {
  type: 'Feature'
  properties: Record<string, never>
  geometry: { type: 'Polygon'; coordinates: [number, number][][] }
} {
  const R = 6_371_000
  const lat = (latitude * Math.PI) / 180
  const pontos: [number, number][] = []
  for (let i = 0; i <= passos; i++) {
    const ang = (i / passos) * 2 * Math.PI
    const dLat = (raioM / R) * Math.cos(ang)
    const dLon = (raioM / (R * Math.cos(lat))) * Math.sin(ang)
    pontos.push([longitude + (dLon * 180) / Math.PI, latitude + (dLat * 180) / Math.PI])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pontos] } }
}

/**
 * O ícone do pin do mapa desenhado num <canvas> (a mesma gota com o visto da versão em SVG) para a camada de
 * símbolos do MapLibre: milhares de pins saem da GPU, sem um elemento DOM por empresa. O nome da imagem carrega
 * tudo o que a define (`pin|cor|visto|selecionado`), então o mapa pede cada variação uma vez (`styleimagemissing`).
 */
export interface OpcoesDoIcone {
  cor: string
  visitada: boolean
  selecionado: boolean
}

const PREFIXO = 'pin'

export const idDoIcone = (o: OpcoesDoIcone): string =>
  `${PREFIXO}|${o.cor}|${o.visitada ? 1 : 0}|${o.selecionado ? 1 : 0}`

export function lerIdDoIcone(id: string): OpcoesDoIcone | null {
  const [prefixo, cor, visto, sel] = id.split('|')
  if (prefixo !== PREFIXO || !cor) return null
  return { cor, visitada: visto === '1', selecionado: sel === '1' }
}

const GOTA = 'M15 28C15 28 4 17.5 4 11a11 11 0 0 1 22 0c0 6.5-11 17-11 17z'
const VISTO = 'M10 11.5l3.2 3.2L20 8'

/** A imagem em 2x (tela de alta densidade): 30 px normal, 40 px o pin selecionado. */
export function desenharPin(o: OpcoesDoIcone, corDoContorno: string): ImageData {
  const lado = o.selecionado ? 40 : 30
  const escala = 2
  const canvas = document.createElement('canvas')
  canvas.width = lado * escala
  canvas.height = lado * escala
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d indisponível')
  ctx.scale((lado * escala) / 30, (lado * escala) / 30)
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 3
  ctx.shadowOffsetY = 1
  const gota = new Path2D(GOTA)
  ctx.fillStyle = o.cor
  ctx.fill(gota)
  ctx.shadowColor = 'transparent'
  ctx.strokeStyle = o.selecionado ? corDoContorno : '#ffffff'
  ctx.lineWidth = o.selecionado ? 2 : 1.5
  ctx.stroke(gota)
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  if (o.visitada) {
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke(new Path2D(VISTO))
  } else {
    ctx.beginPath()
    ctx.arc(15, 11, 3.6, 0, Math.PI * 2)
    ctx.fill()
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

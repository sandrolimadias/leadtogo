import { idDoIcone } from './icone'
import type { BolhaDoMapa, PinDoMapa } from './mapa-base'

type Cor = (cor: string) => string

/** A cor vem como token do design system (`--tag-green-fg`) ou como cor CSS; o MapLibre só entende a segunda. */
const resolver = (cor: string, daToken: Cor): string => (cor.startsWith('--') ? daToken(cor) : cor)

/** Os pins das empresas como GeoJSON para a fonte do mapa (a fonte agrupa em bolhas; o ícone sai de `icone`). */
export function geojsonDosPins(pins: PinDoMapa[], daToken: Cor) {
  return {
    type: 'FeatureCollection' as const,
    features: pins.map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
      properties: {
        id: p.id,
        icone: idDoIcone({
          cor: resolver(p.cor, daToken),
          visitada: p.visitada ?? false,
          selecionado: p.selecionado ?? false,
        }),
        // o pin selecionado desenha por cima dos outros
        z: p.selecionado ? 1 : 0,
      },
    })),
  }
}

/** O raio (px) da bolha pelo total de empresas: quanto mais empresas, maior. */
export function raioDaBolha(total: number): number {
  if (total >= 1000) return 30
  if (total >= 100) return 25
  if (total >= 10) return 20
  return 16
}

/** O texto da bolha: o total, abreviado a partir de mil ("1,2 mil"). */
export function textoDaBolha(total: number): string {
  if (total < 1000) return String(total)
  const mil = Math.round(total / 100) / 10
  return `${String(mil).replace('.', ',')} mil`
}

/** As bolhas (de município, de bairro e da cobertura) como GeoJSON: o texto, o raio e a cor já resolvidos. */
export function geojsonDasBolhas(bolhas: BolhaDoMapa[], daToken: Cor) {
  return {
    type: 'FeatureCollection' as const,
    features: bolhas.map((b) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [b.longitude, b.latitude] },
      properties: {
        id: b.id,
        texto: b.texto ?? textoDaBolha(b.total),
        raio: raioDaBolha(b.total),
        cor: resolver(b.cor, daToken),
        rotulo: b.rotulo ?? '',
      },
    })),
  }
}

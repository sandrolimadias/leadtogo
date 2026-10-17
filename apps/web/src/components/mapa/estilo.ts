import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

/** A URL do mapa base (PMTiles do estado, servido pela API com `Range`, atrás da sessão). */
export const URL_DO_MAPA_BASE = '/v1/mapa/base.pmtiles'

/**
 * Estilo do mapa: a base da Protomaps (ruas, bairros, água, rótulos em português) sobre o PMTiles do
 * estado. Os glifos dos rótulos ficam no nosso próprio servidor (`public/mapa/fontes`): o mapa não
 * depende de nenhum serviço externo. Sem sprite (sem ícones de pontos de interesse).
 */
export function estiloDoMapa(tema: 'claro' | 'escuro'): StyleSpecification {
  const flavor = namedFlavor(tema === 'escuro' ? 'dark' : 'light')
  return {
    version: 8,
    glyphs: '/mapa/fontes/{fontstack}/{range}.pbf',
    sources: {
      base: {
        type: 'vector',
        url: `pmtiles://${URL_DO_MAPA_BASE}`,
        attribution:
          '© <a href="https://openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      },
    },
    layers: layers('base', flavor, { lang: 'pt' }).filter(
      (l) => l.type !== 'symbol' || !('icon-image' in (l.layout ?? {})),
    ),
  }
}

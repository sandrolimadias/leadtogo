import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

/**
 * O mapa base transitório: o PMTiles do estado servido pela API com `Range`, atrás da sessão. O normal é a
 * URL pública do bucket do mapa (`GET /v1/mapa/base`, variável `MAPA_BASE_URL` da API), sem passar pela API.
 */
export const URL_DO_MAPA_BASE = '/v1/mapa/base.pmtiles'

let urlEmCache: Promise<string> | null = null

/** De onde ler o mapa base agora (a API diz; sem resposta, o caminho transitório da própria API). */
export function urlDoMapaBase(): Promise<string> {
  urlEmCache ??= fetch('/v1/mapa/base', { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<{ url?: unknown }>) : null))
    .then((d) => (typeof d?.url === 'string' && d.url.length > 0 ? d.url : URL_DO_MAPA_BASE))
    .catch(() => URL_DO_MAPA_BASE)
  return urlEmCache
}

/**
 * Estilo do mapa: a base da Protomaps (ruas, bairros, água, rótulos em português) sobre o PMTiles do
 * estado. Os glifos dos rótulos ficam no nosso próprio servidor (`public/mapa/fontes`): o mapa não
 * depende de nenhum serviço externo. Sem sprite (sem ícones de pontos de interesse).
 */
export function estiloDoMapa(
  tema: 'claro' | 'escuro',
  urlDaBase: string = URL_DO_MAPA_BASE,
): StyleSpecification {
  const flavor = namedFlavor(tema === 'escuro' ? 'dark' : 'light')
  return {
    version: 8,
    glyphs: '/mapa/fontes/{fontstack}/{range}.pbf',
    sources: {
      base: {
        type: 'vector',
        url: `pmtiles://${urlDaBase}`,
        attribution:
          '© <a href="https://openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      },
    },
    layers: layers('base', flavor, { lang: 'pt' }).filter(
      (l) => l.type !== 'symbol' || !('icon-image' in (l.layout ?? {})),
    ),
  }
}

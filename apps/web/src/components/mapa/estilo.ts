import { layers, namedFlavor } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'

let urlEmCache: Promise<string | null> | null = null

/**
 * De onde ler o mapa base: a URL pública do PMTiles versionado (bucket do mapa, `GET /v1/mapa/base`, variável
 * `MAPA_BASE_URL` da API). Nulo = sem mapa base (só em desenvolvimento, ou se a API não respondeu): o mapa abre
 * com o fundo liso e os pins continuam valendo.
 */
export function urlDoMapaBase(): Promise<string | null> {
  urlEmCache ??= fetch('/v1/mapa/base', { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<{ url?: unknown }>) : null))
    .then((d) => (typeof d?.url === 'string' && d.url.length > 0 ? d.url : null))
    .catch(() => null)
  return urlEmCache
}

/**
 * Estilo do mapa: a base da Protomaps (ruas, bairros, água, rótulos em português) sobre o PMTiles do
 * estado. Os glifos dos rótulos ficam no nosso próprio servidor (`public/mapa/fontes`): o mapa não
 * depende de nenhum serviço externo. Sem sprite (sem ícones de pontos de interesse).
 */
export function estiloDoMapa(tema: 'claro' | 'escuro', urlDaBase: string): StyleSpecification {
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

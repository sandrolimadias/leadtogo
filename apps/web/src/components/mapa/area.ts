import type { Map as MapaDoMapLibre } from 'maplibre-gl'

import type { AreaVisivel } from './mapa-base'

const LATITUDE_MAXIMA = 85.0511

/**
 * A área visível pronta para a API: a latitude e a longitude presas aos limites do mundo. Afastado o bastante, o
 * MapLibre devolve longitudes como -258 e 380 (o mapa se repete na horizontal) e a API respondia 400, deixando
 * os pins parados na tela anterior.
 */
export function areaVisivel(mapa: Pick<MapaDoMapLibre, 'getBounds' | 'getZoom'>): AreaVisivel {
  const b = mapa.getBounds()
  return limitarArea({
    oeste: b.getWest(),
    sul: b.getSouth(),
    leste: b.getEast(),
    norte: b.getNorth(),
    zoom: mapa.getZoom(),
  })
}

export function limitarArea(a: AreaVisivel): AreaVisivel {
  const lon = (v: number) => Math.min(180, Math.max(-180, v))
  const lat = (v: number) => Math.min(LATITUDE_MAXIMA, Math.max(-LATITUDE_MAXIMA, v))
  return {
    oeste: lon(a.oeste),
    sul: lat(a.sul),
    leste: lon(a.leste),
    norte: lat(a.norte),
    zoom: Math.min(24, Math.max(0, a.zoom)),
  }
}

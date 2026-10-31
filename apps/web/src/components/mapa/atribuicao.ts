// A linha de créditos do canto inferior direito do mapa (controle de atribuição do MapLibre).

/** O crédito que o MapLibre põe por padrão; passar `customAttribution` substitui, então ele vai junto. */
export const CREDITO_DO_MAPLIBRE = '<a href="https://maplibre.org/" target="_blank">MapLibre</a>'

const escapar = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * O crédito próprio do mapa, com a fonte dos dados dos pins (ex.: "Fonte: IBGE – CNEFE 2022") no fim. O MapLibre
 * junta os créditos com " | " em ordem de TAMANHO do texto (o mais curto primeiro): em uma entrada só, mais curta
 * que a do mapa base, a fonte fica logo antes do "© OpenStreetMap contributors" (o teste confere os tamanhos).
 */
export function atribuicaoDoMapa(fonteDosDados?: string): string {
  return fonteDosDados ? `${CREDITO_DO_MAPLIBRE} | ${escapar(fonteDosDados)}` : CREDITO_DO_MAPLIBRE
}

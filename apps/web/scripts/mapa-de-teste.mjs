// O bucket público do mapa (https://mapa.crm.aledias.com.br/...) não existe no teste local das imagens: o
// Playwright atende esse domínio com o arquivo de teste (docker/fixtures/mapa-teste.pmtiles), com o que o Garage
// faz de verdade: Range (206 com Content-Range), CORS só para o app, Cache-Control imutável. A requisição sai do
// navegador normalmente, então a CSP (`connect-src https://mapa.crm.aledias.com.br`) continua sendo testada.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const URL_DO_MAPA_DE_TESTE = 'https://mapa.crm.aledias.com.br/teste.pmtiles'

const arquivo = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../docker/fixtures/mapa-teste.pmtiles'),
)

export async function servirMapaDeTeste(contexto, origemDoApp) {
  const cors = {
    'access-control-allow-origin': origemDoApp,
    'access-control-allow-methods': 'GET, HEAD',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': 'Content-Range, Content-Length, ETag, Accept-Ranges',
  }
  await contexto.route('https://mapa.crm.aledias.com.br/**', async (rota) => {
    const pedido = rota.request()
    if (pedido.method() === 'OPTIONS') return rota.fulfill({ status: 204, headers: cors })
    const faixa = /^bytes=(\d+)-(\d*)$/.exec(pedido.headers()['range'] ?? '')
    const cabecalhos = {
      ...cors,
      'accept-ranges': 'bytes',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': 'application/octet-stream',
    }
    if (!faixa) return rota.fulfill({ status: 200, headers: cabecalhos, body: arquivo })
    const de = Number(faixa[1])
    const ate = Math.min(faixa[2] ? Number(faixa[2]) : arquivo.length - 1, arquivo.length - 1)
    return rota.fulfill({
      status: 206,
      headers: { ...cabecalhos, 'content-range': `bytes ${de}-${ate}/${arquivo.length}` },
      body: arquivo.subarray(de, ate + 1),
    })
  })
}

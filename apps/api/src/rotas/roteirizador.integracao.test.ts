import { describe, expect, it } from 'vitest'

import { RoteirizadorVroomOsrm } from './roteirizador.js'

// Contra a pilha REAL (OSRM + VROOM do ES), só quando as URLs de teste existem: no CI não há a pilha.
// Local: suba scripts/geo/rotas-compose.yml com as portas publicadas (docs/roteiro_rotas_producao.md) e rode
//   ROTAS_TESTE_VROOM_URL=http://localhost:13000 ROTAS_TESTE_OSRM_URL=http://localhost:15000 \
//     pnpm --filter @leadtogo/api exec vitest run src/rotas/roteirizador.integracao.test.ts
const vroom = process.env['ROTAS_TESTE_VROOM_URL']
const osrm = process.env['ROTAS_TESTE_OSRM_URL']

// Endereços comerciais reais do CNEFE 2022 (só coordenadas), os mesmos do scripts/geo/medir-vroom.mjs
const PARADAS = [
  [-40.26991, -20.1946],
  [-40.39553, -20.35099],
  [-40.31041, -20.35515],
  [-40.25085, -20.17376],
  [-40.36909, -20.30904],
  [-40.3425, -20.43312],
  [-40.28205, -20.13],
  [-40.37186, -20.38954],
  [-40.26296, -20.21404],
  [-40.35348, -20.37079],
].map(([longitude, latitude]) => ({ latitude: latitude as number, longitude: longitude as number }))
const SERRA = { latitude: -20.16, longitude: -40.26 }

describe.skipIf(!vroom || !osrm)('roteirizador contra o OSRM e o VROOM de verdade', () => {
  const r = new RoteirizadorVroomOsrm(vroom ?? '', osrm ?? '', 10_000)

  it('ordena as 10 paradas (todas, uma vez) e a ordem é mais curta que a original', async () => {
    const ordem = await r.ordenar(SERRA, PARADAS, SERRA)
    expect([...ordem].sort((a, b) => a - b)).toEqual(PARADAS.map((_, i) => i))
    const total = async (pontos: typeof PARADAS) =>
      (await r.trajeto([SERRA, ...pontos, SERRA])).trechos.reduce((s, t) => s + t.distanciaM, 0)
    const otimizada = await total(ordem.map((i) => PARADAS[i] as (typeof PARADAS)[number]))
    expect(otimizada).toBeLessThan(await total(PARADAS))
  })

  it('o trajeto tem um trecho por par de pontos e o desenho pelas ruas', async () => {
    const t = await r.trajeto([SERRA, ...PARADAS.slice(0, 3)])
    expect(t.trechos).toHaveLength(3)
    for (const x of t.trechos) expect(x.distanciaM).toBeGreaterThan(0)
    expect(t.linha.length).toBeGreaterThan(4)
  })
})

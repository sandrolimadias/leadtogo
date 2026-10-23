#!/usr/bin/env node
// Mede o OSRM e o VROOM com 10, 20 e 30 paradas (o limite de uma rota no G4; docs/plano_geolocalizacao.md,
// seção 10.0). Sem dependências (Node 18+), para rodar onde os serviços estão: no terminal do container
// do VROOM, na VPS (ele tem Node 20 e enxerga o OSRM pela rede interna).
//
//   VROOM_URL=http://localhost:3000 OSRM_URL=http://<osrm>:5000 node medir-vroom.mjs
//
// As paradas são 60 endereços comerciais reais do CNEFE 2022 (espécie "outras finalidades", coordenada
// original do Censo): 40 na Grande Vitória e 20 no interior (Linhares, Colatina, Cachoeiro, Aracruz,
// Guarapari e São Mateus). Só coordenadas, sem endereço nem nome.
// Sai com código 1 se alguma otimização de 30 paradas passar do limite (padrão 10 s, LIMITE_S).

const VROOM_URL = (process.env.VROOM_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const OSRM_URL = process.env.OSRM_URL?.replace(/\/$/, '')
const LIMITE_S = Number(process.env.LIMITE_S ?? 10)
const REPETICOES = 3

// prettier-ignore
const GRANDE_VITORIA = [[-40.26991,-20.1946],[-40.19932,-20.05286],[-40.39553,-20.35099],[-40.36561,-20.51427],[-40.31041,-20.35515],[-40.25085,-20.17376],[-40.36909,-20.30904],[-40.39218,-20.32548],[-40.38986,-20.34202],[-40.3425,-20.43312],[-40.33878,-20.44704],[-40.28205,-20.13],[-40.37186,-20.38954],[-40.26296,-20.21404],[-40.35348,-20.37079],[-40.33259,-20.34464],[-40.42521,-20.34413],[-40.25907,-20.19618],[-40.27335,-20.22212],[-40.40714,-20.27734],[-40.2407,-20.21156],[-40.28981,-20.23565],[-40.39438,-20.34179],[-40.29026,-20.29612],[-40.24829,-20.21741],[-40.18597,-20.14925],[-40.32396,-20.11088],[-40.26821,-20.24432],[-40.2717,-20.2303],[-40.29156,-20.13386],[-40.29485,-20.25843],[-40.44779,-20.35913],[-40.39894,-20.27751],[-40.26376,-20.25963],[-40.21978,-20.17444],[-40.34709,-20.32021],[-40.31708,-20.34464],[-40.28605,-20.336],[-40.26769,-20.15703],[-40.24849,-20.2051]]
// prettier-ignore
const INTERIOR = [[-41.15824,-20.83816],[-40.51754,-20.64314],[-40.63042,-19.53606],[-41.10536,-20.85704],[-40.06563,-19.397],[-40.64158,-19.51482],[-40.27388,-19.81919],[-40.70499,-19.52238],[-40.05503,-19.38509],[-39.75506,-18.71495],[-40.61697,-19.51251],[-39.87214,-18.72457],[-40.07621,-19.41644],[-41.11846,-20.83783],[-40.51414,-20.68194],[-40.50199,-20.66273],[-40.06907,-19.38559],[-40.62847,-19.53377],[-40.50033,-20.66416],[-40.47798,-20.6513]]

const PARTIDA = [-40.26, -20.16] // Serra (centro), como a sede de um cliente

const CENARIOS = {
  'Grande Vitória': (n) => GRANDE_VITORIA.slice(0, n),
  'Misto (2/3 GV, 1/3 interior)': (n) => [
    ...GRANDE_VITORIA.slice(0, n - Math.floor(n / 3)),
    ...INTERIOR.slice(0, Math.floor(n / 3)),
  ],
}

async function cronometrar(fazer) {
  const inicio = performance.now()
  const resultado = await fazer()
  return { ms: performance.now() - inicio, resultado }
}

async function postarJson(url, corpo) {
  const resposta = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(120_000),
  })
  const texto = await resposta.text()
  if (!resposta.ok) throw new Error(`${url} respondeu ${resposta.status}: ${texto.slice(0, 300)}`)
  return JSON.parse(texto)
}

function otimizar(paradas) {
  return postarJson(`${VROOM_URL}/`, {
    vehicles: [{ id: 1, profile: 'car', start: PARTIDA, end: PARTIDA }],
    jobs: paradas.map((location, i) => ({ id: i + 1, location, service: 40 * 60 })),
    options: { g: true }, // com o trajeto: é como a API vai pedir (distância e desenho numa chamada só)
  })
}

async function osrm(servico, paradas, extra = '') {
  const coordenadas = [PARTIDA, ...paradas].map(([lon, lat]) => `${lon},${lat}`).join(';')
  const resposta = await fetch(`${OSRM_URL}/${servico}/v1/driving/${coordenadas}${extra}`, {
    signal: AbortSignal.timeout(60_000),
  })
  const json = await resposta.json()
  if (json.code !== 'Ok') throw new Error(`OSRM ${servico}: ${json.code} ${json.message ?? ''}`)
  return json
}

const mediana = (valores) => [...valores].sort((a, b) => a - b)[Math.floor(valores.length / 2)]
const s = (ms) => `${(ms / 1000).toFixed(2)} s`

let estourou = false
console.log(`VROOM ${VROOM_URL}${OSRM_URL ? ` · OSRM ${OSRM_URL}` : ''} · ${REPETICOES} repetições`)
for (const [nome, escolher] of Object.entries(CENARIOS)) {
  console.log(`\n${nome}`)
  for (const n of [10, 20, 30]) {
    const paradas = escolher(n)
    const tempos = []
    let resumo
    for (let i = 0; i < REPETICOES; i++) {
      const { ms, resultado } = await cronometrar(() => otimizar(paradas))
      tempos.push(ms)
      resumo = resultado.summary
    }
    const pior = Math.max(...tempos)
    if (n === 30 && pior > LIMITE_S * 1000) estourou = true
    const nao = resumo.unassigned ?? 0
    console.log(
      `  ${String(n).padStart(2)} paradas: VROOM mediana ${s(mediana(tempos))}, pior ${s(pior)}` +
        ` · ${(resumo.distance / 1000).toFixed(1)} km, ${Math.round(resumo.duration / 60)} min dirigindo` +
        (nao ? ` · ${nao} parada(s) sem rota!` : ''),
    )
    if (OSRM_URL && n === 30) {
      const tabela = await cronometrar(() => osrm('table', paradas))
      const trajeto = await cronometrar(() => osrm('route', paradas, '?overview=simplified'))
      console.log(
        `     OSRM: matriz ${paradas.length + 1}×${paradas.length + 1} ${s(tabela.ms)}, trajeto ${s(trajeto.ms)}`,
      )
    }
  }
}
console.log(
  estourou
    ? `\nATENÇÃO: 30 paradas passaram de ${LIMITE_S} s: a otimização vai para o worker (plano, seção 10.0).`
    : `\nOK: 30 paradas abaixo de ${LIMITE_S} s; a otimização responde na requisição.`,
)
process.exit(estourou ? 1 : 0)

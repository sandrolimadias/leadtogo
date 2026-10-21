/* global document, window, requestAnimationFrame */
// Teste de CARGA do mapa contra as IMAGENS de produção (chamado por `docker/imagens-testar.sh --carga`):
// 6.000 empresas fictícias geocodificadas perto do arquivo de mapa de teste, uma pessoa arrastando e dando zoom
// sem parar por 2 minutos num Chromium real, e a API observada o tempo todo: memória, sockets TCP, conexões do
// banco e a ocupação do pool (/health/alertas). Critério de pronto: nenhum erro, API estável (números planos)
// e p95 do GET /v1/mapa/pontos abaixo de 300 ms.
// Variáveis: BORDA_URL, API_URL, BANCO, API_CONTAINER, PG_CONTAINER, ALERTAS_TOKEN, CARGA_SEGUNDOS (120),
// CARGA_EMPRESAS (6000), CARGA_ROTULO (antes|depois), CARGA_SAIDA (arquivo JSON do resultado).
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import { chromium } from 'playwright'

const borda = process.env.BORDA_URL ?? 'http://localhost:8080'
const apiDireta = process.env.API_URL ?? 'http://localhost:3300'
const banco = process.env.BANCO ?? ''
const apiContainer = process.env.API_CONTAINER ?? ''
const pgContainer = process.env.PG_CONTAINER ?? ''
const tokenAlertas = process.env.ALERTAS_TOKEN ?? ''
const segundos = Number(process.env.CARGA_SEGUNDOS ?? 120)
const empresas = Number(process.env.CARGA_EMPRESAS ?? 6000)
const rotulo = process.env.CARGA_ROTULO ?? 'medicao'
const saida = process.env.CARGA_SAIDA ?? ''
const origem = new URL(borda).origin
const cabecalhos = { Origin: origem }

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()
const psql = (sql) =>
  sh('docker', [
    'exec',
    '-e',
    'PGUSER=postgres',
    pgContainer,
    'psql',
    '-X',
    '-At',
    '-d',
    banco,
    '-c',
    sql,
  ])

function codigoTotp(chave) {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of chave.replace(/=+$/, '').toUpperCase())
    bits += alfabeto.indexOf(c).toString(2).padStart(5, '0')
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  const contador = Buffer.alloc(8)
  contador.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const h = createHmac('sha1', Buffer.from(bytes)).update(contador).digest()
  const o = h[h.length - 1] & 0xf
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1_000_000).padStart(6, '0')
}

const percentil = (v, p) => {
  if (v.length === 0) return null
  const o = [...v].sort((a, b) => a - b)
  return Math.round(o[Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1)])
}

// --- conta, empresa e 2FA (o mesmo caminho do testar-imagens.mjs, só pela API)
const email = `carga-${Date.now().toString(36)}@exemplo.com.br`
const senha = 'senha-forte-carga-1'
const navegador = await chromium.launch()
const contexto = await navegador.newContext({
  locale: 'pt-BR',
  viewport: { width: 1366, height: 768 },
})
{
  const page0 = await contexto.newPage()
  await page0.goto(`${borda}/primeiro-acesso`)
  await page0.getByText('Passo 1 de 3 · Conta').waitFor()
  await page0.getByLabel('Seu nome').fill('Carga Teste')
  await page0.getByLabel('E-mail do trabalho').fill(email)
  await page0.getByLabel('Senha', { exact: true }).fill(senha)
  await page0.getByLabel(/Li e aceito os termos/).check()
  await page0.getByRole('button', { name: 'Continuar' }).click()
  await page0.getByLabel(/Razão social/).fill(`Empresa Carga ${Date.now()} Ltda`)
  await page0.getByRole('button', { name: 'Criar empresa' }).click()
  await page0.getByRole('heading', { name: 'Tudo pronto' }).waitFor()
  await page0.getByRole('button', { name: 'Continuar' }).click()
  await page0.getByRole('heading', { name: 'Ative a verificação em duas etapas' }).waitFor()
  await page0.close()
}
const ativar = await contexto.request.post(`${borda}/v1/auth/two-factor/enable`, {
  data: { password: senha },
  headers: cabecalhos,
})
const chave = new URL((await ativar.json()).totpURI).searchParams.get('secret') ?? ''
const resto = Date.now() % 30_000
if (resto > 24_000) await new Promise((r) => setTimeout(r, 30_000 - resto + 500))
const verificar = await contexto.request.post(`${borda}/v1/auth/two-factor/verify-totp`, {
  data: { code: codigoTotp(chave) },
  headers: cabecalhos,
})
if (!verificar.ok()) throw new Error(`2FA não ativou (${verificar.status()})`)
const me = await (await contexto.request.get(`${borda}/v1/me`)).json()
await contexto.request.post(`${borda}/v1/sessao/empresa-ativa`, {
  data: { empresaId: me.empresas[0]?.id },
  headers: cabecalhos,
})

// --- 6.000 empresas fictícias com coordenada (SQL como superusuário: ignora o RLS), em 8 "cidades" + espalhadas
const tenantId = psql('SELECT id FROM tenants ORDER BY criado_em DESC LIMIT 1')
const membroId = psql(`SELECT id FROM membros WHERE tenant_id = '${tenantId}' LIMIT 1`)
const tag = (chave) =>
  psql(`SELECT id FROM tags WHERE tenant_id = '${tenantId}' AND chave_sistema = '${chave}'`)
const cliente = tag('cliente')
const prospect = tag('prospect')
psql(`
INSERT INTO empresas (id, tenant_id, razao_social, nome_fantasia, vendedor_id, localizacao, geo_precisao, geo_origem, ultima_visita_em)
SELECT gen_random_uuid(), '${tenantId}', 'Carga ' || n || ' Ltda', 'Carga ' || n, '${membroId}',
       ST_SetSRID(ST_MakePoint(
         -52 + ((n % 8) - 4) * 0.08 + (random() + random() + random() - 1.5) * 0.06,
         -14 + ((n % 8) / 4 - 1) * 0.08 + (random() + random() + random() - 1.5) * 0.06), 4326)::geography,
       'exata'::geo_precisao, 'cnefe'::geo_origem,
       CASE WHEN n % 3 = 0 THEN now() - make_interval(days => (n * 7) % 200) ELSE NULL END
FROM generate_series(1, ${empresas}) n;
INSERT INTO empresa_tags (tenant_id, empresa_id, tag_id)
SELECT '${tenantId}', e.id, CASE WHEN random() < 0.6 THEN '${cliente}'::uuid ELSE '${prospect}'::uuid END
FROM empresas e WHERE e.tenant_id = '${tenantId}' AND e.razao_social LIKE 'Carga %';
ANALYZE empresas; ANALYZE empresa_tags;`)
console.log(
  `dados: ${psql(`SELECT count(*) FROM empresas WHERE tenant_id = '${tenantId}'`)} empresas com coordenada (tenant ${tenantId.slice(0, 8)})`,
)

// --- observação da API (memória, sockets, banco, pool)
function amostra(t) {
  const mem =
    Number(sh('docker', ['exec', apiContainer, 'cat', '/sys/fs/cgroup/memory.current'])) / 1048576
  const tcp = sh('docker', ['exec', apiContainer, 'sh', '-c', 'cat /proc/net/tcp /proc/net/tcp6'])
  const estados = {}
  for (const l of tcp.split('\n')) {
    const c = l.trim().split(/\s+/)
    if (c.length < 4 || c[0] === 'sl') continue
    estados[c[3]] = (estados[c[3]] ?? 0) + 1
  }
  const fds = Number(
    sh('docker', [
      'exec',
      apiContainer,
      'sh',
      '-c',
      'ls /proc/*/fd 2>/dev/null | grep -c "^[0-9]"',
    ]),
  )
  const pg = psql(
    `SELECT coalesce(string_agg(state || '=' || n, ' '), '') FROM (SELECT coalesce(state,'?') AS state, count(*) AS n FROM pg_stat_activity WHERE datname = '${banco}' AND usename = 'leadtogo_app' GROUP BY 1) x`,
  )
  const pgTotal = Number(
    psql(
      `SELECT count(*) FROM pg_stat_activity WHERE datname = '${banco}' AND usename = 'leadtogo_app'`,
    ),
  )
  return {
    t,
    memMiB: Math.round(mem),
    tcpEstab: estados['01'] ?? 0,
    tcpCloseWait: estados['08'] ?? 0,
    tcpTotal: Object.values(estados).reduce((a, b) => a + b, 0),
    fds,
    pgTotal,
    pg,
  }
}
async function poolPct() {
  if (!tokenAlertas) return null
  const r = await fetch(`${apiDireta}/health/alertas`, {
    headers: { 'X-Alertas-Token': tokenAlertas },
  })
  return (await r.json()).pool_banco?.pico_pct ?? null
}

// --- 2 minutos de arrastar e zoom
const page = await contexto.newPage()
const pedidos = new Map()
const duracoes = []
let abortados = 0
let erros = 0
let pedidosPontos = 0
const statusDeErro = {}
const amostrasDeErro = []
let bytesPontos = 0
page.on('request', (r) => {
  if (r.url().includes('/v1/mapa/pontos')) {
    pedidosPontos += 1
    pedidos.set(r, Date.now())
  }
})
page.on('requestfinished', async (r) => {
  if (!pedidos.has(r)) return
  const resp = await r.response()
  if (!resp) return
  if (resp.status() >= 400) {
    erros += 1
    statusDeErro[resp.status()] = (statusDeErro[resp.status()] ?? 0) + 1
    if (amostrasDeErro.length < 3)
      amostrasDeErro.push(
        `${resp.status()} ${decodeURIComponent(r.url().split('?')[1] ?? '').slice(0, 140)} → ${(await resp.text().catch(() => '')).slice(0, 160)}`,
      )
  } else {
    const t = r.timing()
    duracoes.push(t.responseEnd >= 0 ? t.responseEnd : Date.now() - pedidos.get(r))
    bytesPontos += (await resp.body().catch(() => Buffer.alloc(0))).length
  }
})
page.on('requestfailed', (r) => {
  if (pedidos.has(r)) abortados += 1
})
const errosDaPagina = []
page.on('pageerror', (e) => errosDaPagina.push(e.message))
await page.addInitScript(() => {
  window.__quadros = []
  let ultimo = performance.now()
  const laco = (t) => {
    window.__quadros.push(t - ultimo)
    ultimo = t
    requestAnimationFrame(laco)
  }
  requestAnimationFrame(laco)
})
await page.goto(`${borda}/mapa`)
await page.getByRole('application', { name: 'Mapa das empresas' }).waitFor({ timeout: 30_000 })
await page.waitForFunction(
  () => Boolean(document.querySelector('[data-mapa-estado="pronto"]')),
  null,
  { timeout: 30_000 },
)
await page.waitForTimeout(2000)
// o mapa abre centrado nas empresas (centro inicial pelas coordenadas); garante o zoom de partida
const caixa = await page.getByRole('application', { name: 'Mapa das empresas' }).boundingBox()
const cx = caixa.x + caixa.width / 2
const cy = caixa.y + caixa.height / 2
// Sequência fixa de gestos (mulberry32): o "antes" e o "depois" fazem exatamente os mesmos movimentos
let semente = Number(process.env.CARGA_SEMENTE ?? 20261021)
const rnd = () => {
  semente = (semente + 0x6d2b79f5) | 0
  let t = Math.imul(semente ^ (semente >>> 15), 1 | semente)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const aleat = (a, b) => a + rnd() * (b - a)

const amostras = []
const pools = []
const marcadores = []
const inicio = Date.now()
let proxima = 0
let gestos = 0
console.log(`carga: ${segundos} s de arrastar e zoom (${rotulo})`)
while ((Date.now() - inicio) / 1000 < segundos) {
  if ((Date.now() - inicio) / 1000 >= proxima) {
    amostras.push(amostra(Math.round((Date.now() - inicio) / 1000)))
    pools.push(await poolPct())
    marcadores.push(
      await page.evaluate(() => document.querySelectorAll('.maplibregl-marker').length),
    )
    proxima += 10
  }
  const gesto = rnd()
  if (gesto < 0.55) {
    // arrasta
    const dx = aleat(-300, 300)
    const dy = aleat(-200, 200)
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + dx, cy + dy, { steps: 8 })
    await page.mouse.up()
  } else {
    // zoom com a roda, às vezes várias vezes seguidas (o MapLibre cancela e refaz a carga)
    const vezes = 1 + Math.floor(rnd() * 4)
    const sentido = rnd() < 0.5 ? -1 : 1
    await page.mouse.move(cx + aleat(-200, 200), cy + aleat(-120, 120))
    for (let i = 0; i < vezes; i++) {
      await page.mouse.wheel(0, sentido * 240)
      await page.waitForTimeout(aleat(30, 120))
    }
  }
  // a cada ~25 gestos, afasta o mapa até mostrar mais que o mundo (a área visível passa de ±180°)
  if (gestos > 0 && gestos % 25 === 0) {
    for (let i = 0; i < 14; i++) {
      await page.mouse.wheel(0, 240)
      await page.waitForTimeout(40)
    }
    await page.waitForTimeout(1200)
  }
  gestos += 1
  await page.waitForTimeout(aleat(80, 400))
}
amostras.push(amostra(Math.round((Date.now() - inicio) / 1000)))
pools.push(await poolPct())
await page.waitForTimeout(3000)
const fim = amostra(Math.round((Date.now() - inicio) / 1000) + 3)
const navegadorMedidas = await page.evaluate(() => {
  const q = [...window.__quadros].sort((a, b) => a - b)
  const pct = (p) => Math.round(q[Math.min(q.length - 1, Math.ceil((p / 100) * q.length) - 1)] ?? 0)
  return {
    quadros: q.length,
    quadroP50Ms: pct(50),
    quadroP95Ms: pct(95),
    quadrosAcima100ms: q.filter((x) => x > 100).length,
    nosDoDom: document.getElementsByTagName('*').length,
    heapJsMiB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
  }
})
// O tempo de cada pedido visto PELA API (o log "request completed" do pino): sem rede, sem navegador
const servidor = { pontos: [], tiles: 0 }
try {
  const log = execFileSync('docker', ['logs', apiContainer], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  })
  for (const linha of log.split('\n')) {
    if (!linha.includes('request completed')) continue
    let j
    try {
      j = JSON.parse(linha)
    } catch {
      continue
    }
    const url = j.req?.url ?? ''
    if (url.startsWith('/v1/mapa/pontos') && j.res?.statusCode === 200)
      servidor.pontos.push(j.responseTime)
    if (url.startsWith('/v1/mapa/base.pmtiles')) servidor.tiles += 1
  }
} catch {
  // sem o log do container não há a medida do servidor
}
const saude = await (await fetch(`${apiDireta}/health`)).json()
await navegador.close()

const mem = amostras.map((a) => a.memMiB)
const estab = amostras.map((a) => a.tcpEstab)
const cw = amostras.map((a) => a.tcpCloseWait)
const fdsv = amostras.map((a) => a.fds)
const pgv = amostras.map((a) => a.pgTotal)
const resultado = {
  rotulo,
  empresas,
  segundos,
  gestos,
  pontos: {
    pedidos: pedidosPontos,
    concluidos: duracoes.length,
    abortadosPeloNavegador: abortados,
    comErro: erros,
    statusDeErro,
    amostrasDeErro,
    p50: percentil(duracoes, 50),
    p95: percentil(duracoes, 95),
    p99: percentil(duracoes, 99),
    max: percentil(duracoes, 100),
    kbMedios: duracoes.length ? Math.round(bytesPontos / duracoes.length / 1024) : 0,
  },
  api: {
    memMiB: {
      inicio: mem[0],
      meio: mem[Math.floor(mem.length / 2)],
      fim: mem.at(-1),
      max: Math.max(...mem),
    },
    tcpEstabelecidos: { min: Math.min(...estab), max: Math.max(...estab), fim: estab.at(-1) },
    tcpCloseWait: { max: Math.max(...cw), fim: cw.at(-1) },
    descritoresDeArquivo: { min: Math.min(...fdsv), max: Math.max(...fdsv), fim: fdsv.at(-1) },
    conexoesDoBanco: { min: Math.min(...pgv), max: Math.max(...pgv), fim: pgv.at(-1) },
    poolPicoPct: { max: Math.max(...pools.filter((p) => p !== null), 0) },
    depoisDaCarga: fim,
  },
  servidor: {
    pedidos: servidor.pontos.length,
    p50: percentil(servidor.pontos, 50),
    p95: percentil(servidor.pontos, 95),
    p99: percentil(servidor.pontos, 99),
    max: percentil(servidor.pontos, 100),
    leiturasDoPmtilesPelaApi: servidor.tiles,
  },
  navegador: { ...navegadorMedidas, marcadoresNoDomMax: Math.max(...marcadores, 0) },
  health: saude.status,
  errosDaPagina: errosDaPagina.slice(0, 5),
  amostras,
}
if (saida) writeFileSync(saida, JSON.stringify(resultado, null, 2))
console.log(JSON.stringify({ ...resultado, amostras: undefined }, null, 2))
const ok =
  resultado.pontos.p95 !== null &&
  resultado.pontos.p95 < 300 &&
  erros === 0 &&
  saude.status === 'ok' &&
  errosDaPagina.length === 0
console.log(ok ? '✓ critérios de pronto atendidos' : '✗ critérios de pronto NÃO atendidos')
process.exit(0)

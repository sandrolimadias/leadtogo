/* global document */
// Teste no NAVEGADOR das imagens de produção rodando em docker/compose.imagens.yml (chamado por
// docker/imagens-testar.sh). Confere: cabeçalhos do web, /health da API (versão), primeiro acesso, login e o
// cookie de sessão pela borda (domínio único), sem nenhuma requisição para outra origem e sem violação de CSP.
// Variáveis: BORDA_URL (padrão http://localhost:8080), API_URL (http://localhost:3300), VERSAO.
import { createHmac } from 'node:crypto'

import { chromium } from 'playwright'

const borda = process.env.BORDA_URL ?? 'http://localhost:8080'
const apiDireta = process.env.API_URL ?? 'http://localhost:3300'
const versao = process.env.VERSAO ?? ''
const falhas = []
const confere = (condicao, mensagem) => {
  console.log(`${condicao ? '✓' : '✗'} ${mensagem}`)
  if (!condicao) falhas.push(mensagem)
}

// --- sem navegador: cabeçalhos do web pela borda e /health da API direta
const raiz = await fetch(`${borda}/`)
const cabecalho = (nome) => raiz.headers.get(nome) ?? ''
confere(
  raiz.ok && (await raiz.text()).includes('<div id="root">'),
  'a borda entrega o index.html do web em /',
)
// O único domínio externo permitido é o GlitchTip (envio de erros do navegador, connect-src)
const hostsExternos = [...cabecalho('content-security-policy').matchAll(/https?:\/\/[^\s;]+/g)].map(
  (m) => m[0],
)
confere(
  cabecalho('content-security-policy').includes("connect-src 'self'") &&
    hostsExternos.length === 2 &&
    hostsExternos.includes('https://erros.crm.aledias.com.br') &&
    hostsExternos.includes('https://mapa.crm.aledias.com.br'),
  "CSP com connect-src 'self' e só o GlitchTip e o bucket público do mapa como domínios externos",
)
confere(cabecalho('strict-transport-security').includes('max-age=31536000'), 'HSTS')
confere(cabecalho('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff')
confere(cabecalho('referrer-policy') === 'strict-origin-when-cross-origin', 'Referrer-Policy')
confere(cabecalho('cache-control') === 'no-cache', 'index.html sem cache')
const sw = await fetch(`${borda}/sw.js`)
confere(sw.headers.get('cache-control') === 'no-cache', 'service worker sem cache')
const manifesto = await fetch(`${borda}/manifest.webmanifest`)
confere(manifesto.headers.get('cache-control') === 'no-cache', 'manifest sem cache')
const html = await (await fetch(`${borda}/`)).text()
const asset = /\/assets\/[^"']+\.js/.exec(html)?.[0]
const ar = await fetch(`${borda}${asset}`, { headers: { 'accept-encoding': 'gzip' } })
confere(
  ar.headers.get('cache-control') === 'public, max-age=31536000, immutable',
  `arquivo com hash (${asset}) com cache de 1 ano (immutable)`,
)
confere(
  ['gzip', 'zstd'].includes(ar.headers.get('content-encoding') ?? ''),
  'compressão (gzip) nos arquivos de texto',
)
const profundo = await fetch(`${borda}/empresas`)
confere(
  profundo.ok && (await profundo.text()).includes('<div id="root">'),
  'fallback de SPA: /empresas entrega o index.html',
)
const estado = await (await fetch(`${borda}/v1/primeiro-acesso/estado`)).json()
confere(estado.aberto === true, '/v1 pela borda chega na API (primeiro-acesso/estado)')
const saude = await (await fetch(`${apiDireta}/health`)).json()
confere(saude.status === 'ok', `/health da API direta: ${JSON.stringify(saude.checks)}`)
confere(
  !versao || saude.version === versao,
  `/health mostra a versão ${versao || '(qualquer)'}: ${saude.version}`,
)

// TOTP (RFC 6238: SHA-1, 30 s, 6 dígitos), igual ao de apps/web/e2e/ambiente.ts
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

// --- posição dos pins: cada pin tem de cair onde a projeção do mapa manda, e o canvas ocupar o contêiner inteiro
// (pegou o bug de 18/10/2026: mapa criado antes do tamanho final da área central, pins deslocados e faixa cinza).
// A conta é independente do MapLibre (Mercator a partir do centro e do zoom + o tamanho REAL do contêiner no DOM).
async function testarPosicaoDosPins(contexto, borda) {
  const telas = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 390, height: 844 },
  ]
  const esperados = [
    { nome: 'Empresa do Mapa Ltda', lat: -14, lon: -52 },
    { nome: 'Segunda do Mapa Ltda', lat: -14.05, lon: -51.9 },
  ]
  const estado = await contexto.storageState()
  for (const tela of telas) {
    const ctx = await contexto
      .browser()
      .newContext({ storageState: estado, viewport: tela, locale: 'pt-BR' })
    const pagina = await ctx.newPage()
    await pagina.goto(`${borda}/mapa`)
    await pagina
      .waitForFunction(
        () =>
          Number(document.querySelector('[data-mapa-estado]')?.getAttribute('data-mapa-tiles')) > 0,
        null,
        { timeout: 25_000 },
      )
      .catch(() => {})
    await pagina
      .locator('.maplibregl-marker')
      .nth(1)
      .waitFor({ timeout: 15_000 })
      .catch(() => {})
    // dá tempo de o layout assentar (menu lateral, painéis) e confere duas vezes: o bug aparecia na primeira
    await pagina.waitForTimeout(1500)
    const r = await pagina.evaluate((esperados) => {
      const el = document.querySelector('[data-mapa-estado]')
      const mapa = document.querySelector(
        '[role="application"][aria-label="Mapa das empresas"]',
      )?.__mapa
      if (!mapa) return { erro: 'mapa não encontrado no DOM' }
      const caixa = el.getBoundingClientRect()
      const contenedor = mapa.getContainer().getBoundingClientRect()
      const canvas = mapa.getCanvas().getBoundingClientRect()
      const centro = mapa.getCenter()
      const mundo = 512 * 2 ** mapa.getZoom()
      const mx = (lon) => ((lon + 180) / 360) * mundo
      const my = (lat) =>
        (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * mundo
      const pins = esperados.map((e) => {
        const botao = [...document.querySelectorAll('.maplibregl-marker')].find((b) =>
          (b.getAttribute('aria-label') ?? '').includes(e.nome),
        )
        if (!botao) return { nome: e.nome, achou: false }
        const b = botao.getBoundingClientRect()
        const xEsperado = contenedor.left + contenedor.width / 2 + mx(e.lon) - mx(centro.lng)
        const yEsperado = contenedor.top + contenedor.height / 2 + my(e.lat) - my(centro.lat)
        const proj = mapa.project([e.lon, e.lat])
        return {
          nome: e.nome,
          achou: true,
          // a ponta da gota é o centro da base do botão
          erroX: Math.round(b.left + b.width / 2 - xEsperado),
          erroY: Math.round(b.bottom - yEsperado),
          erroProjecao: Math.round(
            Math.hypot(
              b.left + b.width / 2 - (contenedor.left + proj.x),
              b.bottom - (contenedor.top + proj.y),
            ),
          ),
        }
      })
      return {
        contenedor: [Math.round(contenedor.width), Math.round(contenedor.height)],
        canvas: [Math.round(canvas.width), Math.round(canvas.height)],
        caixa: [Math.round(caixa.width), Math.round(caixa.height)],
        pins,
      }
    }, esperados)
    const rotulo = `${tela.width}x${tela.height}`
    if (r.erro) {
      confere(false, `${rotulo}: ${r.erro}`)
    } else {
      confere(
        Math.abs(r.canvas[0] - r.contenedor[0]) <= 1 &&
          Math.abs(r.canvas[1] - r.contenedor[1]) <= 1,
        `${rotulo}: o canvas ocupa o contêiner inteiro (canvas ${r.canvas.join('x')}, contêiner ${r.contenedor.join('x')})`,
      )
      for (const p of r.pins) {
        confere(
          p.achou && Math.abs(p.erroX) <= 3 && Math.abs(p.erroY) <= 3 && p.erroProjecao <= 3,
          `${rotulo}: "${p.nome}" no lugar certo (erro x=${p.erroX} y=${p.erroY} px; contra a projeção: ${p.erroProjecao} px)`,
        )
      }
    }
    await ctx.close()
  }
}

// --- o mapa: worker do MapLibre, CSP e tiles (o que o E2E de desenvolvimento não pega, porque não tem Caddy nem CSP)
// O PMTiles de teste (docker/fixtures/mapa-teste.pmtiles) é enviado ao Garage por docker/imagens-testar.sh.
async function testarMapa(page, contexto, borda, senha) {
  // As telas internas exigem 2FA ativo: ativa pela API (mesmas chamadas do app) e abre a empresa
  const cabecalhos = { Origin: new URL(borda).origin }
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
  confere(
    verificar.ok(),
    `2FA ativado pela API para abrir as telas internas (${verificar.status()})`,
  )
  const me = await (await contexto.request.get(`${borda}/v1/me`)).json()
  await contexto.request.post(`${borda}/v1/sessao/empresa-ativa`, {
    data: { empresaId: me.empresas[0]?.id },
    headers: cabecalhos,
  })
  // Uma empresa dentro da área do PMTiles de teste: o mapa abre centrado nela (sem pontos, abriria no Brasil
  // inteiro, onde o arquivo de teste não tem tiles) e o pin também precisa aparecer
  const grupos = await (await contexto.request.get(`${borda}/v1/configuracoes/tag-grupos`)).json()
  const cliente = grupos.flatMap((g) => g.tags).find((t) => t.chaveSistema === 'cliente')
  const nova = await contexto.request.post(`${borda}/v1/carteira/empresas`, {
    data: { tipoDocumento: 'nenhum', razaoSocial: 'Empresa do Mapa Ltda', statusTagId: cliente.id },
    headers: cabecalhos,
  })
  const { id: empresaId } = await nova.json()
  const posicao = await contexto.request.post(
    `${borda}/v1/geolocalizacao/empresas/${empresaId}/posicao`,
    {
      data: { latitude: -14, longitude: -52 },
      headers: cabecalhos,
    },
  )
  confere(posicao.ok(), `empresa com posição na área do mapa de teste (${posicao.status()})`)
  const segunda = await contexto.request.post(`${borda}/v1/carteira/empresas`, {
    data: { tipoDocumento: 'nenhum', razaoSocial: 'Segunda do Mapa Ltda', statusTagId: cliente.id },
    headers: cabecalhos,
  })
  const { id: segundaId } = await segunda.json()
  await contexto.request.post(`${borda}/v1/geolocalizacao/empresas/${segundaId}/posicao`, {
    data: { latitude: -14.05, longitude: -51.9 },
    headers: cabecalhos,
  })
  const problemas = []
  const arquivos = []
  // ÚNICA violação tolerada: a sonda `Function('')` do zod 4 (util.allowsEval), no chunk principal. Ela só testa se
  // o eval é permitido e cai para o validador comum quando a CSP bloqueia (docs/esteira_deploy.md, seção da CSP).
  // Qualquer outra violação, ou essa vinda de outro arquivo, falha o teste.
  const sondaDoZod = /script-src bloqueou eval em \S*\/assets\/index-[\w-]+\.js:/
  const toleradas = []
  const aoConsole = (m) => {
    if (sondaDoZod.test(m.text())) {
      toleradas.push(m.text())
      return
    }
    if (m.type() === 'error' || /content security policy|worker/i.test(m.text()))
      problemas.push(`console: ${m.text()}`)
  }
  const aoErro = (e) => problemas.push(`erro da página: ${e.message}`)
  const aoResposta = (r) => {
    const url = r.url()
    if (/maplibre|\.pmtiles|\/mapa\/fontes\//.test(url))
      arquivos.push(`${r.status()} ${r.headers()['content-type'] ?? '?'} ${url.replace(borda, '')}`)
    else if (r.status() >= 400 && url.startsWith(borda))
      arquivos.push(`${r.status()} ${url.replace(borda, '')}`)
  }
  page.on('console', aoConsole)
  page.on('pageerror', aoErro)
  page.on('response', aoResposta)
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) => {
      console.error(
        `Content Security Policy: ${e.violatedDirective} bloqueou ${e.blockedURI} em ${e.sourceFile}:${e.lineNumber}`,
      )
    }),
  )
  await page.goto(`${borda}/mapa`)
  const mapa = page.getByRole('application', { name: 'Mapa das empresas' })
  await mapa.waitFor({ timeout: 20_000 })
  const contenedor = page.locator('[data-mapa-estado]').first()
  // espera os tiles desenhados (o mapa só marca `data-mapa-tiles` depois de decodificar a base no worker) ou a falha
  await page
    .waitForFunction(
      () => {
        const e = document.querySelector('[data-mapa-estado]')
        return (
          e &&
          (Number(e.getAttribute('data-mapa-tiles')) > 0 ||
            e.getAttribute('data-mapa-estado') === 'falhou')
        )
      },
      null,
      { timeout: 25_000 },
    )
    .catch(() => {})
  const estado = await contenedor.getAttribute('data-mapa-estado').catch(() => null)
  const tiles = Number((await contenedor.getAttribute('data-mapa-tiles').catch(() => null)) ?? 0)
  page.off('console', aoConsole)
  page.off('pageerror', aoErro)
  page.off('response', aoResposta)
  const tilesPedidos = arquivos.filter((a) => /\.pmtiles/.test(a)).length
  const detalhe = [...problemas, ...arquivos].map((l) => `\n     ${l}`).join('')
  confere(
    estado === 'pronto' && tiles > 0,
    `mapa desenhou a base (estado=${estado}, ${tiles} elementos desenhados, ${tilesPedidos} leituras do PMTiles)${
      estado === 'pronto' && tiles > 0 ? '' : detalhe
    }`,
  )
  if (toleradas.length) console.log(`   (tolerada: sonda de eval do zod, ${toleradas.length}x)`)
  confere(
    problemas.length === 0,
    `mapa sem erro de worker, de CSP nem de console${problemas.length ? detalhe : ''}`,
  )

  // O aviso: com o worker bloqueado (como era o bug), a tela precisa avisar em vez de ficar cinza em silêncio
  // (contexto novo sem o service worker do PWA, senão o arquivo sai do precache e a rota nunca o vê)
  const ctxSemWorker = await contexto.browser().newContext({
    storageState: await contexto.storageState(),
    serviceWorkers: 'block',
    locale: 'pt-BR',
  })
  const semWorker = await ctxSemWorker.newPage()
  await semWorker.route(/maplibre-gl-worker-[\w-]+\.mjs/, (rota) => rota.abort())
  semWorker.on('console', (m) => console.log('   [sem worker]', m.type(), m.text().slice(0, 200)))
  await semWorker.goto(`${borda}/mapa`)
  const aviso = await semWorker
    .getByRole('alert')
    .filter({ hasText: 'Não foi possível desenhar o mapa' })
    .waitFor({ timeout: 25_000 })
    .then(
      () => true,
      () => false,
    )
  console.log(
    '   estado:',
    await semWorker.locator('[data-mapa-estado]').first().getAttribute('data-mapa-estado'),
  )
  confere(
    aviso,
    'worker bloqueado: a tela avisa "Não foi possível desenhar o mapa" (não fica cinza em silêncio)',
  )
  await ctxSemWorker.close()
  await testarPosicaoDosPins(contexto, borda)
}

// --- no navegador: primeiro acesso, cookie e login
const navegador = await chromium.launch()
const email = `imagens-${Date.now().toString(36)}@exemplo.com.br`
const senha = 'senha-forte-imagens-1'
try {
  const contexto = await navegador.newContext({ locale: 'pt-BR' })
  const page = await contexto.newPage()
  const origem = new URL(borda).origin
  const externas = []
  const csp = []
  page.on('request', (r) => {
    if (r.url().startsWith('http') && new URL(r.url()).origin !== origem) externas.push(r.url())
  })
  page.on('console', (m) => {
    if (/content security policy/i.test(m.text())) csp.push(m.text())
  })
  await page.goto(`${borda}/primeiro-acesso`)
  await page.getByText('Passo 1 de 3 · Conta').waitFor()
  await page.getByLabel('Seu nome').fill('Imagens Teste')
  await page.getByLabel('E-mail do trabalho').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByLabel(/Li e aceito os termos/).check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel(/Razão social/).fill(`Empresa Imagens ${Date.now()} Ltda`)
  await page.getByRole('button', { name: 'Criar empresa' }).click()
  await page.getByRole('heading', { name: 'Tudo pronto' }).waitFor()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('heading', { name: 'Ative a verificação em duas etapas' }).waitFor()
  confere(
    true,
    'primeiro acesso pelo navegador: conta, empresa, login automático e ativação do 2FA',
  )
  const cookies = (await contexto.cookies(borda)).filter((c) => /session_token/.test(c.name))
  confere(
    cookies.length === 1 &&
      cookies[0].httpOnly &&
      cookies[0].secure &&
      cookies[0].sameSite === 'Lax',
    'cookie de sessão HttpOnly, Secure e SameSite=Lax',
  )
  confere(
    cookies[0]?.domain === new URL(borda).hostname,
    `cookie só do host (domain=${cookies[0]?.domain}, sem ponto na frente)`,
  )
  confere(
    (await page
      .getByText(`Versão ${versao}`)
      .first()
      .isVisible()
      .catch(() => false)) || !versao,
    `versão ${versao} visível no app`,
  )
  confere(
    externas.length === 0,
    `nenhuma requisição para outra origem${externas.length ? `: ${externas.join(', ')}` : ''}`,
  )
  confere(csp.length === 0, `nenhuma violação de CSP${csp.length ? `: ${csp[0]}` : ''}`)

  // login em um navegador novo (sem cookie)
  const novo = await navegador.newContext({ locale: 'pt-BR' })
  const p2 = await novo.newPage()
  await p2.goto(`${borda}/login`)
  await p2.getByLabel('E-mail').fill(email)
  await p2.getByLabel('Senha', { exact: true }).fill(senha)
  await p2.getByRole('button', { name: 'Entrar', exact: true }).click()
  await p2.getByRole('heading', { name: 'Ative a verificação em duas etapas' }).waitFor()
  confere(true, 'login pelo navegador (sessão pela borda)')
  // senha errada: em outro navegador novo (neste a sessão já está aberta e o login redireciona)
  const outro = await navegador.newContext({ locale: 'pt-BR' })
  const errado = await outro.newPage()
  await errado.goto(`${borda}/login`)
  await errado.getByLabel('E-mail').fill(email)
  await errado.getByLabel('Senha', { exact: true }).fill('senha-errada-123')
  await errado.getByRole('button', { name: 'Entrar', exact: true }).click()
  const genérica = await errado
    .getByText('E-mail ou senha não conferem')
    .first()
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    )
  confere(genérica, 'senha errada: mensagem genérica')

  // por último: ativa o 2FA da conta do primeiro contexto (o que muda o login acima) e abre o mapa
  await testarMapa(page, contexto, borda, senha)
  await contexto.close()
} finally {
  await navegador.close()
}
if (falhas.length > 0) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`)
  process.exit(1)
}
console.log('\nImagens OK no navegador.')

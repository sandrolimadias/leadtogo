// Teste no NAVEGADOR das imagens de produção rodando em docker/compose.imagens.yml (chamado por
// docker/imagens-testar.sh). Confere: cabeçalhos do web, /health da API (versão), primeiro acesso, login e o
// cookie de sessão pela borda (domínio único), sem nenhuma requisição para outra origem e sem violação de CSP.
// Variáveis: BORDA_URL (padrão http://localhost:8080), API_URL (http://localhost:3300), VERSAO.
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
confere(
  cabecalho('content-security-policy').includes("connect-src 'self'") &&
    !/https?:\/\//.test(cabecalho('content-security-policy')),
  "CSP com connect-src 'self' e sem domínios externos",
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
  await contexto.close()

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
} finally {
  await navegador.close()
}
if (falhas.length > 0) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`)
  process.exit(1)
}
console.log('\nImagens OK no navegador.')

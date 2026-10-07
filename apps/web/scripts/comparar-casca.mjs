/* global document */
// Compara a casca do app React com a do protótipo (docs/prototipo/prototipo/Leadtogo CRM.dc.html), região
// por região (menu aberto e recolhido, barra superior, menu de empresas, e no celular o cabeçalho, a
// barra inferior e a folha de perfil), nos temas claro e escuro. O conteúdo das telas não entra.
// Uso: pnpm --filter @leadtogo/web comparar:casca   (com o Vite em :5173 ou CAPTURA_URL)
// Saída: ~/projetos/leadtogo-capturas/casca-comparacao/{claro,escuro}/{referencia,react,diferenca}/ e relatorio.md
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const aqui = dirname(fileURLToPath(import.meta.url))
// O protótipo busca as telas por fetch: precisa de HTTP (file:// não funciona). Serve a pasta dele.
const pastaDoPrototipo = join(aqui, '../../../docs/prototipo/prototipo')
const tipos = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}
const servidor = createServer((req, res) => {
  const caminho = join(
    pastaDoPrototipo,
    decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname),
  )
  if (!caminho.startsWith(pastaDoPrototipo) || !existsSync(caminho)) {
    res.writeHead(404).end()
    return
  }
  const ext = caminho.slice(caminho.lastIndexOf('.'))
  res
    .writeHead(200, { 'content-type': tipos[ext] ?? 'application/octet-stream' })
    .end(readFileSync(caminho))
})
await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver))
const prototipo = `http://127.0.0.1:${servidor.address().port}/${encodeURIComponent('Leadtogo CRM.dc.html')}`
const base = process.env.CAPTURA_URL ?? 'http://localhost:5173'
const saida = join(homedir(), 'projetos/leadtogo-capturas/casca-comparacao')
const json = (corpo, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(corpo),
})

// Os mesmos dados do protótipo (dados.js): três empresas, o usuário é Admin na primeira
const empresas = [
  ['01a111e8-f08a-70b7-b5f3-52998ced0a01', 'Dias Automação Industrial', 'admin'],
  ['01a111e8-f08a-70b7-b5f3-52998ced0a02', 'Surlo Soluções Fiscais', 'vendedor'],
  ['01a111e8-f08a-70b7-b5f3-52998ced0a03', 'Norte Capixaba Equipamentos', 'gestor'],
]
const me = {
  usuario: {
    id: '0192f0a0-0000-7000-8000-000000000001',
    nome: 'Alessandro Dias',
    email: 'alessandro@diasautomacao.com.br',
    emailVerificado: true,
    twoFactorEnabled: true,
  },
  empresas: empresas.map(([id, nome, papel], i) => ({
    id,
    razaoSocial: `${nome} Ltda`,
    nomeFantasia: nome,
    papel,
    situacao: 'ativo',
    ativa: i === 0,
  })),
  empresaAtivaId: empresas[0][0],
  precisaEscolherEmpresa: false,
  administradorDeConta: true,
  doisFatoresPendente: false,
  doisFatoresObrigatorio: true,
  doisFatoresMotivo: { origem: 'conta', empresaId: null, papel: null },
}

async function paginaReact(navegador, { largura, altura, tema, recolhido }) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    locale: 'pt-BR',
    colorScheme: tema === 'escuro' ? 'dark' : 'light',
    reducedMotion: 'reduce',
  })
  const page = await contexto.newPage()
  await page.route('**/v1/**', (rota) => {
    const { pathname } = new URL(rota.request().url())
    if (pathname === '/v1/me') return rota.fulfill(json(me))
    if (pathname === '/v1/me/preferencias')
      return rota.fulfill(
        json({
          tema: 'sistema',
          menuRecolhido: !!recolhido,
          visaoDashboard: 'minha',
          filtroPadrao: {},
        }),
      )
    return rota.fulfill(json({}))
  })
  await page.goto(`${base}/`, { waitUntil: 'networkidle' })
  await page.evaluate(
    (t) => document.documentElement.setAttribute('data-theme', t === 'escuro' ? 'dark' : 'light'),
    tema,
  )
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor()
  await page.addStyleTag({
    content:
      '*,*::before,*::after{transition:none !important;animation:none !important;caret-color:transparent !important}',
  })
  return { page, contexto }
}

async function paginaPrototipo(navegador, { largura, altura, tema, dispositivo, recolhido }) {
  const contexto = await navegador.newContext({
    viewport: { width: largura, height: altura },
    locale: 'pt-BR',
    reducedMotion: 'reduce',
  })
  const page = await contexto.newPage()
  await page.addInitScript((estado) => localStorage.setItem('lt-proto', JSON.stringify(estado)), {
    screen: 'dashboard',
    device: dispositivo,
    theme: tema,
    navCollapsed: !!recolhido,
  })
  await page.goto(prototipo)
  await page.waitForTimeout(2500)
  await page.addStyleTag({
    content:
      '*,*::before,*::after{transition:none !important;animation:none !important;caret-color:transparent !important}',
  })
  return { page, contexto }
}

/** [nome, estado, onde o protótipo mostra, onde o React mostra] */
const regioes = [
  {
    nome: 'desktop-menu-aberto',
    estado: { dispositivo: 'desktop' },
    proto: (p) => p.locator('nav').first(),
    react: (p) => p.getByRole('navigation', { name: 'Principal' }),
  },
  {
    nome: 'desktop-menu-recolhido',
    estado: { dispositivo: 'desktop', recolhido: true },
    proto: (p) => p.locator('nav').first(),
    react: (p) => p.getByRole('navigation', { name: 'Principal' }),
  },
  {
    nome: 'desktop-barra-superior',
    estado: { dispositivo: 'desktop' },
    proto: (p) => p.locator('header').first(),
    react: (p) => p.locator('header').first(),
  },
  {
    nome: 'desktop-seletor-de-empresa-aberto',
    estado: { dispositivo: 'desktop' },
    antes: async (p, qual) => {
      if (qual === 'proto') await p.locator('.lt-tenant').click()
      else
        await p
          .getByRole('navigation', { name: 'Principal' })
          .getByRole('button', { name: /Dias Automação/ })
          .click()
      await p.waitForTimeout(250)
    },
    proto: (p) => p.getByRole('menu'),
    react: (p) => p.getByRole('menu'),
  },
  {
    nome: 'desktop-menu-recolhido-seletor-aberto',
    estado: { dispositivo: 'desktop', recolhido: true },
    antes: async (p, qual) => {
      if (qual === 'proto') await p.getByLabel('Trocar empresa ativa').click()
      else await p.getByRole('button', { name: /Trocar de empresa/ }).click()
      await p.waitForTimeout(250)
    },
    proto: (p) => p.getByRole('menu'),
    react: (p) => p.getByRole('menu'),
  },
  {
    nome: 'celular-cabecalho',
    estado: { dispositivo: 'mobile', celular: true },
    proto: (p) => p.locator('header').first(),
    react: (p) => p.locator('header').first(),
  },
  {
    nome: 'celular-barra-inferior',
    estado: { dispositivo: 'mobile', celular: true },
    proto: (p) => p.locator('nav').first(),
    react: (p) => p.getByRole('navigation', { name: 'Navegação do celular' }),
  },
  {
    nome: 'celular-folha-de-perfil',
    estado: { dispositivo: 'mobile', celular: true },
    antes: async (p, qual) => {
      if (qual === 'proto') await p.getByLabel('Perfil e empresa ativa').click()
      else await p.getByRole('button', { name: 'Abrir perfil' }).click()
      await p.waitForTimeout(300)
    },
    proto: (p) =>
      p.locator('div[data-density="touch"]').filter({ hasText: 'Empresa ativa' }).last(),
    react: (p) => p.getByRole('dialog', { name: 'Meu perfil' }),
  },
]

const navegador = await chromium.launch()
const filtro = process.argv.slice(2)
const linhas = ['# Diferenças entre a casca do protótipo e a do app React', '']
for (const tema of ['claro', 'escuro']) {
  linhas.push(
    `## Tema ${tema}`,
    '',
    '| Região | Protótipo | React | Pixels diferentes |',
    '|---|---|---|---|',
  )
  const dir = join(saida, tema)
  for (const sub of ['referencia', 'react', 'diferenca'])
    mkdirSync(join(dir, sub), { recursive: true })
  for (const r of regioes) {
    if (filtro.length && !filtro.some((f) => r.nome.includes(f))) continue
    const celular = !!r.estado.celular
    const dims = celular ? { largura: 388, altura: 842 } : { largura: 1440, altura: 900 }
    const proto = await paginaPrototipo(navegador, {
      ...dims,
      largura: celular ? 1000 : dims.largura,
      altura: celular ? 1000 : dims.altura,
      tema,
      ...r.estado,
    })
    const reac = await paginaReact(navegador, { ...dims, tema, recolhido: r.estado.recolhido })
    if (r.antes) {
      await r.antes(proto.page, 'proto')
      await r.antes(reac.page, 'react')
    }
    const a = await r.proto(proto.page).screenshot()
    const b = await r.react(reac.page).screenshot()
    await proto.contexto.close()
    await reac.contexto.close()
    writeFileSync(join(dir, 'referencia', `${r.nome}.png`), a)
    writeFileSync(join(dir, 'react', `${r.nome}.png`), b)
    const pa = PNG.sync.read(a)
    const pb = PNG.sync.read(b)
    const w = Math.min(pa.width, pb.width)
    const h = Math.min(pa.height, pb.height)
    const corte = (p) => {
      const o = new PNG({ width: w, height: h })
      PNG.bitblt(p, o, 0, 0, w, h, 0, 0)
      return o
    }
    const dif = new PNG({ width: w, height: h })
    const n = pixelmatch(corte(pa).data, corte(pb).data, dif.data, w, h, { threshold: 0.1 })
    writeFileSync(join(dir, 'diferenca', `${r.nome}.png`), PNG.sync.write(dif))
    linhas.push(
      `| ${r.nome} | ${pa.width}×${pa.height} | ${pb.width}×${pb.height}${pa.width === pb.width && pa.height === pb.height ? '' : ' ⚠'} | ${n} (${((100 * n) / (w * h)).toFixed(2)}%) |`,
    )
  }
  linhas.push('')
}
writeFileSync(join(saida, 'relatorio.md'), linhas.join('\n'))
console.log(linhas.join('\n'))
await navegador.close()
servidor.close()

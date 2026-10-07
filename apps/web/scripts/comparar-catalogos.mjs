/* global document */
// Compara o catálogo do design system (docs/design-system/catalogo.html, a referência) com o
// /dev/catalogo do app React, seção por seção, a 1440 px, nos temas claro e escuro.
// Uso: pnpm --filter @leadtogo/web comparar:catalogos [Nome ...]   (com o `pnpm dev` ligado em :5173)
// Saída: ~/projetos/leadtogo-capturas/catalogo/{claro,escuro}/{referencia,react,diferenca}/<Seção>.png e relatorio.md
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const aqui = dirname(fileURLToPath(import.meta.url))
const referencia = pathToFileURL(join(aqui, '../../../docs/design-system/catalogo.html')).href
const react = process.env.CATALOGO_URL ?? 'http://localhost:5173/dev/catalogo'
const saida = join(homedir(), 'projetos/leadtogo-capturas/catalogo')
const filtro = process.argv.slice(2)
// DENSIDADE=Compacta|Toque repete a comparação nessa densidade (pastas claro-toque etc.)
const densidade = process.env.DENSIDADE ?? ''
const temas = [
  { id: 'claro', botao: 'Claro' },
  { id: 'escuro', botao: 'Escuro' },
]

async function abrir(browser, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.addStyleTag({
    content:
      'header{position:static !important} *,*::before,*::after{animation:none !important;transition:none !important;caret-color:transparent !important}',
  })
  await page.evaluate(() => document.fonts.ready)
  return page
}

async function escolherTema(page, botao) {
  await page.getByRole('group', { name: 'Tema' }).getByRole('button', { name: botao }).click()
  await page.waitForTimeout(150)
}

async function capturar(page, dir) {
  mkdirSync(dir, { recursive: true })
  const nomes = await page.locator('section.cat-item h3').allTextContents()
  const imagens = {}
  for (const nome of nomes) {
    if (filtro.length && !filtro.includes(nome)) continue
    const secao = page.locator('section.cat-item', {
      has: page.locator('h3', { hasText: new RegExp(`^${nome}$`) }),
    })
    const caixa = await secao.boundingBox()
    if (!caixa) continue
    const buf = await page.screenshot({ fullPage: true, clip: caixa })
    writeFileSync(join(dir, `${nome}.png`), buf)
    imagens[nome] = buf
  }
  return imagens
}

const browser = await chromium.launch()
const ref = await abrir(browser, referencia)
const app = await abrir(browser, react)
const linhas = ['# Diferenças entre catalogo.html (referência) e /dev/catalogo (React)', '']
for (const { id, botao } of temas) {
  await escolherTema(ref, botao)
  await escolherTema(app, botao)
  if (densidade) {
    for (const pagina of [ref, app]) {
      await pagina
        .getByRole('group', { name: 'Densidade' })
        .getByRole('button', { name: densidade })
        .click()
    }
  }
  const sufixo = densidade ? `-${densidade.toLowerCase()}` : ''
  const a = await capturar(ref, join(saida, id + sufixo, 'referencia'))
  const b = await capturar(app, join(saida, id + sufixo, 'react'))
  linhas.push(
    `## Tema ${id}${densidade ? ' · densidade ' + densidade : ''}`,
    '',
    '| Seção | Tamanho ref | Tamanho React | Pixels diferentes |',
    '|---|---|---|---|',
  )
  mkdirSync(join(saida, id + sufixo, 'diferenca'), { recursive: true })
  for (const nome of Object.keys(a)) {
    const pa = PNG.sync.read(a[nome])
    const pb = b[nome] ? PNG.sync.read(b[nome]) : null
    if (!pb) {
      linhas.push(`| ${nome} | ${pa.width}×${pa.height} | ausente | — |`)
      continue
    }
    const w = Math.min(pa.width, pb.width)
    const h = Math.min(pa.height, pb.height)
    const corte = (p) => {
      const o = new PNG({ width: w, height: h })
      PNG.bitblt(p, o, 0, 0, w, h, 0, 0)
      return o
    }
    const ca = corte(pa)
    const cb = corte(pb)
    const dif = new PNG({ width: w, height: h })
    const n = pixelmatch(ca.data, cb.data, dif.data, w, h, { threshold: 0.1 })
    writeFileSync(join(saida, id + sufixo, 'diferenca', `${nome}.png`), PNG.sync.write(dif))
    const mesmo = pa.width === pb.width && pa.height === pb.height
    linhas.push(
      `| ${nome} | ${pa.width}×${pa.height} | ${pb.width}×${pb.height}${mesmo ? '' : ' ⚠'} | ${n} (${((100 * n) / (w * h)).toFixed(2)}%) |`,
    )
  }
  linhas.push('')
}
writeFileSync(
  join(saida, `relatorio${densidade ? '-' + densidade.toLowerCase() : ''}.md`),
  linhas.join('\n'),
)
console.log(linhas.join('\n'))
await browser.close()

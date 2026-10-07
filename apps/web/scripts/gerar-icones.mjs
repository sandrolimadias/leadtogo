// Gera os ícones PNG do PWA a partir da marca do design system (um quadrado petróleo com o ponto e a seta).
// Os PNG ficam commitados em public/icons; rode só se a marca mudar: pnpm --filter @leadtogo/web gerar:icones
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const saida = join(dirname(fileURLToPath(import.meta.url)), '../public')
mkdirSync(join(saida, 'icons'), { recursive: true })

const PETROLEO = '#0b5f70' // --accent do tema claro
const simbolo =
  '<circle cx="10.5" cy="16" r="3.5" fill="#fff"/><path d="M17 9.5 23.5 16 17 22.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
/** `escala` < 1 encolhe o símbolo para dentro da zona segura do ícone "maskable" */
const svg = (tamanho, { arredondado, escala = 1 }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${tamanho}" height="${tamanho}" viewBox="0 0 32 32"><rect width="32" height="32"${arredondado ? ' rx="8"' : ''} fill="${PETROLEO}"/><g transform="translate(16 16) scale(${escala}) translate(-16 -16)">${simbolo}</g></svg>`

writeFileSync(join(saida, 'favicon.svg'), svg(32, { arredondado: true }))

const icones = [
  ['icons/icon-192.png', 192, { arredondado: true }],
  ['icons/icon-512.png', 512, { arredondado: true }],
  // "maskable": o sistema recorta (círculo, squircle...), então o fundo vai até a borda e o símbolo fica no centro
  ['icons/icon-maskable-512.png', 512, { arredondado: false, escala: 0.62 }],
  ['icons/apple-touch-icon.png', 180, { arredondado: false, escala: 0.8 }],
]
const navegador = await chromium.launch()
const page = await navegador.newPage()
for (const [arquivo, tamanho, opcoes] of icones) {
  await page.setViewportSize({ width: tamanho, height: tamanho })
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg(tamanho, opcoes)}</body>`,
  )
  await page.screenshot({
    path: join(saida, arquivo),
    omitBackground: true,
    clip: { x: 0, y: 0, width: tamanho, height: tamanho },
  })
  console.log(`${arquivo} (${tamanho}×${tamanho})`)
}
await navegador.close()

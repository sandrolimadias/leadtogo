/* global document */
// Captura a casca do app (1440, 820 e 390 px; claro e escuro) com a API simulada pelo Playwright.
// Uso: pnpm --filter @leadtogo/web capturar:casca   (com o Vite em :5173 ou CAPTURA_URL)
// Saída: ~/projetos/leadtogo-capturas/casca/{claro,escuro}/{1440,820,390}/NN-nome.png
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'

const base = process.env.CAPTURA_URL ?? 'http://localhost:5173'
const saida = join(homedir(), 'projetos/leadtogo-capturas/casca')
const filtro = process.argv.slice(2)
const json = (corpo, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(corpo),
})

const A = '01a111e8-f08a-70b7-b5f3-52998ced0a3a'
const B = '01a111e8-f08a-70b7-b5f3-52998ced0a3b'
const empresa = (id, nome, papel, ativa) => ({
  id,
  razaoSocial: `${nome} Ltda`,
  nomeFantasia: nome,
  papel,
  situacao: 'ativo',
  ativa,
})
const me = (ativa = A) => ({
  usuario: {
    id: '0192f0a0-0000-7000-8000-000000000001',
    nome: 'Alessandro Dias',
    email: 'alessandro@diasautomacao.com.br',
    emailVerificado: true,
    twoFactorEnabled: true,
  },
  empresas: [
    empresa(A, 'Dias Automação Industrial', 'admin', ativa === A),
    empresa(B, 'Dias Serviços', 'vendedor', ativa === B),
  ],
  empresaAtivaId: ativa,
  precisaEscolherEmpresa: ativa === null,
  administradorDeConta: false,
  doisFatoresPendente: false,
  doisFatoresObrigatorio: true,
  doisFatoresMotivo: { origem: 'conta', empresaId: null, papel: null },
})
const prefs = (recolhido = false) => ({
  tema: 'sistema',
  menuRecolhido: recolhido,
  visaoDashboard: 'minha',
  filtroPadrao: {},
})

async function simular(page, estado) {
  await page.route('**/v1/**', (rota) => {
    const { pathname } = new URL(rota.request().url())
    if (pathname === '/v1/me') return rota.fulfill(json(estado.me ?? me()))
    if (pathname === '/v1/me/preferencias') return rota.fulfill(json(prefs(estado.recolhido)))
    return rota.fulfill(json({}))
  })
}

const cenas = [
  ['01-dashboard', '/', {}, async () => {}],
  ['02-menu-recolhido', '/', { recolhido: true }, async () => {}],
  [
    '03-seletor-de-empresa',
    '/empresas',
    {},
    async (p, t) => {
      if (t === 390) await p.getByRole('button', { name: 'Abrir perfil' }).click()
      else
        await p
          .getByRole('navigation', { name: 'Principal' })
          .getByRole('button', { name: /Dias Automação/ })
          .click()
      await p.waitForTimeout(200)
    },
  ],
  [
    '04-menu-do-usuario',
    '/',
    {},
    async (p, t) => {
      if (t === 390) await p.getByRole('button', { name: 'Mais' }).click()
      else await p.getByRole('button', { name: /^Menu de / }).click()
      await p.waitForTimeout(200)
    },
  ],
  [
    '05-notificacoes',
    '/',
    {},
    async (p) => {
      await p.getByRole('button', { name: 'Notificações' }).click()
      await p.waitForTimeout(200)
    },
  ],
  [
    '06-seguranca',
    '/perfil/seguranca',
    {},
    async (p) => p.getByRole('heading', { name: 'Segurança' }).waitFor(),
  ],
  [
    '07-escolha-a-empresa',
    '/',
    { me: me(null) },
    async (p) => p.getByRole('heading', { name: 'Escolha a empresa' }).waitFor(),
  ],
]
const tamanhos = [
  { nome: '1440', largura: 1440, altura: 900 },
  { nome: '820', largura: 820, altura: 1000 },
  { nome: '390', largura: 390, altura: 844 },
]
const temas = [
  { nome: 'claro', valor: 'light' },
  { nome: 'escuro', valor: 'dark' },
]

const navegador = await chromium.launch()
let total = 0
for (const tema of temas) {
  for (const tam of tamanhos) {
    const dir = join(saida, tema.nome, tam.nome)
    mkdirSync(dir, { recursive: true })
    for (const [nome, rota, estado, agir] of cenas) {
      if (filtro.length && !filtro.some((f) => nome.includes(f))) continue
      // no tablet o menu é sempre recolhido; o menu recolhido do desktop não faz sentido no celular
      if (tam.nome !== '1440' && nome === '02-menu-recolhido') continue
      if (
        tam.nome === '820' &&
        !['01-dashboard', '03-seletor-de-empresa', '07-escolha-a-empresa'].includes(nome)
      )
        continue
      const contexto = await navegador.newContext({
        viewport: { width: tam.largura, height: tam.altura },
        locale: 'pt-BR',
        colorScheme: tema.valor,
        reducedMotion: 'reduce',
      })
      const page = await contexto.newPage()
      await simular(page, estado)
      // o tema vem do tokens.css (preferência do sistema); data-theme fixa o do teste
      await page.addInitScript(
        (t) => localStorage.setItem('leadtogo:tema', t === 'dark' ? 'escuro' : 'claro'),
        tema.valor,
      )
      await page.goto(`${base}${rota}`, { waitUntil: 'networkidle' })
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema.valor)
      await page.locator('main h1, main h2, h1, h2').first().waitFor()
      await agir(page, tam.largura)
      await page.waitForTimeout(300)
      await page.screenshot({ path: join(dir, `${nome}.png`), fullPage: false })
      await contexto.close()
      total += 1
    }
  }
}
await navegador.close()
console.log(`${total} capturas em ${saida}`)

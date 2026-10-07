/* global document */
// Captura todas as telas de acesso (1440 e 390 px, claro e escuro) com a API simulada pelo próprio
// Playwright (page.route), para chegar em cada estado sem depender de banco ou e-mail.
// Uso: pnpm --filter @leadtogo/web capturar:acesso   (com o Vite em :5173 ou CAPTURA_URL)
// Saída: ~/projetos/leadtogo-capturas/acesso/{claro,escuro}/{1440,390}/NN-nome.png
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { chromium } from 'playwright'

const base = process.env.CAPTURA_URL ?? 'http://localhost:5173'
const saida = join(homedir(), 'projetos/leadtogo-capturas/acesso')
const filtro = process.argv.slice(2)

const json = (corpo, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(corpo),
})
const meAdmin = (pendente) => ({
  usuario: {
    id: '0192f0a0-0000-7000-8000-000000000001',
    nome: 'Alessandro Dias',
    email: 'alessandro@diasautomacao.com.br',
    emailVerificado: true,
    twoFactorEnabled: !pendente,
  },
  empresas: [],
  empresaAtivaId: null,
  administradorDeConta: true,
  doisFatoresPendente: pendente,
  doisFatoresObrigatorio: true,
})
const convite = (contaExistente) => ({
  empresa: {
    razaoSocial: 'Dias Automação Industrial Ltda',
    nomeFantasia: 'Dias Automação Industrial',
  },
  email: 'mariana@diasautomacao.com.br',
  papel: 'vendedor',
  expiraEm: '2026-10-20T12:00:00.000Z',
  contaExistente,
})

/** Respostas da API simuladas; `estado` troca o que a tela encontra. */
async function simular(page, estado) {
  await page.route('**/v1/**', (rota) => {
    const { pathname } = new URL(rota.request().url())
    const metodo = rota.request().method()
    if (pathname === '/v1/me') {
      return rota.fulfill(
        estado.me
          ? json(estado.me)
          : json({ erro: 'nao_autenticado', mensagem: 'x', statusCode: 401 }, 401),
      )
    }
    if (pathname === '/v1/acesso/opcoes')
      return rota.fulfill(json({ loginGoogle: estado.google ?? true }))
    if (pathname === '/v1/primeiro-acesso/estado')
      return rota.fulfill(json({ aberto: estado.aberto ?? true }))
    if (pathname === '/v1/convites/consultar') {
      return rota.fulfill(
        estado.convite
          ? json(estado.convite)
          : json({ erro: 'convite_invalido', mensagem: 'x', statusCode: 404 }, 404),
      )
    }
    if (pathname === '/v1/auth/sign-in/email') {
      return rota.fulfill(
        json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401),
      )
    }
    if (pathname === '/v1/auth/two-factor/enable') {
      return rota.fulfill(
        json({
          method: 'totp',
          totpURI:
            'otpauth://totp/Leadtogo:alessandro%40diasautomacao.com.br?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Leadtogo',
          backupCodes: [
            'K7Q2M-9XPD4',
            'B3VNA-6TZ8R',
            'W5HJC-2LYE9',
            'D8FGS-4UQ7N',
            'R6TXP-1MCA3',
            'Z9LEY-5BHK2',
            'N4DQW-8JVS6',
            'P2UCA-7GXT1',
            'H1MZR-3FKY5',
            'E6SBV-9WNL4',
          ],
        }),
      )
    }
    if (pathname === '/v1/auth/two-factor/verify-totp') {
      return rota.fulfill(
        estado.codigoErrado
          ? json({ code: 'INVALID_CODE', message: 'Invalid code' }, 401)
          : json({ status: true }),
      )
    }
    if (metodo === 'POST' && pathname === '/v1/primeiro-acesso') {
      return rota.fulfill(
        json(
          {
            usuarioId: 'u',
            contaId: 'c',
            tenantId: 't',
            membroId: 'm',
            verificacaoEmailPendente: false,
          },
          201,
        ),
      )
    }
    return rota.fulfill(json({}))
  })
}

const digitos = async (page, codigo) => {
  await page.getByLabel('Dígito 1').click()
  await page.keyboard.type(codigo)
}

const cenas = [
  ['01-login', '/login', {}, async () => {}],
  [
    '02-login-campos-obrigatorios',
    '/login',
    {},
    async (p) => p.getByRole('button', { name: 'Entrar', exact: true }).click(),
  ],
  [
    '03-login-senha-incorreta',
    '/login',
    {},
    async (p) => {
      await p.getByLabel('E-mail').fill('alessandro@diasautomacao.com.br')
      await p.getByLabel('Senha', { exact: true }).fill('senha-errada-123')
      await p.getByRole('button', { name: 'Entrar', exact: true }).click()
      await p.getByRole('alert').waitFor()
    },
  ],
  ['04-verificacao-2fa', '/verificacao', {}, async (p) => digitos(p, '482')],
  [
    '05-verificacao-codigo-incorreto',
    '/verificacao',
    { codigoErrado: true },
    async (p) => {
      await digitos(p, '000000')
      await p.getByRole('button', { name: 'Verificar' }).click()
      await p.getByText('Código incorreto ou vencido.').waitFor()
    },
  ],
  [
    '06-verificacao-codigo-de-recuperacao',
    '/verificacao',
    {},
    async (p) => p.getByRole('button', { name: 'Usar código de recuperação' }).click(),
  ],
  ['07-ativar-2fa-senha', '/ativar-2fa', { me: meAdmin(true) }, async () => {}],
  [
    '08-ativar-2fa-qr-code',
    '/ativar-2fa',
    { me: meAdmin(true) },
    async (p) => {
      await p.getByLabel('Senha', { exact: true }).fill('segredo-forte-1')
      await p.getByRole('button', { name: 'Continuar' }).click()
      await p.getByAltText('QR code para o app autenticador').waitFor()
      await p.waitForTimeout(300)
    },
  ],
  [
    '09-ativar-2fa-codigos-de-recuperacao',
    '/ativar-2fa',
    { me: meAdmin(true) },
    async (p) => {
      await p.getByLabel('Senha', { exact: true }).fill('segredo-forte-1')
      await p.getByRole('button', { name: 'Continuar' }).click()
      await p.getByAltText('QR code para o app autenticador').waitFor()
      await digitos(p, '123456')
      await p.getByRole('button', { name: 'Ativar verificação' }).click()
      await p.getByRole('heading', { name: 'Guarde seus códigos de recuperação' }).waitFor()
    },
  ],
  ['10-esqueci-a-senha', '/esqueci-senha', {}, async () => {}],
  [
    '11-confira-seu-email',
    '/confira-seu-email?email=alessandro%40diasautomacao.com.br',
    {},
    async () => {},
  ],
  [
    '12-nova-senha',
    '/redefinir-senha?token=abc',
    {},
    async (p) => p.getByLabel('Senha nova').fill('senha-nova-9'),
  ],
  ['13-nova-senha-link-vencido', '/redefinir-senha?error=INVALID_TOKEN', {}, async () => {}],
  ['14-email-confirmado', '/verificar-email?confirmado=1', {}, async () => {}],
  [
    '15-confirmar-email-reenvio',
    '/verificar-email?error=token_expired&email=mariana%40diasautomacao.com.br',
    {},
    async () => {},
  ],
  [
    '16-convite-conta-nova',
    '/convite?token=tokentokentokentokentoken',
    { convite: convite(false) },
    async (p) => {
      await p.getByLabel(/Seu nome/).fill('Mariana Gobbi')
      await p.getByLabel('Crie uma senha').fill('senha-forte-12')
    },
  ],
  [
    '17-convite-conta-existente',
    '/convite?token=tokentokentokentokentoken',
    { convite: convite(true) },
    async () => {},
  ],
  ['18-convite-invalido', '/convite?token=tokentokentokentokentoken', {}, async () => {}],
  [
    '19-primeiro-acesso-conta',
    '/primeiro-acesso',
    {},
    async (p) => {
      await p.getByLabel('Seu nome').fill('Alessandro Dias')
      await p.getByLabel('E-mail do trabalho').fill('alessandro@diasautomacao.com.br')
      await p.getByLabel('Senha', { exact: true }).fill('segredo2026x')
    },
  ],
  [
    '20-primeiro-acesso-empresa',
    '/primeiro-acesso',
    {},
    async (p) => {
      await p.getByLabel('Seu nome').fill('Alessandro Dias')
      await p.getByLabel('E-mail do trabalho').fill('alessandro@diasautomacao.com.br')
      await p.getByLabel('Senha', { exact: true }).fill('segredo2026x')
      await p.getByLabel(/Li e aceito os termos/).check()
      await p.getByRole('button', { name: 'Continuar' }).click()
      await p.getByLabel(/Razão social/).fill('Dias Automação Industrial Ltda')
      await p.getByLabel('Nome de exibição').fill('Dias Automação Industrial')
    },
  ],
  [
    '21-primeiro-acesso-tudo-pronto',
    '/primeiro-acesso',
    {},
    async (p) => {
      await p.getByLabel('Seu nome').fill('Alessandro Dias')
      await p.getByLabel('E-mail do trabalho').fill('alessandro@diasautomacao.com.br')
      await p.getByLabel('Senha', { exact: true }).fill('segredo2026x')
      await p.getByLabel(/Li e aceito os termos/).check()
      await p.getByRole('button', { name: 'Continuar' }).click()
      await p.getByLabel(/Razão social/).fill('Dias Automação Industrial Ltda')
      await p.getByRole('button', { name: 'Criar empresa' }).click()
      await p.getByRole('heading', { name: 'Tudo pronto' }).waitFor()
    },
  ],
  [
    '22-primeiro-acesso-fechado',
    '/primeiro-acesso',
    { aberto: false, google: false },
    async (p) => {
      await p.getByRole('heading', { name: 'O cadastro está fechado' }).waitFor()
    },
  ],
]

const tamanhos = [
  { nome: '1440', largura: 1440, altura: 900 },
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
      const contexto = await navegador.newContext({
        viewport: { width: tam.largura, height: tam.altura },
        locale: 'pt-BR',
        colorScheme: tema.valor,
        reducedMotion: 'reduce',
      })
      const page = await contexto.newPage()
      await simular(page, estado)
      await page.goto(`${base}${rota}`, { waitUntil: 'networkidle' })
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema.valor)
      await page.locator('main h1, main h2').first().waitFor()
      await agir(page)
      await page.waitForTimeout(250)
      await page.screenshot({ path: join(dir, `${nome}.png`), fullPage: true })
      await contexto.close()
      total += 1
    }
  }
}
await navegador.close()
console.log(`${total} capturas em ${saida}`)

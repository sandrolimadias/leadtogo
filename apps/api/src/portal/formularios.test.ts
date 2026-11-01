/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call -- os corpos JSON do supertest chegam como any */
import http from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import { esperarAte } from '../testes/espera.js'
import { aguardarMensagem, limparCaixa } from '../testes/mailpit.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  entrarNoPortal,
  novaEmpresaCliente,
  novoAcesso,
} from '../testes/portal.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'

const recebidos: { corpo: string; assinatura: string | undefined }[] = []
let falharProximos = 0
const destino = http.createServer((req, res) => {
  let corpo = ''
  req.on('data', (p: Buffer) => (corpo += p.toString()))
  req.on('end', () => {
    if (falharProximos > 0) {
      falharProximos--
      res.writeHead(500).end('erro')
      return
    }
    recebidos.push({
      corpo,
      assinatura: req.headers['x-leadtogo-assinatura'] as string | undefined,
    })
    res.writeHead(200).end('ok')
  })
})

const TROCA = { WEBHOOK_HOSTS_INTERNOS: '127.0.0.1', WEBHOOK_TIMEOUT_MS: '3000' }
let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
let urlDoDestino = ''
const crm = chamarEm(() => app)
const portal = chamarPortalEm(() => app)

beforeAll(async () => {
  await new Promise<void>((r) => destino.listen(0, '127.0.0.1', r))
  urlDoDestino = `http://127.0.0.1:${(destino.address() as AddressInfo).port}/gancho`
  app = await criarAppComRotas(
    [],
    configuracaoDeTeste({ ...configuracaoDoPortalDeTeste, ...TROCA }),
  )
  worker = await subirWorkerDeTeste(TROCA)
})
afterAll(async () => {
  await worker.parar()
  await app.close()
  await new Promise<void>((r) => destino.close(() => r()))
})

const definicao = (extra: Record<string, unknown> = {}) => ({
  campos: [
    {
      id: 'nome',
      tipo: 'texto',
      rotulo: 'Nome',
      obrigatorio: true,
      preenchimento: { fonte: 'contato.nome', travado: true },
    },
    { id: 'email', tipo: 'email', rotulo: 'E-mail', preenchimento: { fonte: 'contato.email' } },
    {
      id: 'vai',
      tipo: 'selecao',
      rotulo: 'Vai ao jantar?',
      obrigatorio: true,
      opcoes: [
        { valor: 'sim', rotulo: 'Sim' },
        { valor: 'nao', rotulo: 'Não' },
      ],
    },
    {
      id: 'acompanhantes',
      tipo: 'numero',
      rotulo: 'Acompanhantes',
      obrigatorio: true,
      maximo: 3,
      visivelQuando: {
        combinacao: 'todas',
        condicoes: [{ campo: 'vai', operador: 'igual', valor: 'sim' }],
      },
    },
  ],
  botoes: [{ id: 'enviar', rotulo: 'Enviar', acoes: [] }],
  ...extra,
})

async function cenario() {
  const { d, pessoa } = await empresaDeChamados(app)
  await configurarPortal(d.tenantId)
  const empresa = await novaEmpresaCliente(d)
  const editor = await pessoa('Editor de formulários', { 'portal.formularios': null })
  const leitor = await pessoa('Leitor', { 'portal.ver': null })
  const semPortal = await pessoa('Sem portal', { 'chamados.ver': 'propria' })
  const acesso = await novoAcesso(d, { empresaId: empresa, nome: 'Marta Lopes' })
  const cookie = await entrarNoPortal(portal, acesso)
  const criar = async (corpo: Record<string, unknown> = {}, publicar = true) => {
    const r = await crm('post', editor.cookie, '/portal-formularios', {
      nome: 'Jantar de fim de ano',
      acesso: 'logado',
      definicao: definicao(),
      ...corpo,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    if (publicar) {
      const p = await crm('post', editor.cookie, `/portal-formularios/${r.body.id}/publicar`)
      expect(p.status, JSON.stringify(p.body)).toBe(200)
      return p.body as { id: string; slug: string; versaoPublicada: number }
    }
    return r.body as { id: string; slug: string; versaoPublicada: number | null }
  }
  return { d, editor, leitor, semPortal, acesso, cookie, criar }
}

describe('permissões e ciclo de vida', () => {
  it('ver lista; formulários escreve; sem permissão do portal é 403', async () => {
    const c = await cenario()
    const f = await c.criar({}, false)
    expect((await crm('get', c.leitor.cookie, '/portal-formularios')).status).toBe(200)
    expect((await crm('get', c.semPortal.cookie, '/portal-formularios')).status).toBe(403)
    expect(
      (
        await crm('post', c.leitor.cookie, '/portal-formularios', {
          nome: 'X',
          definicao: definicao(),
        })
      ).status,
    ).toBe(403)
    expect(
      (await crm('post', c.leitor.cookie, `/portal-formularios/${f.id}/publicar`)).status,
    ).toBe(403)
  })

  it('rascunho não abre no portal; publicar cria a versão 1; mudar o rascunho não mexe na publicada', async () => {
    const c = await cenario()
    const f = await c.criar({}, false)
    expect(f.versaoPublicada).toBeNull()
    expect((await portal('get', `/portal/formularios/${f.id}`, { cookie: c.cookie })).status).toBe(
      404,
    )
    const pub = await crm('post', c.editor.cookie, `/portal-formularios/${f.id}/publicar`)
    expect(pub.body).toMatchObject({
      situacao: 'publicado',
      versaoPublicada: 1,
      temMudancas: false,
    })
    const salvo = await crm('put', c.editor.cookie, `/portal-formularios/${f.id}`, {
      nome: 'Jantar (novo)',
      acesso: 'logado',
      definicao: definicao({ mensagemDeSucesso: 'Até lá!' }),
    })
    expect(salvo.body).toMatchObject({ temMudancas: true, versaoPublicada: 1 })
    const aberto = await portal('get', `/portal/formularios/${f.id}`, { cookie: c.cookie })
    expect(aberto.body.versao).toBe(1)
    expect(aberto.body.definicao.mensagemDeSucesso).toBe('Recebemos sua resposta. Obrigado!')
    // Arquivado não abre
    await crm('put', c.editor.cookie, `/portal-formularios/${f.id}/arquivado`, { arquivado: true })
    expect((await portal('get', `/portal/formularios/${f.id}`, { cookie: c.cookie })).status).toBe(
      404,
    )
  })

  it('definição inválida não salva (400); duplicar cria um rascunho', async () => {
    const c = await cenario()
    const ruim = await crm('post', c.editor.cookie, '/portal-formularios', {
      nome: 'Ruim',
      definicao: {
        campos: [{ id: 'a', tipo: 'selecao', rotulo: 'A' }],
        botoes: [{ id: 'enviar', rotulo: 'Ok' }],
      },
    })
    expect(ruim.status).toBe(400)
    const f = await c.criar()
    const copia = await crm('post', c.editor.cookie, `/portal-formularios/${f.id}/duplicar`)
    expect(copia.status).toBe(201)
    expect(copia.body).toMatchObject({
      nome: 'Cópia de Jantar de fim de ano',
      situacao: 'rascunho',
    })
    expect(copia.body.slug).not.toBe(f.slug)
  })
})

describe('responder logado', () => {
  it('preenche pelo servidor, trava o nome, aplica a condição e guarda a versão', async () => {
    const c = await cenario()
    const f = await c.criar()
    const aberto = await portal('get', `/portal/formularios/${f.id}`, { cookie: c.cookie })
    expect(aberto.status).toBe(200)
    expect(aberto.body.preenchidos).toEqual({ nome: 'Marta Lopes', email: c.acesso.email })
    expect(aberto.body.travados).toEqual(['nome'])

    const invalida = await portal('post', `/portal/formularios/${f.id}/respostas`, {
      cookie: c.cookie,
      corpo: { versao: 1, botao: 'enviar', respostas: { vai: 'sim', acompanhantes: 9 } },
    })
    expect(invalida.status).toBe(422)
    expect(invalida.body.detalhes).toEqual([{ campo: 'acompanhantes', mensagem: 'no máximo 3' }])

    const ok = await portal('post', `/portal/formularios/${f.id}/respostas`, {
      cookie: c.cookie,
      corpo: {
        versao: 1,
        botao: 'enviar',
        respostas: { nome: 'Outro Nome', vai: 'nao', acompanhantes: 2, extra: 'x' },
      },
    })
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)
    const lista = await crm('get', c.leitor.cookie, `/portal-formularios/${f.id}/respostas`)
    expect(lista.body.total).toBe(1)
    expect(lista.body.itens[0]).toMatchObject({
      versao: 1,
      origem: 'portal',
      pessoa: 'Marta Lopes',
      // O nome travado vem da sessão; o e-mail (não travado) só vai se o navegador mandar; o campo escondido pela
      // condição e o desconhecido não são guardados
      valores: { nome: 'Marta Lopes', vai: 'nao' },
    })
    expect(lista.body.campos.map((x: { id: string }) => x.id)).toEqual([
      'nome',
      'email',
      'vai',
      'acompanhantes',
    ])

    // Republicado: quem responde com a versão antiga recebe 409
    await crm('post', c.editor.cookie, `/portal-formularios/${f.id}/publicar`)
    const velha = await portal('post', `/portal/formularios/${f.id}/respostas`, {
      cookie: c.cookie,
      corpo: { versao: 1, botao: 'enviar', respostas: { vai: 'nao' } },
    })
    expect(velha.status).toBe(409)
    expect(velha.body.erro).toBe('versao_desatualizada')
  })

  it('exporta CSV com BOM, ";" e sem fórmula de planilha', async () => {
    const c = await cenario()
    const f = await c.criar({
      definicao: {
        campos: [{ id: 'obs', tipo: 'texto', rotulo: 'Observação' }],
        botoes: [{ id: 'enviar', rotulo: 'Enviar' }],
      },
    })
    await portal('post', `/portal/formularios/${f.id}/respostas`, {
      cookie: c.cookie,
      corpo: { versao: 1, botao: 'enviar', respostas: { obs: '=HYPERLINK("x")' } },
    })
    const r = await crm('get', c.editor.cookie, `/portal-formularios/${f.id}/respostas.csv`)
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/text\/csv/)
    const texto = r.text
    expect(texto.charCodeAt(0)).toBe(0xfeff)
    expect(texto).toContain('Data;Origem;Pessoa;Empresa;Observação')
    expect(texto).toContain(`"'=HYPERLINK(""x"")"`)
    expect(
      (await crm('get', c.leitor.cookie, `/portal-formularios/${f.id}/respostas.csv`)).status,
    ).toBe(403)
  })

  it('outra empresa da equipe não abre o formulário', async () => {
    const a = await cenario()
    const b = await cenario()
    const f = await a.criar()
    expect((await portal('get', `/portal/formularios/${f.id}`, { cookie: b.cookie })).status).toBe(
      404,
    )
    expect((await crm('get', b.editor.cookie, `/portal-formularios/${f.id}`)).status).toBe(404)
  })
})

describe('formulário público', () => {
  it('só o público abre pelo endereço; exige aceite; a isca não grava', async () => {
    const c = await cenario()
    const logado = await c.criar()
    expect((await portal('get', `/portal/publico/formularios/${logado.slug}`)).status).toBe(404)
    const f = await c.criar({
      acesso: 'publico',
      definicao: {
        campos: [
          { id: 'nome', tipo: 'texto', rotulo: 'Nome', obrigatorio: true },
          { id: 'cnpj', tipo: 'cnpj', rotulo: 'CNPJ' },
        ],
        botoes: [{ id: 'enviar', rotulo: 'Quero me associar' }],
      },
    })
    const aberto = await portal('get', `/portal/publico/formularios/${f.slug}`)
    expect(aberto.status).toBe(200)
    expect(aberto.body).toMatchObject({ preenchidos: {}, travados: [], captchaChave: null })
    const corpo = {
      versao: 1,
      botao: 'enviar',
      respostas: { nome: 'Rui', cnpj: '11.222.333/0001-81' },
    }
    const sem = await portal('post', `/portal/publico/formularios/${f.slug}/respostas`, { corpo })
    expect(sem.status).toBe(422)
    expect(sem.body.erro).toBe('privacidade_obrigatoria')
    const ok = await portal('post', `/portal/publico/formularios/${f.slug}/respostas`, {
      corpo: { ...corpo, aceitaPrivacidade: true },
    })
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)
    const isca = await portal('post', `/portal/publico/formularios/${f.slug}/respostas`, {
      corpo: { ...corpo, aceitaPrivacidade: true, site: 'http://spam' },
    })
    expect(isca.status).toBe(201)
    expect(isca.body.id).toBeNull()
    const lista = await crm('get', c.editor.cookie, `/portal-formularios/${f.id}/respostas`)
    expect(lista.body.total).toBe(1)
    expect(lista.body.itens[0]).toMatchObject({
      origem: 'publico',
      valores: { cnpj: '11222333000181' },
    })
    const [linha] = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ consentimento_em: Date | null }[]>`
        SELECT consentimento_em FROM formulario_respostas WHERE id = ${ok.body.id}`,
    )
    expect(linha?.consentimento_em).not.toBeNull()
  })
})

describe('ações dos botões', () => {
  it('e-mail com {{campo}} e webhook assinado; o webhook que falha tenta de novo', async () => {
    await limparCaixa()
    recebidos.length = 0
    falharProximos = 1
    const c = await cenario()
    const f = await c.criar({
      definicao: {
        campos: [
          { id: 'nome', tipo: 'texto', rotulo: 'Nome', preenchimento: { fonte: 'contato.nome' } },
          { id: 'contato', tipo: 'email', rotulo: 'E-mail', obrigatorio: true },
        ],
        botoes: [
          {
            id: 'enviar',
            rotulo: 'Enviar',
            acoes: [
              {
                tipo: 'email',
                para: 'campo',
                campo: 'contato',
                assunto: 'Recebemos, {{nome}}',
                mensagem: 'Olá, {{nome}}! Sua inscrição chegou.',
              },
              { tipo: 'webhook', url: urlDoDestino },
            ],
          },
        ],
      },
    })
    const segredo = (await crm('post', c.editor.cookie, `/portal-formularios/${f.id}/segredo`)).body
      .segredo as string
    expect(segredo).toMatch(/^whsec_/)
    const destinoDoEmail = `confirma-${f.id.slice(-6)}@exemplo.com.br`
    const r = await portal('post', `/portal/formularios/${f.id}/respostas`, {
      cookie: c.cookie,
      corpo: { versao: 1, botao: 'enviar', respostas: { nome: 'Marta', contato: destinoDoEmail } },
    })
    expect(r.status).toBe(201)

    const email = await aguardarMensagem(destinoDoEmail)
    expect(email.Subject).toBe('Recebemos, Marta')
    expect(email.Text).toContain('Olá, Marta! Sua inscrição chegou.')

    await esperarAte(() => Promise.resolve(recebidos.length === 1), 30_000)
    const chegou = recebidos[0]
    expect(JSON.parse(chegou?.corpo ?? '{}')).toMatchObject({
      tipo: 'formulario.resposta',
      formulario: { id: f.id },
      valores: { nome: 'Marta', contato: destinoDoEmail },
    })
    expect(chegou?.assinatura).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    await esperarAte(async () => {
      const ex = await noTenant(
        c.d.tenantId,
        (tx) => tx<{ tipo: string; situacao: string }[]>`
          SELECT x.tipo, x.situacao::text AS situacao FROM formulario_acoes_execucoes x
          WHERE x.resposta_id = ${r.body.id} ORDER BY x.indice`,
      )
      return ex.length === 2 && ex.every((e) => e.situacao === 'ok')
    }, 30_000)
  }, 60_000)
})

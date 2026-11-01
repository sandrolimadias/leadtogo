/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- os corpos JSON do supertest chegam como any */
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import { esperarAte } from '../testes/espera.js'
import { aguardarMensagem, limparCaixa, primeiroLink } from '../testes/mailpit.js'
import {
  chamarPortalEm,
  configuracaoDoPortalDeTeste,
  configurarPortal,
  entrarNoPortal,
  novaEmpresaCliente,
  novoAcesso,
} from '../testes/portal.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import { diaUtilSeguinte } from './evento-crm.js'
import { dadosDaPessoa } from './eventos-inscricao.service.js'

let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const crm = chamarEm(() => app)
const portal = chamarPortalEm(() => app)

beforeAll(async () => {
  app = await criarAppComRotas([], configuracaoDeTeste(configuracaoDoPortalDeTeste))
  worker = await subirWorkerDeTeste()
  await limparCaixa()
})
afterAll(async () => {
  await worker.parar()
  await app.close()
})

const emDias = (dias: number, horas = 0) =>
  new Date(Date.now() + dias * 86_400_000 + horas * 3_600_000).toISOString()

const definicaoDeInscricao = {
  campos: [
    {
      id: 'nome',
      tipo: 'texto',
      rotulo: 'Nome',
      obrigatorio: true,
      preenchimento: { fonte: 'contato.nome', travado: false },
    },
    {
      id: 'email',
      tipo: 'email',
      rotulo: 'E-mail',
      obrigatorio: true,
      preenchimento: { fonte: 'contato.email' },
    },
    { id: 'restricao', tipo: 'texto', rotulo: 'Restrição alimentar' },
  ],
  botoes: [{ id: 'enviar', rotulo: 'Inscrever', acoes: [] }],
}
const definicaoDeAvaliacao = {
  campos: [{ id: 'nota', tipo: 'avaliacao', rotulo: 'Nota', obrigatorio: true }],
  botoes: [{ id: 'enviar', rotulo: 'Avaliar', acoes: [] }],
}

interface Cliente {
  cookie: string
  email: string
  acessoId: string
  contatoId: string
}

async function cenario() {
  const { d, pessoa } = await empresaDeChamados(app)
  await configurarPortal(d.tenantId)
  const empresa = await novaEmpresaCliente(d)
  const gestor = await pessoa('Gestor da agenda', {
    'portal.agenda': null,
    'portal.formularios': null,
  })
  const recepcao = await pessoa('Recepção', { 'portal.ver': null, 'portal.eventos_presenca': null })
  const leitor = await pessoa('Leitor', { 'portal.ver': null })
  const clientes: Cliente[] = []
  for (const nome of ['Ana Alves', 'Alex Abreu', 'Alice Araújo']) {
    const a = await novoAcesso(d, { empresaId: empresa, nome })
    clientes.push({
      cookie: await entrarNoPortal(portal, a),
      email: a.email,
      acessoId: a.acessoId,
      contatoId: a.contatoId,
    })
  }
  const formulario = async (finalidade: string, definicao: unknown) => {
    const r = await crm('post', gestor.cookie, '/portal-formularios', {
      nome: `Formulário ${finalidade}`,
      acesso: 'logado',
      finalidade,
      definicao,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const p = await crm('post', gestor.cookie, `/portal-formularios/${r.body.id}/publicar`)
    expect(p.status, JSON.stringify(p.body)).toBe(200)
    return r.body.id as string
  }
  const avaliacaoId = await formulario('avaliacao_evento', definicaoDeAvaliacao)
  const publicar = async (extra: Record<string, unknown> = {}) => {
    const r = await crm('post', gestor.cookie, '/portal-eventos', {
      titulo: 'Encontro anual de clientes',
      descricao: 'Inscrições abertas.',
      local: 'Auditório',
      linkOnline: null,
      inicioEm: emDias(5),
      fimEm: emDias(5, 3),
      vagasTotais: null,
      vagasPorEmpresa: null,
      prazoConfirmacao: null,
      alcance: 'todos',
      empresaIds: [],
      formularioAvaliacaoId: avaliacaoId,
      ...extra,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    const p = await crm('post', gestor.cookie, `/portal-eventos/${r.body.id}/publicar`)
    expect(p.status, JSON.stringify(p.body)).toBe(200)
    return r.body.id as string
  }
  /** Leva o evento para "acontecendo agora" (começou há 1 hora, acaba daqui a 2). */
  const comecar = (id: string) =>
    noTenant(
      d.tenantId,
      (tx) =>
        tx`UPDATE eventos SET inicio_em = now() - interval '1 hour', fim_em = now() + interval '2 hours' WHERE id = ${id}`,
    )
  return { d, empresa, gestor, recepcao, leitor, clientes, formulario, publicar, comecar }
}
type Cenario = Awaited<ReturnType<typeof cenario>>

const confirmar = (c: Cliente, id: string) =>
  portal('post', `/portal/eventos/${id}/confirmacao`, { cookie: c.cookie })
const participantes = async (c: Cenario, id: string) =>
  (await crm('get', c.gestor.cookie, `/portal-eventos/${id}/participantes`)).body as {
    confirmados: {
      id: string
      pessoa: string
      email: string
      presenca: string
      avaliou: boolean
      origem: string
      lembretes: number
    }[]
    cancelados: { id: string }[]
  }

describe('funções puras', () => {
  it('dia útil seguinte pula fim de semana e feriado', () => {
    // sexta-feira, 20/11/2026 às 15h (Brasília)
    const sexta = new Date('2026-11-20T18:00:00Z')
    expect(diaUtilSeguinte(sexta, new Set())).toBe('2026-11-23')
    expect(diaUtilSeguinte(sexta, new Set(['2026-11-23']))).toBe('2026-11-24')
    // quarta à noite em Brasília, já quinta em UTC: conta o dia local
    expect(diaUtilSeguinte(new Date('2026-11-19T01:30:00Z'), new Set())).toBe('2026-11-19')
  })

  it('tira nome, e-mail, telefone e CNPJ das respostas', () => {
    expect(
      dadosDaPessoa(
        {
          campos: [
            {
              id: 'quem',
              tipo: 'texto',
              rotulo: 'Nome',
              preenchimento: { fonte: 'contato.nome', travado: false },
            },
            { id: 'mail', tipo: 'email', rotulo: 'E-mail' },
            { id: 'fone', tipo: 'telefone', rotulo: 'Telefone' },
            { id: 'doc', tipo: 'cnpj', rotulo: 'CNPJ' },
          ],
          botoes: [],
        } as never,
        { quem: 'Ana', mail: 'ana@x.com', fone: '11999990000', doc: '11222333000181' },
      ),
    ).toEqual({ nome: 'Ana', email: 'ana@x.com', telefone: '11999990000', cnpj: '11222333000181' })
  })
})

describe('inscrição com formulário', () => {
  it('o formulário do evento inscreve; sem formulário é 409; formulário de outra finalidade é 422', async () => {
    const c = await cenario()
    const inscricaoId = await c.formulario('inscricao_evento', definicaoDeInscricao)
    const errado = await crm('post', c.gestor.cookie, '/portal-eventos', {
      titulo: 'Evento com formulário errado',
      descricao: null,
      local: null,
      linkOnline: null,
      inicioEm: emDias(5),
      fimEm: emDias(5, 1),
      vagasTotais: null,
      vagasPorEmpresa: null,
      prazoConfirmacao: null,
      alcance: 'todos',
      empresaIds: [],
      formularioInscricaoId: await c.formulario('livre', definicaoDeAvaliacao),
    })
    expect(errado.status, JSON.stringify(errado.body)).toBe(422)
    expect(errado.body.erro).toBe('formulario_invalido')

    const semForm = await c.publicar()
    const [ana, alex] = c.clientes as [Cliente, Cliente]
    expect(
      (
        await portal('post', `/portal/eventos/${semForm}/inscricao`, {
          cookie: ana.cookie,
          corpo: { versao: 1, respostas: {}, botao: 'enviar' },
        })
      ).status,
    ).toBe(409)

    const id = await c.publicar({ formularioInscricaoId: inscricaoId })
    const ev = await portal('get', `/portal/eventos/${id}`, { cookie: ana.cookie })
    expect(ev.body.formularioInscricaoId).toBe(inscricaoId)
    const r = await portal('post', `/portal/eventos/${id}/inscricao`, {
      cookie: ana.cookie,
      corpo: {
        versao: 1,
        respostas: { nome: 'Ana Alves', email: ana.email, restricao: 'Vegetariana' },
        botao: 'enviar',
      },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.minhaSituacao).toBe('confirmado')
    // campo obrigatório faltando: 422 e nada muda
    const falta = await portal('post', `/portal/eventos/${id}/inscricao`, {
      cookie: alex.cookie,
      corpo: { versao: 1, respostas: { nome: 'Alex' }, botao: 'enviar' },
    })
    expect(falta.status).toBe(422)
    const lista = await participantes(c, id)
    expect(lista.confirmados.map((p) => p.pessoa)).toEqual(['Ana Alves'])

    // o CSV traz a resposta do formulário; o Excel e a página de impressão também saem
    const csv = await request(app.getHttpServer())
      .get(`/v1/portal-eventos/${id}/inscritos.csv`)
      .set('Cookie', c.gestor.cookie)
    expect(csv.status).toBe(200)
    expect(csv.text).toContain('Vegetariana')
    expect(csv.text).toContain('Ana Alves')
    const xlsx = await request(app.getHttpServer())
      .get(`/v1/portal-eventos/${id}/inscritos.xlsx`)
      .set('Cookie', c.gestor.cookie)
      .buffer(true)
    expect(xlsx.status).toBe(200)
    expect(xlsx.headers['content-type']).toContain('spreadsheetml')
    const html = await request(app.getHttpServer())
      .get(`/v1/portal-eventos/${id}/inscritos.html`)
      .set('Cookie', c.gestor.cookie)
    expect(html.status).toBe(200)
    expect(html.text).toContain('Ana Alves')
    // o leitor não exporta
    expect(
      (
        await request(app.getHttpServer())
          .get(`/v1/portal-eventos/${id}/inscritos.csv`)
          .set('Cookie', c.leitor.cookie)
      ).status,
    ).toBe(403)
  })
})

describe('presença, encerramento e avaliação', () => {
  it('check-in pelo QR, presença manual, encerrar e só o presente avalia (uma vez)', async () => {
    const c = await cenario()
    const id = await c.publicar()
    const [ana, alex, alice] = c.clientes as [Cliente, Cliente, Cliente]
    for (const p of [ana, alex, alice]) expect((await confirmar(p, id)).status).toBe(200)

    // antes de começar: não encerra; o QR já pode ser gerado, mas o check-in está fechado
    expect((await crm('post', c.gestor.cookie, `/portal-eventos/${id}/encerrar`)).body.erro).toBe(
      'evento_nao_comecou',
    )
    expect((await crm('post', c.leitor.cookie, `/portal-eventos/${id}/checkin`)).status).toBe(403)
    const qr = await crm('post', c.gestor.cookie, `/portal-eventos/${id}/checkin`)
    expect(qr.status, JSON.stringify(qr.body)).toBe(200)
    const token = qr.body.token as string
    expect(qr.body.url).toContain(`/checkin/${token}`)
    const fechado = await portal('get', `/portal/publico/checkin/${token}`)
    expect(fechado.status).toBe(200)
    expect(fechado.body.aberto).toBe(false)
    expect(
      (await portal('post', `/portal/checkin/${token}`, { cookie: ana.cookie })).body.erro,
    ).toBe('checkin_fechado')

    await c.comecar(id)
    // logado: um toque
    const toque = await portal('post', `/portal/checkin/${token}`, { cookie: ana.cookie })
    expect(toque.status, JSON.stringify(toque.body)).toBe(200)
    expect(toque.body.situacao).toBe('registrado')
    // sem login, com o e-mail (o evento não exige código)
    const semLogin = await portal('post', `/portal/publico/checkin/${token}`, {
      corpo: { email: alex.email.toUpperCase() },
    })
    expect(semLogin.status, JSON.stringify(semLogin.body)).toBe(200)
    expect(semLogin.body.situacao).toBe('registrado')
    // e-mail sem inscrição
    expect(
      (await portal('post', `/portal/publico/checkin/${token}`, { corpo: { email: 'x@y.com' } }))
        .status,
    ).toBe(404)
    // token desconhecido
    expect((await portal('get', `/portal/publico/checkin/${token.slice(0, -2)}xx`)).status).toBe(
      404,
    )

    // a recepção marca e desmarca a presença manual; o leitor não
    let lista = await participantes(c, id)
    const daAlice = lista.confirmados.find((p) => p.email === alice.email)
    if (!daAlice) throw new Error('Alice não está na lista')
    const url = `/portal-eventos/${id}/participantes/${daAlice.id}/presenca`
    expect((await crm('put', c.leitor.cookie, url, { presente: true })).status).toBe(403)
    expect((await crm('put', c.recepcao.cookie, url, { presente: true })).status).toBe(200)
    expect((await crm('put', c.recepcao.cookie, url, { presente: false })).status).toBe(200)
    lista = await participantes(c, id)
    expect(Object.fromEntries(lista.confirmados.map((p) => [p.email, p.presenca]))).toEqual({
      [ana.email]: 'checkin_qr',
      [alex.email]: 'checkin_qr',
      [alice.email]: 'nao_registrada',
    })

    // a recepção não encerra; o gestor encerra: pede a avaliação a quem esteve presente
    expect((await crm('post', c.recepcao.cookie, `/portal-eventos/${id}/encerrar`)).status).toBe(
      403,
    )
    const fim = await crm('post', c.gestor.cookie, `/portal-eventos/${id}/encerrar`)
    expect(fim.status, JSON.stringify(fim.body)).toBe(200)
    expect((await crm('post', c.gestor.cookie, `/portal-eventos/${id}/encerrar`)).body.erro).toBe(
      'evento_ja_encerrado',
    )
    await esperarAte(async () => {
      const l = await participantes(c, id)
      return l.confirmados.filter((p) => p.lembretes > 0).length === 2
    })
    const sino = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<
          { contato_id: string }[]
        >`SELECT contato_id FROM notificacoes WHERE tipo = 'evento.avaliacao'`,
    )
    expect(sino.map((s) => s.contato_id).sort()).toEqual([ana.contatoId, alex.contatoId].sort())

    // só o presente avalia
    const ev = await portal('get', `/portal/eventos/${id}`, { cookie: ana.cookie })
    expect(ev.body.presente).toBe(true)
    expect(ev.body.avaliar).not.toBeNull()
    expect(
      (await portal('get', `/portal/eventos/${id}`, { cookie: alice.cookie })).body.avaliar,
    ).toBeNull()
    expect(
      (await portal('get', `/portal/eventos/${id}/avaliacao`, { cookie: alice.cookie })).status,
    ).toBe(409)
    const form = await portal('get', `/portal/eventos/${id}/avaliacao`, { cookie: ana.cookie })
    expect(form.status, JSON.stringify(form.body)).toBe(200)
    const avaliou = await portal('post', `/portal/eventos/${id}/avaliacao`, {
      cookie: ana.cookie,
      corpo: { versao: 1, respostas: { nota: 5 }, botao: 'enviar' },
    })
    expect(avaliou.status, JSON.stringify(avaliou.body)).toBe(201)
    expect(avaliou.body.avaliar).toBeNull()
    const de_novo = await portal('post', `/portal/eventos/${id}/avaliacao`, {
      cookie: ana.cookie,
      corpo: { versao: 1, respostas: { nota: 1 }, botao: 'enviar' },
    })
    expect(de_novo.status).toBe(409)

    // reenviar: só para quem falta (Alex), até o máximo de lembretes
    const reenvio = await crm(
      'post',
      c.gestor.cookie,
      `/portal-eventos/${id}/avaliacoes/reenviar`,
      {},
    )
    expect(reenvio.status, JSON.stringify(reenvio.body)).toBe(200)
    await esperarAte(async () => {
      const l = await participantes(c, id)
      return l.confirmados.find((p) => p.email === alex.email)?.lembretes === 2
    })
    // a aba Eventos da ficha da empresa: presença e nota
    const ficha = await crm('get', c.d.cookie, `/empresas/${c.empresa}/eventos`)
    expect(ficha.status, JSON.stringify(ficha.body)).toBe(200)
    expect(
      Object.fromEntries(
        ficha.body.itens.map((i: { pessoa: string; presenca: string; nota: number | null }) => [
          i.pessoa,
          `${i.presenca}:${String(i.nota)}`,
        ]),
      ),
    ).toEqual({
      'Ana Alves': 'checkin_qr:5',
      'Alex Abreu': 'checkin_qr:null',
      'Alice Araújo': 'nao_registrada:null',
    })
    expect((await crm('get', c.leitor.cookie, `/empresas/${c.empresa}/eventos`)).status).toBe(403)
    const detalhe = await crm('get', c.gestor.cookie, `/portal-eventos/${id}`)
    expect(detalhe.body.presentes).toBe(2)
    expect(detalhe.body.avaliaram).toBe(1)
  })

  it('check-in com código por e-mail: o primeiro passo manda o código e o errado conta tentativa', async () => {
    const c = await cenario()
    const id = await c.publicar({ checkinExigeCodigo: true })
    const ana = c.clientes[0] as Cliente
    expect((await confirmar(ana, id)).status).toBe(200)
    await c.comecar(id)
    const token = (await crm('post', c.gestor.cookie, `/portal-eventos/${id}/checkin`)).body
      .token as string
    expect((await portal('get', `/portal/publico/checkin/${token}`)).body.exigeCodigo).toBe(true)
    const passo1 = await portal('post', `/portal/publico/checkin/${token}`, {
      corpo: { email: ana.email },
    })
    expect(passo1.body.situacao).toBe('codigo_enviado')
    const mensagem = await aguardarMensagem(ana.email)
    const achado = /(\d{3}) (\d{3})/.exec(mensagem.Text)
    const codigo = achado ? `${achado[1]}${achado[2]}` : null
    if (!codigo) throw new Error('E-mail sem código')
    const errado = codigo === '000000' ? '111111' : '000000'
    const ruim = await portal('post', `/portal/publico/checkin/${token}`, {
      corpo: { email: ana.email, codigo: errado },
    })
    expect(ruim.status).toBe(401)
    const tentativas = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<
          { tentativas: number }[]
        >`SELECT tentativas FROM portal_codigos WHERE email = ${ana.email} AND usado_em IS NULL`,
    )
    expect(tentativas[0]?.tentativas).toBe(1)
    const ok = await portal('post', `/portal/publico/checkin/${token}`, {
      corpo: { email: ana.email, codigo },
    })
    expect(ok.status, JSON.stringify(ok.body)).toBe(200)
    expect(ok.body.situacao).toBe('registrado')
    // gerar outro QR invalida o anterior
    await crm('post', c.gestor.cookie, `/portal-eventos/${id}/checkin`)
    expect((await portal('get', `/portal/publico/checkin/${token}`)).status).toBe(404)
  })
})

describe('participante sem acesso ao portal', () => {
  it('a equipe inclui quem veio; o pedido de avaliação vai por e-mail com link pessoal', async () => {
    const c = await cenario()
    await noTenant(
      c.d.tenantId,
      (tx) =>
        tx`UPDATE tenant_configuracoes SET portal_avaliacao_por_email = true WHERE tenant_id = ${c.d.tenantId}`,
    )
    const id = await c.publicar()
    const email = `visitante-${Date.now()}@exemplo.com`
    await c.comecar(id)
    const incluiu = await crm('post', c.recepcao.cookie, `/portal-eventos/${id}/participantes`, {
      nome: 'Visitante da Silva',
      email,
    })
    expect(incluiu.status, JSON.stringify(incluiu.body)).toBe(201)
    const p = incluiu.body.confirmados.find((x: { email: string }) => x.email === email)
    expect(p.origem).toBe('equipe')
    expect(p.presenca).toBe('manual')
    expect(p.empresa).toBeNull()

    expect((await crm('post', c.gestor.cookie, `/portal-eventos/${id}/encerrar`)).status).toBe(200)
    const mensagem = await aguardarMensagem(email)
    const link = primeiroLink(mensagem)
    const token = link.split('/avaliacao/')[1] as string
    const aberto = await portal('get', `/portal/publico/avaliacao/${token}`)
    expect(aberto.status, JSON.stringify(aberto.body)).toBe(200)
    expect(aberto.body.evento).toBe('Encontro anual de clientes')
    const enviada = await portal('post', `/portal/publico/avaliacao/${token}`, {
      corpo: { versao: 1, respostas: { nota: 4 }, botao: 'enviar' },
    })
    expect(enviada.status, JSON.stringify(enviada.body)).toBe(201)
    expect((await portal('get', `/portal/publico/avaliacao/${token}`)).status).toBe(409)
    expect(
      (
        await portal('post', `/portal/publico/avaliacao/${token}`, {
          corpo: { versao: 1, respostas: { nota: 4 }, botao: 'enviar' },
        })
      ).status,
    ).toBe(409)
    expect((await participantes(c, id)).confirmados.find((x) => x.email === email)?.avaliou).toBe(
      true,
    )
  })
})

describe('vínculo com o CRM', () => {
  it('desligado não faz nada; ligado cria a empresa (Lead), o contato e a tarefa para o dia útil seguinte', async () => {
    const c = await cenario()
    const [admin] = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${c.d.usuarioId}`,
    )
    // o responsável tem de ser administrador ou gestor
    const invalido = await crm('put', c.d.cookie, '/portal-configuracao', {
      eventosCrmAtivo: true,
      eventosCrmResponsavelId: c.leitor.membroId,
    })
    expect(invalido.status).toBe(422)
    expect(
      (await crm('put', c.d.cookie, '/portal-configuracao', { eventosCrmAtivo: true })).status,
    ).toBe(422)

    const id = await c.publicar()
    await c.comecar(id)
    const cnpjDesligado = '11222333000181'
    await crm('post', c.recepcao.cookie, `/portal-eventos/${id}/participantes`, {
      nome: 'Pessoa Um',
      email: `um-${Date.now()}@exemplo.com`,
      cnpj: cnpjDesligado,
    })

    const ligou = await crm('put', c.d.cookie, '/portal-configuracao', {
      eventosCrmAtivo: true,
      eventosCrmResponsavelId: admin?.id,
    })
    expect(ligou.status, JSON.stringify(ligou.body)).toBe(200)
    expect(ligou.body.eventosCrmAtivo).toBe(true)
    const cnpj = '19131243000197'
    const email = `dois-${Date.now()}@exemplo.com`
    const r = await crm('post', c.recepcao.cookie, `/portal-eventos/${id}/participantes`, {
      nome: 'Pessoa Dois',
      email,
      telefone: '(11) 98888-7777',
      cnpj: '19.131.243/0001-97',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)

    await esperarAte(async () => {
      const [x] = await noTenant(
        c.d.tenantId,
        (tx) =>
          tx<
            { ok: boolean }[]
          >`SELECT crm_tratado_em IS NOT NULL AS ok FROM evento_confirmacoes WHERE email = ${email}`,
      )
      return x?.ok === true
    }, 20_000)
    const empresas = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ documento: string }[]>`
          SELECT documento FROM empresas WHERE documento IN (${cnpj}, ${cnpjDesligado})`,
    )
    expect(empresas.map((e) => e.documento)).toEqual([cnpj])
    const tarefas = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ titulo: string; responsavel_id: string; contato_id: string | null }[]>`
          SELECT titulo, responsavel_id, contato_id FROM atividades WHERE titulo LIKE 'Contato pós-evento%'`,
    )
    expect(tarefas).toHaveLength(1)
    expect(tarefas[0]?.responsavel_id).toBe(admin?.id)
    const [contato] = await noTenant(
      c.d.tenantId,
      (tx) =>
        tx<{ contato_id: string }[]>`SELECT contato_id FROM contato_emails WHERE email = ${email}`,
    )
    expect(tarefas[0]?.contato_id).toBe(contato?.contato_id)
  })
})

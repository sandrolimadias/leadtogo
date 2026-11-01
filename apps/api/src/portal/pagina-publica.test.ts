/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- os corpos JSON do supertest chegam como any */
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../testes/chamados.js'
import { esperarAte } from '../testes/espera.js'
import { chamarPortalEm, configuracaoDoPortalDeTeste, configurarPortal } from '../testes/portal.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import { disponibilidade } from './pagina-publica.service.js'

let app: INestApplication<Server>
let worker: Awaited<ReturnType<typeof subirWorkerDeTeste>>
const crm = chamarEm(() => app)
const portal = chamarPortalEm(() => app)

beforeAll(async () => {
  app = await criarAppComRotas([], configuracaoDeTeste(configuracaoDoPortalDeTeste))
  worker = await subirWorkerDeTeste()
})
afterAll(async () => {
  await worker.parar()
  await app.close()
})

const emDias = (dias: number, horas = 0) =>
  new Date(Date.now() + dias * 86_400_000 + horas * 3_600_000).toISOString()
let sequencia = 0
const novoSlug = () => `portal-${Date.now().toString(36)}-${(sequencia++).toString(36)}`

async function cenario() {
  const { d, pessoa } = await empresaDeChamados(app)
  await configurarPortal(d.tenantId)
  const gestor = await pessoa('Gestor da agenda', {
    'portal.agenda': null,
    'portal.formularios': null,
  })
  const slug = novoSlug()
  const publicar = async (extra: Record<string, unknown> = {}) => {
    const r = await crm('post', gestor.cookie, '/portal-eventos', {
      titulo: 'Encontro aberto',
      descricao: 'Para todos.',
      local: 'Auditório',
      linkOnline: null,
      inicioEm: emDias(5),
      fimEm: emDias(5, 2),
      vagasTotais: null,
      vagasPorEmpresa: null,
      prazoConfirmacao: null,
      alcance: 'todos',
      empresaIds: [],
      publico: true,
      ...extra,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect((await crm('post', gestor.cookie, `/portal-eventos/${r.body.id}/publicar`)).status).toBe(
      200,
    )
    return r.body.id as string
  }
  const formulario = async (finalidade: string, definicao: unknown) => {
    const r = await crm('post', gestor.cookie, '/portal-formularios', {
      nome: `Formulário ${finalidade}`,
      acesso: 'publico',
      captcha: false,
      finalidade,
      definicao,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(
      (await crm('post', gestor.cookie, `/portal-formularios/${r.body.id}/publicar`)).status,
    ).toBe(200)
    return r.body.id as string
  }
  return { d, gestor, slug, publicar, formulario }
}

const inscricao = (respostas: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  versao: 1,
  botao: 'enviar',
  respostas,
  aceitaPrivacidade: true,
  ...extra,
})

describe('disponibilidade', () => {
  it('sem limite, poucas vagas e lotado', () => {
    expect(disponibilidade(null, 500)).toBe('disponivel')
    expect(disponibilidade(100, 10)).toBe('disponivel')
    expect(disponibilidade(100, 80)).toBe('poucas_vagas')
    expect(disponibilidade(10, 6)).toBe('poucas_vagas')
    expect(disponibilidade(10, 10)).toBe('lotado')
  })
})

describe('página pública de eventos', () => {
  it('só com o endereço e a página ligados; só eventos para todos; o endereço é único', async () => {
    const c = await cenario()
    const aberto = await c.publicar()
    const soAssociados = await c.publicar({ titulo: 'Só para associados', publico: false })
    expect((await portal('get', `/portal/publico/paginas/${c.slug}`)).status).toBe(404)
    // ligar sem endereço: 422; endereço inválido: 400
    expect(
      (await crm('put', c.d.cookie, '/portal-configuracao', { paginaEventosAtiva: true })).body
        .erro,
    ).toBe('slug_obrigatorio')
    expect((await crm('put', c.d.cookie, '/portal-configuracao', { slug: '-Ruim-' })).status).toBe(
      400,
    )
    const ligou = await crm('put', c.d.cookie, '/portal-configuracao', {
      slug: c.slug,
      paginaEventosAtiva: true,
    })
    expect(ligou.status, JSON.stringify(ligou.body)).toBe(200)
    expect(ligou.body.slug).toBe(c.slug)

    const p = await portal('get', `/portal/publico/paginas/${c.slug}`)
    expect(p.status, JSON.stringify(p.body)).toBe(200)
    expect(p.body.associacao).toBe(false)
    const porId = Object.fromEntries(
      p.body.eventos.map((e: { id: string; inscricaoAberta: boolean }) => [
        e.id,
        e.inscricaoAberta,
      ]),
    )
    expect(porId).toEqual({ [aberto]: true, [soAssociados]: false })
    expect(JSON.stringify(p.body)).not.toContain('confirmados')

    // outro portal não pega o mesmo endereço
    const outro = await cenario()
    const conflito = await crm('put', outro.d.cookie, '/portal-configuracao', { slug: c.slug })
    expect(conflito.status).toBe(409)
    expect(conflito.body.erro).toBe('slug_em_uso')

    // desligar a página tira do ar
    await crm('put', c.d.cookie, '/portal-configuracao', { paginaEventosAtiva: false })
    expect((await portal('get', `/portal/publico/paginas/${c.slug}`)).status).toBe(404)
  })
})

describe('inscrição pública', () => {
  it('aceite obrigatório, isca, não duplica, exclusivo de associados e o CRM pelo CNPJ', async () => {
    const c = await cenario()
    await crm('put', c.d.cookie, '/portal-configuracao', {
      slug: c.slug,
      paginaEventosAtiva: true,
    })
    const id = await c.publicar()
    const soAssociados = await c.publicar({ titulo: 'Só associados', publico: false })
    const base = `/portal/publico/paginas/${c.slug}/eventos`

    const form = await portal('get', `${base}/${id}/inscricao`)
    expect(form.status, JSON.stringify(form.body)).toBe(200)
    expect(form.body.definicao.campos.map((x: { id: string }) => x.id)).toEqual([
      'nome',
      'email',
      'telefone',
      'cnpj',
    ])
    expect((await portal('get', `${base}/${soAssociados}/inscricao`)).status).toBe(403)

    const email = `publico-${Date.now()}@exemplo.com`
    const respostas = { nome: 'Pessoa Pública', email }
    const semAceite = await portal('post', `${base}/${id}/inscricao`, {
      corpo: inscricao(respostas, { aceitaPrivacidade: false }),
    })
    expect(semAceite.status).toBe(422)
    // isca: sucesso falso, nada gravado
    const isca = await portal('post', `${base}/${id}/inscricao`, {
      corpo: inscricao(respostas, { site: 'http://spam' }),
    })
    expect(isca.status).toBe(201)
    const conta = async () =>
      (
        await noTenant(
          c.d.tenantId,
          (tx) =>
            tx<
              { n: number }[]
            >`SELECT count(*)::int AS n FROM evento_confirmacoes WHERE evento_id = ${id}`,
        )
      )[0]?.n
    expect(await conta()).toBe(0)
    const ok = await portal('post', `${base}/${id}/inscricao`, { corpo: inscricao(respostas) })
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)
    expect(ok.body.situacao).toBe('confirmado')
    const de_novo = await portal('post', `${base}/${id}/inscricao`, {
      corpo: inscricao({ ...respostas, email: email.toUpperCase() }),
    })
    expect(de_novo.status).toBe(201)
    expect(await conta()).toBe(1)
    expect(
      (await portal('post', `${base}/${soAssociados}/inscricao`, { corpo: inscricao(respostas) }))
        .status,
    ).toBe(403)
    // a equipe vê a inscrição pública, sem empresa
    const lista = await crm('get', c.gestor.cookie, `/portal-eventos/${id}/participantes`)
    expect(lista.body.confirmados[0].origem).toBe('publico')
    expect(lista.body.confirmados[0].empresa).toBeNull()

    // com o vínculo ligado, o CNPJ vai ao CRM como Lead
    const [admin] = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${c.d.usuarioId}`,
    )
    expect(
      (
        await crm('put', c.d.cookie, '/portal-configuracao', {
          eventosCrmAtivo: true,
          eventosCrmResponsavelId: admin?.id,
        })
      ).status,
    ).toBe(200)
    const emailCnpj = `cnpj-${Date.now()}@exemplo.com`
    const comCnpj = await portal('post', `${base}/${id}/inscricao`, {
      corpo: inscricao({ nome: 'Com CNPJ', email: emailCnpj, cnpj: '19.131.243/0001-97' }),
    })
    expect(comCnpj.status, JSON.stringify(comCnpj.body)).toBe(201)
    await esperarAte(async () => {
      const [x] = await noTenant(
        c.d.tenantId,
        (tx) =>
          tx<
            { ok: boolean }[]
          >`SELECT crm_tratado_em IS NOT NULL AS ok FROM evento_confirmacoes WHERE email = ${emailCnpj}`,
      )
      return x?.ok === true
    }, 20_000)
    const [empresa] = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM empresas WHERE documento = '19131243000197'`,
    )
    expect(empresa).toBeDefined()
  })
})

describe('Seja um Associado', () => {
  it('sem formulário é 404; com formulário grava a resposta e, com CNPJ, cria a tarefa do responsável', async () => {
    const c = await cenario()
    await crm('put', c.d.cookie, '/portal-configuracao', {
      slug: c.slug,
      paginaEventosAtiva: true,
    })
    const base = `/portal/publico/paginas/${c.slug}/associacao`
    expect((await portal('get', base)).status).toBe(404)
    const formId = await c.formulario('associacao', {
      campos: [
        { id: 'nome', tipo: 'texto', rotulo: 'Nome', obrigatorio: true },
        { id: 'email', tipo: 'email', rotulo: 'E-mail', obrigatorio: true },
        { id: 'cnpj', tipo: 'cnpj', rotulo: 'CNPJ', obrigatorio: true },
      ],
      botoes: [{ id: 'enviar', rotulo: 'Quero me associar', acoes: [] }],
    })
    // formulário de outra finalidade é recusado
    const livre = await c.formulario('livre', {
      campos: [{ id: 'nome', tipo: 'texto', rotulo: 'Nome' }],
      botoes: [{ id: 'enviar', rotulo: 'Enviar', acoes: [] }],
    })
    expect(
      (await crm('put', c.d.cookie, '/portal-configuracao', { formularioAssociacaoId: livre }))
        .status,
    ).toBe(422)
    const [admin] = await noTenant(
      c.d.tenantId,
      (tx) => tx<{ id: string }[]>`SELECT id FROM membros WHERE usuario_id = ${c.d.usuarioId}`,
    )
    expect(
      (
        await crm('put', c.d.cookie, '/portal-configuracao', {
          formularioAssociacaoId: formId,
          eventosCrmAtivo: true,
          eventosCrmResponsavelId: admin?.id,
        })
      ).status,
    ).toBe(200)
    expect((await portal('get', `/portal/publico/paginas/${c.slug}`)).body.associacao).toBe(true)
    const f = await portal('get', base)
    expect(f.status).toBe(200)
    const enviado = await portal('post', base, {
      corpo: {
        versao: f.body.versao,
        botao: 'enviar',
        respostas: {
          nome: 'Nova Associada',
          email: `associada-${Date.now()}@exemplo.com`,
          cnpj: '11222333000181',
        },
        aceitaPrivacidade: true,
      },
    })
    expect(enviado.status, JSON.stringify(enviado.body)).toBe(201)
    await esperarAte(async () => {
      const t = await noTenant(
        c.d.tenantId,
        (tx) =>
          tx<
            { responsavel_id: string }[]
          >`SELECT responsavel_id FROM atividades WHERE titulo = 'Pedido de associação: Nova Associada'`,
      )
      return t[0]?.responsavel_id === admin?.id
    }, 20_000)
    const respostas = await crm('get', c.gestor.cookie, `/portal-formularios/${formId}/respostas`)
    expect(respostas.body.total).toBe(1)
  })
})

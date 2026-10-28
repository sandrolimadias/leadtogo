/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment -- os corpos JSON do supertest chegam como any */
import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { configuracaoDeTeste, criarAppComRotas } from '../../testes/app-teste.js'
import { cnpjUnico } from '../../testes/auth-teste.js'
import { chamarEm, empresaDeChamados, noTenant } from '../../testes/chamados.js'
import { auditoriaDe } from '../../testes/mundo.js'

let app: INestApplication<Server>
const crm = chamarEm(() => app)

beforeAll(async () => {
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterAll(async () => {
  await app.close()
})

let ip = 0
type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete'
const api =
  (token: string) =>
  (metodo: Metodo, url: string, corpo?: unknown, cabecalhos: Record<string, string> = {}) => {
    ip += 1
    let r = request(app.getHttpServer())
      [metodo](`/v1/publica${url}`)
      .set('X-Forwarded-For', `10.88.${Math.floor(ip / 250)}.${ip % 250}`)
      .set('Authorization', `Bearer ${token}`)
    for (const [k, v] of Object.entries(cabecalhos)) r = r.set(k, v)
    return corpo === undefined ? r : r.send(corpo as object)
  }

const TODAS = [
  'empresas.ver',
  'empresas.criar',
  'empresas.editar',
  'contatos.ver',
  'contatos.criar',
  'contatos.editar',
  'oportunidades.ver',
  'oportunidades.criar',
  'oportunidades.editar',
  'atividades.ver',
  'atividades.criar',
  'atividades.editar',
]

/** Empresa (tenant) com o admin, uma vendedora e uma chave com todas as permissões de integração. */
async function cenario(permissoes: string[] = TODAS, corpo: Record<string, unknown> = {}) {
  const { d, adminId, pessoa } = await empresaDeChamados(app)
  const vendedora = await pessoa('Vendedora', { 'empresas.ver': 'propria' })
  const [email] = await noTenant(
    d.tenantId,
    (tx) => tx<{ email: string }[]>`
    UPDATE membros SET email = ${`vendedora-${vendedora.membroId.slice(-8)}@exemplo.com`}
    WHERE id = ${vendedora.membroId} RETURNING email::text AS email`,
  )
  const r = await crm('post', d.cookie, '/integracoes/chaves', {
    nome: 'n8n',
    permissoes,
    responsavelPadraoId: vendedora.membroId,
    ...corpo,
  })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const token = (r.body as { token: string }).token
  return { d, adminId, vendedora, emailDaVendedora: email?.email ?? '', chamar: api(token), token }
}

describe('API pública: identidade e cadastros', () => {
  it('GET /eu mostra a empresa, a chave e as permissões; cadastros pela chave do sistema', async () => {
    const { d, chamar } = await cenario()
    const eu = await chamar('get', '/eu')
    expect(eu.status, JSON.stringify(eu.body)).toBe(200)
    expect(eu.body.empresa.id).toBe(d.tenantId)
    expect(eu.body.chave.nome).toBe('n8n')
    expect(eu.body.permissoes).toContain('empresas.criar')
    expect(eu.body.limites).toEqual({ por_minuto: 120, por_dia: 20000 })

    const tags = await chamar('get', '/tags')
    expect(tags.status).toBe(200)
    expect(tags.body.dados.map((t: { chave_sistema: string | null }) => t.chave_sistema)).toEqual(
      expect.arrayContaining(['lead', 'prospect', 'cliente', 'inativo', 'visitada', 'contactada']),
    )
    const tipos = await chamar('get', '/tipos-atividade')
    expect(tipos.body.dados.map((t: { chave_sistema: string }) => t.chave_sistema)).toContain(
      'ligacao',
    )
    const funis = await chamar('get', '/funis')
    expect(funis.body.dados[0].fases.length).toBeGreaterThan(0)
    const membros = await chamar('get', '/membros')
    expect(JSON.stringify(membros.body)).not.toContain('Integração:')
  })
})

describe('API pública: empresas', () => {
  it('cadastra com o responsável padrão da chave, consulta a Receita pelo worker e lê pelo CNPJ', async () => {
    const { d, vendedora, chamar } = await cenario()
    const cnpj = cnpjUnico()
    const r = await chamar('post', '/empresas', {
      documento: cnpj,
      razao_social: 'Associada Teste Ltda',
      telefones: [{ numero: '(27) 99999-0000' }],
      endereco: { cep: '29000-000', logradouro: 'Rua A', numero: '10' },
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.responsavel.id).toBe(vendedora.membroId)
    expect(r.body.status.chave_sistema).toBe('lead')
    expect(r.body.receita.situacao_nao_verificada).toBe(true)
    expect(r.body.telefones[0].e164).toBe('+5527999990000')
    expect(r.body.endereco.cep).toBe('29000000')

    const porCnpj = await chamar('get', `/empresas/cnpj/${cnpj}`)
    expect(porCnpj.status).toBe(200)
    expect(porCnpj.body.id).toBe(r.body.id)

    // A auditoria registra a integração como autora, e a origem do cadastro é "api"
    const registro = (await auditoriaDe(d.tenantId)).find(
      (a) => a.entidade === 'empresa' && a.entidade_id === r.body.id && a.acao === 'criar',
    )
    expect(registro?.origem).toBe('integracao')
    const [linha] = await noTenant(
      d.tenantId,
      (tx) => tx<{ origem_cadastro: string }[]>`
      SELECT origem_cadastro FROM empresas WHERE id = ${r.body.id as string}`,
    )
    expect(linha?.origem_cadastro).toBe('api')

    // CNPJ repetido: 409
    const repetido = await chamar('post', '/empresas', { documento: cnpj, razao_social: 'Outra' })
    expect(repetido.status).toBe(409)
  })

  it('responsável pelo e-mail; sem responsável e sem padrão: 422', async () => {
    const { emailDaVendedora, vendedora, chamar } = await cenario(TODAS, {
      responsavelPadraoId: null,
    })
    const sem = await chamar('post', '/empresas', {
      documento: cnpjUnico(),
      razao_social: 'Sem dono',
    })
    expect(sem.status).toBe(422)
    expect(sem.body.erro).toBe('responsavel_obrigatorio')
    const ok = await chamar('post', '/empresas', {
      documento: cnpjUnico(),
      razao_social: 'Com dono',
      responsavel_email: emailDaVendedora,
      consultar_receita: false,
    })
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)
    expect(ok.body.responsavel.id).toBe(vendedora.membroId)
    expect(ok.body.receita.situacao_nao_verificada).toBe(false)
  })

  it('tags pela chave do sistema: Status substitui; grupo automático é recusado; filtro por status', async () => {
    const { d, chamar } = await cenario()
    const r = await chamar('post', '/empresas', {
      documento: cnpjUnico(),
      razao_social: 'Vira cliente',
    })
    const id = r.body.id as string
    // Renomear a tag não muda nada: a API acha pela chave do sistema
    await noTenant(
      d.tenantId,
      (tx) => tx`UPDATE tags SET nome = 'Associado' WHERE chave_sistema = 'cliente'`,
    )
    const aplicada = await chamar('put', `/empresas/${id}/tags/cliente`)
    expect(aplicada.status, JSON.stringify(aplicada.body)).toBe(200)
    expect(aplicada.body.status.nome).toBe('Associado')
    expect(aplicada.body.tags.map((t: { chave_sistema: string }) => t.chave_sistema)).not.toContain(
      'lead',
    )
    expect((await chamar('put', `/empresas/${id}/tags/visitada`)).status).toBe(400)
    expect((await chamar('put', `/empresas/${id}/tags/nao-existe`)).status).toBe(422)

    const clientes = await chamar('get', '/empresas?status=cliente')
    expect(clientes.body.dados.map((e: { id: string }) => e.id)).toEqual([id])
    const leads = await chamar('get', '/empresas?status=lead')
    expect(leads.body.dados.map((e: { id: string }) => e.id)).not.toContain(id)
  })

  it('paginação por cursor e atualizado_desde', async () => {
    const { chamar } = await cenario()
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const r = await chamar('post', '/empresas', {
        documento: cnpjUnico(),
        razao_social: `Empresa ${i}`,
        consultar_receita: false,
      })
      ids.push(r.body.id as string)
    }
    const vistos: string[] = []
    let cursor: string | null = null
    do {
      const pagina = await chamar('get', `/empresas?limite=2${cursor ? `&cursor=${cursor}` : ''}`)
      expect(pagina.status).toBe(200)
      expect(pagina.body.dados.length).toBeLessThanOrEqual(2)
      vistos.push(...pagina.body.dados.map((e: { id: string }) => e.id))
      cursor = pagina.body.proximo_cursor as string | null
    } while (cursor)
    expect(vistos).toEqual(ids)
    expect((await chamar('get', '/empresas?limite=201')).status).toBe(400)
    expect((await chamar('get', '/empresas?cursor=lixo')).status).toBe(400)
    const futuro = await chamar(
      'get',
      `/empresas?atualizado_desde=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`,
    )
    expect(futuro.body.dados).toEqual([])
  })

  it('lote: cria e atualiza pelo CNPJ; um item ruim não derruba o lote', async () => {
    const { chamar } = await cenario()
    const existente = cnpjUnico()
    const criada = await chamar('post', '/empresas', {
      documento: existente,
      razao_social: 'Antiga',
      consultar_receita: false,
    })
    const novo = cnpjUnico()
    const r = await chamar('post', '/empresas/lote', {
      empresas: [
        { documento: existente, razao_social: 'Antiga Renomeada' },
        { documento: novo, razao_social: 'Nova do lote', consultar_receita: false },
        { documento: '123', razao_social: 'CNPJ ruim' },
        {
          documento: cnpjUnico(),
          razao_social: 'Responsável inválido',
          responsavel_email: 'ninguem@exemplo.com',
        },
      ],
    })
    expect(r.status, JSON.stringify(r.body)).toBe(200)
    expect(r.body.resumo).toEqual({ criados: 1, atualizados: 1, ignorados: 0, erros: 2 })
    expect(r.body.itens.map((i: { resultado: string }) => i.resultado)).toEqual([
      'atualizado',
      'criado',
      'erro',
      'erro',
    ])
    expect(r.body.itens[0].id).toBe(criada.body.id)
    expect(r.body.itens[3].erro.codigo).toBe('responsavel_invalido')
    const lida = await chamar('get', `/empresas/${criada.body.id as string}`)
    expect(lida.body.razao_social).toBe('Antiga Renomeada')
    expect((await chamar('get', `/empresas/cnpj/${novo}`)).status).toBe(200)
  })

  it('trocar o responsável exige empresas.transferir', async () => {
    const { adminId, chamar } = await cenario()
    const r = await chamar('post', '/empresas', {
      documento: cnpjUnico(),
      razao_social: 'Troca',
      consultar_receita: false,
    })
    const troca = await chamar('patch', `/empresas/${r.body.id as string}`, {
      responsavel_id: adminId,
    })
    expect(troca.status).toBe(403)
    const nome = await chamar('patch', `/empresas/${r.body.id as string}`, {
      nome_fantasia: 'Fantasia',
    })
    expect(nome.status).toBe(200)
    expect(nome.body.nome).toBe('Fantasia')
  })
})

describe('API pública: idempotência', () => {
  it('mesma chave e corpo: mesma resposta, sem duplicar; outro corpo: 409', async () => {
    const { chamar } = await cenario()
    const corpo = { documento: cnpjUnico(), razao_social: 'Idempotente', consultar_receita: false }
    const a = await chamar('post', '/empresas', corpo, { 'Idempotency-Key': 'abc-1' })
    const b = await chamar('post', '/empresas', corpo, { 'Idempotency-Key': 'abc-1' })
    expect(a.status).toBe(201)
    expect(b.status).toBe(201)
    expect(b.headers['idempotent-replayed']).toBe('true')
    expect(b.body.id).toBe(a.body.id)
    const c = await chamar(
      'post',
      '/empresas',
      { ...corpo, razao_social: 'Outra' },
      { 'Idempotency-Key': 'abc-1' },
    )
    expect(c.status).toBe(409)
    expect(c.body.erro).toBe('idempotencia_conflito')
    // Falhou: a chave fica livre para a nova tentativa
    const ruim = {
      documento: cnpjUnico(),
      razao_social: 'Xis',
      responsavel_email: 'ninguem@exemplo.com',
    }
    expect((await chamar('post', '/empresas', ruim, { 'Idempotency-Key': 'abc-2' })).status).toBe(
      422,
    )
    const { responsavel_email: _e, ...bom } = ruim
    expect((await chamar('post', '/empresas', bom, { 'Idempotency-Key': 'abc-2' })).status).toBe(
      201,
    )
  })
})

describe('API pública: contatos, atividades e oportunidades', () => {
  it('contato pela empresa (CNPJ), duplicado 409, busca por e-mail e telefone', async () => {
    const { chamar } = await cenario()
    const cnpj = cnpjUnico()
    const empresa = await chamar('post', '/empresas', {
      documento: cnpj,
      razao_social: 'Com contato',
      consultar_receita: false,
    })
    const r = await chamar('post', '/contatos', {
      nome: 'Maria Financeiro',
      empresa_cnpj: cnpj,
      emails: ['Maria@Exemplo.com'],
      telefones: [{ numero: '27 3064-3021' }],
      cargo: 'Financeiro',
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.emails).toEqual([{ email: 'maria@exemplo.com', principal: true }])
    expect(r.body.empresas[0]).toMatchObject({ id: empresa.body.id, cargo: 'Financeiro' })
    const dup = await chamar('post', '/contatos', {
      nome: 'Outra Maria',
      empresa_cnpj: cnpj,
      emails: ['maria@exemplo.com'],
    })
    expect(dup.status).toBe(409)
    const porEmail = await chamar('get', '/contatos?email=maria@exemplo.com')
    expect(porEmail.body.dados.map((c: { id: string }) => c.id)).toEqual([r.body.id])
    const porTelefone = await chamar(
      'get',
      `/contatos?telefone=${encodeURIComponent('+552730643021')}`,
    )
    expect(porTelefone.body.dados.map((c: { id: string }) => c.id)).toEqual([r.body.id])
    const alterado = await chamar('patch', `/contatos/${r.body.id as string}`, {
      nome: 'Maria Souza',
    })
    expect(alterado.body.nome).toBe('Maria Souza')
  })

  it('atividade realizada atualiza o último contato; id_externo não duplica (200); concluir', async () => {
    const { chamar } = await cenario()
    const empresa = await chamar('post', '/empresas', {
      documento: cnpjUnico(),
      razao_social: 'Ativa',
      consultar_receita: false,
    })
    const corpo = {
      tipo: 'ligacao',
      titulo: 'Cobrança da mensalidade',
      empresa_id: empresa.body.id,
      inicio: new Date(Date.now() - 3_600_000).toISOString(),
      situacao: 'realizada',
      resultado: 'Prometeu pagar',
      id_externo: 'omie-123',
    }
    const r = await chamar('post', '/atividades', corpo)
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.origem).toBe('api')
    expect(r.body.id_externo).toBe('omie-123')
    const de_novo = await chamar('post', '/atividades', corpo)
    expect(de_novo.status).toBe(200)
    expect(de_novo.body.id).toBe(r.body.id)
    const lida = await chamar('get', `/empresas/${empresa.body.id as string}`)
    expect(lida.body.ultimo_contato_em).not.toBeNull()
    expect(lida.body.tags.map((t: { chave_sistema: string }) => t.chave_sistema)).toContain(
      'contactada',
    )

    const pendente = await chamar('post', '/atividades', {
      tipo: 'tarefa',
      titulo: 'Ligar de novo',
      empresa_id: empresa.body.id,
      inicio: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(pendente.status, JSON.stringify(pendente.body)).toBe(201)
    expect(pendente.body.situacao).toBe('pendente')
    const concluida = await chamar('post', `/atividades/${pendente.body.id as string}/concluir`, {
      resultado: 'Feito',
    })
    expect(concluida.status, JSON.stringify(concluida.body)).toBe(200)
    expect(concluida.body.situacao).toBe('realizada')
    const porExterno = await chamar('get', '/atividades?id_externo=omie-123')
    expect(porExterno.body.dados).toHaveLength(1)
  })

  it('oportunidade: cria no funil padrão, valores em string, muda a fase', async () => {
    const { chamar } = await cenario()
    const empresa = await chamar('post', '/empresas', {
      documento: cnpjUnico(),
      razao_social: 'Negócio',
      consultar_receita: false,
    })
    const r = await chamar('post', '/oportunidades', {
      titulo: 'Plano anual',
      empresa_id: empresa.body.id,
      valor_mensal: '350.00',
      meses: 12,
    })
    expect(r.status, JSON.stringify(r.body)).toBe(201)
    expect(r.body.valor_mensal).toBe('350.00')
    expect(r.body.valor_total).toBe('4200.00')
    const funis = await chamar('get', '/funis')
    const fases = funis.body.dados.find((f: { id: string }) => f.id === r.body.funil.id).fases as {
      id: string
    }[]
    const segunda = fases[1]?.id ?? ''
    const movida = await chamar('patch', `/oportunidades/${r.body.id as string}`, {
      fase_id: segunda,
      valor_unico: 100,
    })
    expect(movida.status, JSON.stringify(movida.body)).toBe(200)
    expect(movida.body.fase.id).toBe(segunda)
    expect(movida.body.valor_unico).toBe('100.00')
  })
})

describe('API pública: permissões e isolamento', () => {
  it('sem a permissão: 403 escopo_insuficiente; outra empresa: 404', async () => {
    const um = await cenario(['empresas.ver'])
    const outro = await cenario()
    expect(
      (await um.chamar('post', '/empresas', { documento: cnpjUnico(), razao_social: 'X' })).status,
    ).toBe(403)
    expect((await um.chamar('get', '/contatos')).status).toBe(403)
    const daOutra = await outro.chamar('post', '/empresas', {
      documento: cnpjUnico(),
      razao_social: 'Da outra',
      consultar_receita: false,
    })
    expect((await um.chamar('get', `/empresas/${daOutra.body.id as string}`)).status).toBe(404)
    const lista = await um.chamar('get', '/empresas')
    expect(lista.body.dados.map((e: { id: string }) => e.id)).not.toContain(daOutra.body.id)
  })
})

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, auditoriaDe, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

// Estes testes fazem centenas de chamadas do mesmo IP: o limite global (300/min) não é o assunto aqui
let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas(
    [],
    configuracaoDeTeste({ TRUST_PROXY: '1', RATE_LIMIT_MAX: '100000' }),
  )
})
afterEach(() => app.close())

type Metodo = 'get' | 'post' | 'patch' | 'put' | 'delete'
type Item = { id: string; nome: string; ativo: boolean; ordem: number } & Record<string, unknown>

const chamar = (metodo: Metodo, cookie: string | undefined, url: string, corpo?: unknown) => {
  let r = request(app.getHttpServer())
    [metodo](`/v1/configuracoes/${url}`)
    .set('Origin', ORIGEM_DO_FRONT)
  if (cookie) r = r.set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

interface Cadastro {
  rota: string
  entidade: string
  /** Quantos itens o primeiro acesso cria */
  padroes: number
  /** Corpo válido para criar (nome sobrescrito pelo teste) */
  novo: Record<string, unknown>
  /** Alteração válida além do nome, e o que deve aparecer na resposta */
  muda: Record<string, unknown>
  /** Corpos de criação inválidos (além de nome vazio) */
  invalidos: Record<string, unknown>[]
}

const CADASTROS: Cadastro[] = [
  {
    rota: 'verticais',
    entidade: 'vertical',
    padroes: 0,
    novo: { cor: 'teal' },
    muda: { cor: 'purple' },
    invalidos: [{ nome: 'X', cor: 'magenta' }],
  },
  {
    rota: 'solucoes',
    entidade: 'solucao',
    padroes: 0,
    novo: { cor: 'blue', descricao: 'Sensores e painéis' },
    muda: { cor: 'amber', descricao: 'Nova descrição' },
    invalidos: [{ nome: 'X', descricao: 'x'.repeat(501) }],
  },
  {
    rota: 'origens',
    entidade: 'origem',
    padroes: 5,
    novo: {},
    muda: {},
    invalidos: [{ nome: 'X', chaveSistema: 'importacao' }],
  },
  {
    rota: 'motivos',
    entidade: 'motivo',
    padroes: 12,
    novo: { aplicaA: ['perdido', 'cancelado'] },
    muda: { aplicaA: ['suspenso'] },
    invalidos: [{ nome: 'X', aplicaA: [] }, { nome: 'X', aplicaA: ['conquistado'] }, { nome: 'X' }],
  },
  {
    rota: 'tipos-atividade',
    entidade: 'tipo_atividade',
    padroes: 6,
    novo: { icone: 'utensils', cor: 'pink', contaComo: 'contato' },
    muda: { icone: 'coffee', cor: 'green', contaComo: 'visita', sincronizaAgenda: true },
    invalidos: [
      { nome: 'X', icone: 'Phone' },
      { nome: 'X' },
      { nome: 'X', icone: 'phone', contaComo: 'tudo' },
    ],
  },
]

const listar = async (cookie: string, rota: string, extra = '') =>
  (await chamar('get', cookie, `${rota}${extra}`)).body as Item[]

describe.each(CADASTROS)('/v1/configuracoes/$rota', (c) => {
  it('sem sessão 401; qualquer membro lê os padrões; gestor e vendedor não escrevem (403)', async () => {
    const d = await novoDono(app)
    const vendedor = await usuarioSimples(app)
    await vincular(d.tenantId, vendedor.id, 'vendedor')
    await ativar(vendedor.id, d.tenantId)
    const gestor = await usuarioSimples(app)
    await vincular(d.tenantId, gestor.id, 'gestor')
    await ativar(gestor.id, d.tenantId)

    expect((await chamar('get', undefined, c.rota)).status).toBe(401)
    for (const cookie of [d.cookie, vendedor.cookie, gestor.cookie]) {
      expect(await listar(cookie, c.rota)).toHaveLength(c.padroes)
    }
    const criado = (await chamar('post', d.cookie, c.rota, { ...c.novo, nome: 'Existente' }))
      .body as Item
    for (const cookie of [vendedor.cookie, gestor.cookie]) {
      const tentativas = [
        chamar('post', cookie, c.rota, { ...c.novo, nome: 'Invasor' }),
        chamar('patch', cookie, `${c.rota}/${criado.id}`, { nome: 'Invasor' }),
        chamar('delete', cookie, `${c.rota}/${criado.id}`),
        chamar('put', cookie, `${c.rota}/ordem`, { ids: [criado.id] }),
      ]
      for (const r of await Promise.all(tentativas)) {
        expect(r.status).toBe(403)
        expect(erroDe(r)).toBe('acesso_negado')
      }
    }
    expect((await chamar('post', undefined, c.rota, { ...c.novo, nome: 'X' })).status).toBe(401)
    expect(await listar(d.cookie, c.rota)).toHaveLength(c.padroes + 1)
  })

  it('cria no fim da lista (nome aparado), altera, registra a auditoria com antes e depois', async () => {
    const d = await novoDono(app)
    const r = await chamar('post', d.cookie, c.rota, { ...c.novo, nome: '  Novo item ' })
    expect(r.status).toBe(201)
    const item = r.body as Item
    expect(item).toMatchObject({ nome: 'Novo item', ativo: true, ordem: c.padroes })

    const alt = await chamar('patch', d.cookie, `${c.rota}/${item.id}`, {
      nome: 'Item renomeado',
      ...c.muda,
    })
    expect(alt.status).toBe(200)
    expect(alt.body).toMatchObject({ id: item.id, nome: 'Item renomeado', ...c.muda })

    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === c.entidade)
    expect(reg.map((x) => x.acao)).toEqual(['criar', 'alterar'])
    expect(reg[1]?.entidade_id).toBe(item.id)
    expect(reg[1]?.alteracoes).toMatchObject({ nome: { de: 'Novo item', para: 'Item renomeado' } })
    expect(reg[1]?.membro_id).not.toBeNull()

    // repetir o mesmo valor não é mudança: nada novo na auditoria
    await chamar('patch', d.cookie, `${c.rota}/${item.id}`, { nome: 'Item renomeado' })
    expect(
      (await auditoriaDe(d.tenantId)).filter(
        (x) => x.entidade === c.entidade && x.acao === 'alterar',
      ),
    ).toHaveLength(1)
  })

  it('valida: nome vazio, campos inválidos ou extras e id que não é uuid dão 400; nome repetido 409', async () => {
    const d = await novoDono(app)
    await chamar('post', d.cookie, c.rota, { ...c.novo, nome: 'Único' })
    const dup = await chamar('post', d.cookie, c.rota, { ...c.novo, nome: 'ÚNICO' })
    expect(dup.status).toBe(409)
    expect(erroDe(dup)).toBe('nome_duplicado')
    for (const ruim of [{ ...c.novo, nome: '   ' }, { ...c.novo }, ...c.invalidos]) {
      expect((await chamar('post', d.cookie, c.rota, ruim)).status, JSON.stringify(ruim)).toBe(400)
    }
    expect(
      (await chamar('post', d.cookie, c.rota, { ...c.novo, nome: 'Ok', extra: 1 })).status,
    ).toBe(400)
    expect((await chamar('patch', d.cookie, `${c.rota}/nao-e-uuid`, { nome: 'A' })).status).toBe(
      400,
    )
    expect(
      (
        await chamar('patch', d.cookie, `${c.rota}/0199a000-0000-7000-8000-000000000001`, {
          nome: 'A',
        })
      ).status,
    ).toBe(404)
    const outro = (await chamar('post', d.cookie, c.rota, { ...c.novo, nome: 'Outro' }))
      .body as Item
    const colisao = await chamar('patch', d.cookie, `${c.rota}/${outro.id}`, { nome: 'único' })
    expect(colisao.status).toBe(409)
    expect((await chamar('patch', d.cookie, `${c.rota}/${outro.id}`, {})).status).toBe(400)
  })

  it('inativa (some da lista, volta com incluirInativos), exclui (404 depois, nome liberado)', async () => {
    const d = await novoDono(app)
    const item = (await chamar('post', d.cookie, c.rota, { ...c.novo, nome: 'Temporário' }))
      .body as Item
    expect((await chamar('patch', d.cookie, `${c.rota}/${item.id}`, { ativo: false })).status).toBe(
      200,
    )
    expect(await listar(d.cookie, c.rota)).toHaveLength(c.padroes)
    const todos = await listar(d.cookie, c.rota, '?incluirInativos=true')
    expect(todos).toHaveLength(c.padroes + 1)
    expect(todos.find((x) => x.id === item.id)?.ativo).toBe(false)
    expect((await chamar('get', d.cookie, `${c.rota}?x=1`)).status).toBe(400)

    expect((await chamar('delete', d.cookie, `${c.rota}/${item.id}`)).status).toBe(204)
    expect((await chamar('delete', d.cookie, `${c.rota}/${item.id}`)).status).toBe(404)
    expect(await listar(d.cookie, c.rota, '?incluirInativos=true')).toHaveLength(c.padroes)
    expect((await chamar('post', d.cookie, c.rota, { ...c.novo, nome: 'Temporário' })).status).toBe(
      201,
    )
    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === c.entidade)
    expect(reg.map((x) => x.acao)).toContain('excluir')
  })

  it('reordena com a lista completa; incompleta, repetida ou com id alheio é 400 ordem_invalida', async () => {
    const d = await novoDono(app)
    const outra = await novoDono(app)
    const a = (await chamar('post', d.cookie, c.rota, { ...c.novo, nome: 'A' })).body as Item
    const b = (await chamar('post', d.cookie, c.rota, { ...c.novo, nome: 'B' })).body as Item
    const alheio = (await chamar('post', outra.cookie, c.rota, { ...c.novo, nome: 'C' }))
      .body as Item
    const atuais = (await listar(d.cookie, c.rota)).map((x) => x.id)

    const invertida = [...atuais.filter((id) => id !== a.id && id !== b.id), b.id, a.id]
    const ok = await chamar('put', d.cookie, `${c.rota}/ordem`, { ids: invertida })
    expect(ok.status).toBe(200)
    const depois = (await listar(d.cookie, c.rota)).map((x) => x.id)
    expect(depois.slice(-2)).toEqual([b.id, a.id])

    for (const ids of [[a.id], [...atuais, atuais[0]], [...atuais.slice(1), alheio.id]]) {
      const r = await chamar('put', d.cookie, `${c.rota}/ordem`, { ids })
      expect(r.status).toBe(400)
      expect(erroDe(r)).toBe('ordem_invalida')
    }
  })

  it('isolamento: quem administra a empresa A não vê nem altera itens da B (404)', async () => {
    const a = await novoDono(app)
    const b = await novoDono(app)
    const deB = (await chamar('post', b.cookie, c.rota, { ...c.novo, nome: 'Só da B' }))
      .body as Item
    expect((await listar(a.cookie, c.rota)).map((x) => x.id)).not.toContain(deB.id)
    const r1 = await chamar('patch', a.cookie, `${c.rota}/${deB.id}`, { nome: 'Invadido' })
    const r2 = await chamar('delete', a.cookie, `${c.rota}/${deB.id}`)
    expect([r1.status, r2.status]).toEqual([404, 404])
    // o mesmo nome pode existir nas duas empresas
    expect((await chamar('post', a.cookie, c.rota, { ...c.novo, nome: 'Só da B' })).status).toBe(
      201,
    )
    expect((await listar(b.cookie, c.rota)).find((x) => x.id === deB.id)?.nome).toBe('Só da B')
  })
})

describe('regras de cada cadastro', () => {
  it('origem do sistema (Importação): renomeia, mas não inativa nem exclui', async () => {
    const d = await novoDono(app)
    const importacao = (await listar(d.cookie, 'origens')).find(
      (o) => o['chaveSistema'] === 'importacao',
    ) as Item
    expect(importacao.nome).toBe('Importação')
    expect(
      (await chamar('patch', d.cookie, `origens/${importacao.id}`, { nome: 'Planilha' })).status,
    ).toBe(200)
    for (const r of [
      await chamar('patch', d.cookie, `origens/${importacao.id}`, { ativo: false }),
      await chamar('delete', d.cookie, `origens/${importacao.id}`),
    ]) {
      expect(r.status).toBe(409)
      expect(erroDe(r)).toBe('origem_de_sistema')
    }
    // as demais padrão são comuns
    const site = (await listar(d.cookie, 'origens')).find((o) => o.nome === 'Site') as Item
    expect((await chamar('delete', d.cookie, `origens/${site.id}`)).status).toBe(204)
  })

  it('tipo Tarefa: renomeia e muda ícone e cor; não inativa, não exclui e segue sem empresa e sem contar', async () => {
    const d = await novoDono(app)
    const tipos = await listar(d.cookie, 'tipos-atividade')
    expect(tipos.map((t) => t.nome)).toEqual([
      'Ligação',
      'WhatsApp',
      'E-mail',
      'Visita',
      'Reunião',
      'Tarefa',
    ])
    const tarefa = tipos.find((t) => t['chaveSistema'] === 'tarefa') as Item
    expect(tarefa).toMatchObject({ contaComo: 'nenhum', exigeEmpresa: false })
    expect(
      (
        await chamar('patch', d.cookie, `tipos-atividade/${tarefa.id}`, {
          nome: 'Afazer',
          icone: 'list',
          cor: 'red',
        })
      ).status,
    ).toBe(200)
    for (const corpo of [
      { ativo: false },
      { exigeEmpresa: true },
      { contaComo: 'visita' },
      { contaComo: 'contato' },
    ]) {
      const r = await chamar('patch', d.cookie, `tipos-atividade/${tarefa.id}`, corpo)
      expect(r.status, JSON.stringify(corpo)).toBe(409)
      expect(erroDe(r)).toBe('tipo_de_sistema')
    }
    // repetir o valor atual é aceito
    expect(
      (
        await chamar('patch', d.cookie, `tipos-atividade/${tarefa.id}`, {
          exigeEmpresa: false,
          contaComo: 'nenhum',
        })
      ).status,
    ).toBe(200)
    const del = await chamar('delete', d.cookie, `tipos-atividade/${tarefa.id}`)
    expect(del.status).toBe(409)
    expect(erroDe(del)).toBe('tipo_de_sistema')
    // os outros tipos padrão são livres, inclusive Visita (que conta como visita)
    const visita = tipos.find((t) => t.nome === 'Visita') as Item
    expect(visita).toMatchObject({ contaComo: 'visita', exigeEmpresa: true })
    expect(
      (await chamar('patch', d.cookie, `tipos-atividade/${visita.id}`, { ativo: false })).status,
    ).toBe(200)
  })

  it('motivos: os padrões vêm por status e a lista de status é trocada por inteiro', async () => {
    const d = await novoDono(app)
    const motivos = await listar(d.cookie, 'motivos')
    const por = (s: string) => motivos.filter((m) => (m['aplicaA'] as string[]).includes(s)).length
    expect([por('perdido'), por('cancelado'), por('suspenso')]).toEqual([5, 3, 4])
    const preco = motivos.find((m) => m.nome === 'Preço') as Item
    const r = await chamar('patch', d.cookie, `motivos/${preco.id}`, {
      aplicaA: ['perdido', 'cancelado'],
    })
    expect(r.body).toMatchObject({ aplicaA: ['perdido', 'cancelado'] })
    expect((await chamar('patch', d.cookie, `motivos/${preco.id}`, { aplicaA: [] })).status).toBe(
      400,
    )
    const reg = (await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'motivo')
    expect(reg[0]?.alteracoes).toEqual({
      aplicaA: { de: ['perdido'], para: ['perdido', 'cancelado'] },
    })
  })

  it('solução: descrição vazia vira nula e pode ser apagada', async () => {
    const d = await novoDono(app)
    const s = (
      await chamar('post', d.cookie, 'solucoes', { nome: 'Monitoramento', descricao: '  ' })
    ).body as Item
    expect(s['descricao']).toBeNull()
    const com = await chamar('patch', d.cookie, `solucoes/${s.id}`, {
      descricao: ' Linha de sensores ',
    })
    expect(com.body).toMatchObject({ descricao: 'Linha de sensores' })
    const sem = await chamar('patch', d.cookie, `solucoes/${s.id}`, { descricao: null })
    expect(sem.body).toMatchObject({ descricao: null })
  })
})

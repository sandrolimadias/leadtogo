import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { ModeloDeVisita, RelatorioDeVisita, ResultadoDeVisita } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import { ativar, dono, novoDono, usuarioSimples, vincular } from '../testes/mundo.js'

// Empresas e posições FICTÍCIAS (perto de Vitória só por conveniência).
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

type Metodo = 'get' | 'put' | 'post' | 'patch'
let ip = 0
const chamar = (metodo: Metodo, cookie: string, url: string, corpo?: unknown) => {
  ip += 1
  const r = request(app.getHttpServer())
    [metodo](`/v1${url}`)
    .set('Origin', ORIGEM_DO_FRONT)
    .set('X-Forwarded-For', `10.9.${Math.floor(ip / 250)}.${ip % 250}`)
    .set('Cookie', cookie)
  return corpo === undefined ? r : r.send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro

const noTenant = <T>(tenantId: string, fn: (tx: typeof dono) => Promise<T>) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return fn(tx as unknown as typeof dono)
  }) as Promise<T>

// A empresa fica em (-20.30, -40.30); 0,001 grau de latitude ≈ 111 m
const EMPRESA = { latitude: -20.3, longitude: -40.3 }
const perto = { latitude: -20.3005, longitude: -40.3 } // ~56 m
const longe = { latitude: -20.31, longitude: -40.3 } // ~1,1 km

async function cenario() {
  const d = await novoDono(app)
  const vendedor = await usuarioSimples(app)
  await vincular(d.tenantId, vendedor.id, 'vendedor')
  await ativar(vendedor.id, d.tenantId)
  const gestor = await usuarioSimples(app)
  await vincular(d.tenantId, gestor.id, 'gestor')
  await ativar(gestor.id, d.tenantId)
  const membros = await noTenant(
    d.tenantId,
    (tx) => tx<{ id: string; usuario_id: string }[]>`SELECT id, usuario_id FROM membros`,
  )
  const idDe = (u: string) => membros.find((m) => m.usuario_id === u)?.id as string
  const empresa = async (vendedorId = idDe(vendedor.id), comPosicao = true) => {
    const id = novoId()
    await noTenant(
      d.tenantId,
      (
        tx,
      ) => tx`INSERT INTO empresas (id, tenant_id, razao_social, vendedor_id, localizacao, geo_precisao, geo_origem)
        VALUES (${id}, ${d.tenantId}, ${`Empresa ${id.slice(-4)}`}, ${vendedorId},
          ${comPosicao ? tx`ST_SetSRID(ST_MakePoint(${EMPRESA.longitude}, ${EMPRESA.latitude}), 4326)::geography` : null},
          ${comPosicao ? 'exata' : null}::geo_precisao, ${comPosicao ? 'cnefe' : null}::geo_origem)`,
    )
    return id
  }
  const resultados = (await chamar('get', d.cookie, '/configuracoes/visitas/resultados'))
    .body as ResultadoDeVisita[]
  const resultado = (chave: string) =>
    resultados.find((r) => r.chaveSistema === chave || r.nome === chave) as ResultadoDeVisita
  const [modelo] = (await chamar('get', d.cookie, '/configuracoes/visitas/modelos'))
    .body as ModeloDeVisita[]
  const campo = (rotulo: string) =>
    modelo?.versaoAtual.campos.find(
      (c) => c.rotulo === rotulo,
    ) as ModeloDeVisita['versaoAtual']['campos'][number]
  return { d, vendedor, gestor, idDe, empresa, resultado, modelo, campo }
}

const checkin = (posicao = perto, offline = false) => ({
  em: new Date(Date.now() - 60_000).toISOString(),
  posicao,
  offline,
})
const salvar = (cookie: string, id: string, corpo: Record<string, unknown>) =>
  chamar('put', cookie, `/visitas/${id}`, {
    checkin: null,
    resultadoId: null,
    respostas: [],
    concluir: false,
    ...corpo,
  })

const empresaNoBanco = (tenantId: string, id: string) =>
  noTenant(tenantId, async (tx) => {
    const [e] = await tx<
      {
        ultima_visita_em: Date | null
        ultimo_contato_em: Date | null
        visita_tentada_em: Date | null
        numero_funcionarios: number | null
        geo_origem: string | null
      }[]
    >`SELECT ultima_visita_em, ultimo_contato_em, visita_tentada_em, numero_funcionarios, geo_origem::text AS geo_origem FROM empresas WHERE id = ${id}`
    const tags = await tx<{ chave: string | null; nome: string }[]>`
      SELECT t.chave_sistema AS chave, t.nome FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
      WHERE et.empresa_id = ${id} ORDER BY t.nome`
    const atividades = await tx<{ situacao: string; conta_visita: boolean; titulo: string }[]>`
      SELECT situacao::text AS situacao, conta_visita, titulo FROM atividades WHERE empresa_id = ${id} ORDER BY criado_em`
    return { ...e, tags, atividades }
  })

describe('/v1/visitas (check-in e relatório)', () => {
  it('check-in perto: atividade Visita em execução e rascunho; reenviar não duplica', async () => {
    const c = await cenario()
    const empresaId = await c.empresa()
    const id = novoId()
    const r = await salvar(c.vendedor.cookie, id, { empresaId, checkin: checkin() })
    expect(r.status).toBe(200)
    const rel = r.body as RelatorioDeVisita
    expect(rel).toMatchObject({ id, situacao: 'rascunho', semCheckin: false, foraDoLimite: false })
    // o vendedor não vê a posição nem a distância
    expect(rel).toMatchObject({ distanciaM: null, posicao: null, localizacaoVisivel: false })

    await salvar(c.vendedor.cookie, id, { empresaId, checkin: checkin() })
    const e = await empresaNoBanco(c.d.tenantId, empresaId)
    expect(e.atividades).toEqual([
      expect.objectContaining({ situacao: 'em_execucao', conta_visita: true }),
    ])
    expect(e.ultima_visita_em).toBeNull()

    // o gestor vê a posição e a distância (~56 m)
    const doGestor = (await chamar('get', c.gestor.cookie, `/visitas/${id}`))
      .body as RelatorioDeVisita
    expect(doGestor.localizacaoVisivel).toBe(true)
    expect(doGestor.distanciaM).toBeGreaterThan(40)
    expect(doGestor.distanciaM).toBeLessThan(70)
    expect(doGestor.posicao?.latitude).toBeCloseTo(perto.latitude, 5)

    // pendentes: só os rascunhos da própria pessoa
    expect((await chamar('get', c.vendedor.cookie, '/visitas?so=pendentes')).body).toHaveLength(1)
    expect((await chamar('get', c.gestor.cookie, '/visitas?so=pendentes')).body).toHaveLength(0)

    // a atividade da visita não se conclui por fora do relatório
    const concluirPorFora = await chamar(
      'post',
      c.vendedor.cookie,
      `/carteira/atividades/${rel.atividadeId}/concluir`,
      { resultado: 'Feito' },
    )
    expect(erroDe(concluirPorFora)).toBe('visita_com_relatorio')
  })

  it('modo bloquear: online além do limite é recusado; offline é aceito e marcado fora do limite', async () => {
    const c = await cenario()
    await chamar('put', c.d.cookie, '/configuracoes/visitas/checkin', {
      checkinModo: 'bloquear',
      checkinLimiteM: 300,
      lembreteRelatoriosHora: '17:30',
    })
    const empresaId = await c.empresa()
    const previa = await chamar(
      'get',
      c.vendedor.cookie,
      `/visitas/distancia?empresaId=${empresaId}&latitude=${longe.latitude}&longitude=${longe.longitude}`,
    )
    expect(previa.body).toMatchObject({ foraDoLimite: true, bloqueado: true, modo: 'bloquear' })

    const online = await salvar(c.vendedor.cookie, novoId(), { empresaId, checkin: checkin(longe) })
    expect(online.status).toBe(409)
    expect(erroDe(online)).toBe('checkin_fora_do_limite')
    expect((await empresaNoBanco(c.d.tenantId, empresaId)).atividades).toHaveLength(0)

    const offline = await salvar(c.vendedor.cookie, novoId(), {
      empresaId,
      checkin: checkin(longe, true),
    })
    expect(offline.status).toBe(200)
    expect(offline.body).toMatchObject({ foraDoLimite: true, checkinOffline: true })
  })

  it('concluir: realizada, visitada, e os campos de CRM na mesma transação; reenviar não repete os efeitos', async () => {
    const c = await cenario()
    const empresaId = await c.empresa()
    const tipos = (await chamar('get', c.d.cookie, '/configuracoes/tipos-atividade')).body as {
      id: string
      nome: string
    }[]
    const ligacao = tipos.find((t) => t.nome === 'Ligação')?.id
    const id = novoId()
    await salvar(c.vendedor.cookie, id, { empresaId, checkin: checkin() })
    const corpo = {
      empresaId,
      checkin: checkin(),
      resultadoId: c.resultado('Visita realizada').id,
      concluir: true,
      atualizarPosicaoDaEmpresa: true,
      respostas: [
        {
          campoId: c.campo('Contato').id,
          valor: { novo: { nome: 'Joana Prado', cargo: 'Compras' } },
        },
        { campoId: c.campo('Número de funcionários').id, valor: 120 },
        {
          campoId: c.campo('Interesse').id,
          valor: (c.campo('Interesse') as { opcoes: { id: string }[] }).opcoes[0]?.id,
        },
        {
          campoId: c.campo('Próximo passo').id,
          valor: {
            tipoAtividadeId: ligacao,
            titulo: 'Ligar para a Joana',
            data: new Date(Date.now() + 86_400_000).toISOString(),
            diaInteiro: false,
          },
        },
        { campoId: c.campo('Resumo').id, valor: 'Gostou da proposta.' },
      ],
    }
    const r = await salvar(c.vendedor.cookie, id, corpo)
    expect(r.status).toBe(200)
    const rel = r.body as RelatorioDeVisita
    expect(rel).toMatchObject({ situacao: 'concluido', resultado: { nome: 'Visita realizada' } })
    expect(rel.respostas.map((x) => x.rotulo)).toEqual([
      'Contato',
      'Número de funcionários',
      'Interesse',
      'Próximo passo',
      'Resumo',
    ])

    const conferir = async () => {
      const e = await empresaNoBanco(c.d.tenantId, empresaId)
      expect(e.ultima_visita_em).not.toBeNull()
      expect(e.numero_funcionarios).toBe(120)
      expect(e.geo_origem).toBe('checkin')
      expect(e.tags.map((t) => t.chave)).toContain('visitada')
      expect(e.atividades.map((a) => [a.situacao, a.titulo])).toEqual([
        ['realizada', expect.stringContaining('Visita a')],
        ['pendente', 'Ligar para a Joana'],
      ])
      const contatos = await noTenant(
        c.d.tenantId,
        (tx) => tx<{ nome: string; cargo: string | null }[]>`
          SELECT c.nome, ec.cargo FROM contatos c JOIN empresa_contatos ec ON ec.contato_id = c.id
          WHERE ec.empresa_id = ${empresaId}`,
      )
      expect(contatos).toEqual([{ nome: 'Joana Prado', cargo: 'Compras' }])
    }
    await conferir()
    // reenviar o mesmo (a fila do aparelho): devolve o gravado, sem repetir contato nem próximo passo
    const de_novo = await salvar(c.vendedor.cookie, id, corpo)
    expect(de_novo.status).toBe(200)
    expect((de_novo.body as RelatorioDeVisita).id).toBe(id)
    await conferir()

    // o modelo agora está em uso: mudar os campos publica a versão 2
    const alt = await chamar(
      'patch',
      c.d.cookie,
      `/configuracoes/visitas/modelos/${c.modelo?.id}`,
      {
        campos: c.modelo?.versaoAtual.campos.slice(1),
      },
    )
    expect((alt.body as ModeloDeVisita).versaoAtual.numero).toBe(2)
    // e o resultado usado não se exclui mais
    const excluir = await request(app.getHttpServer())
      .delete(`/v1/configuracoes/visitas/resultados/${c.resultado('Visita realizada').id}`)
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', c.d.cookie)
    expect(erroDe(excluir)).toBe('resultado_em_uso')
  })

  it('obrigatório sem resposta e valor fora do tipo dão 400; sem resultado não conclui', async () => {
    const c = await cenario()
    const empresaId = await c.empresa()
    const campoId = '0199a000-0000-7000-8000-00000000c001'
    const modelo = (
      await chamar('post', c.d.cookie, '/configuracoes/visitas/modelos', {
        nome: 'Curto',
        campos: [{ id: campoId, rotulo: 'Turnos', tipo: 'numero', obrigatorio: true }],
      })
    ).body as ModeloDeVisita
    const res = (
      await chamar('post', c.d.cookie, '/configuracoes/visitas/resultados', {
        nome: 'Diagnóstico feito',
        modeloId: modelo.id,
      })
    ).body as ResultadoDeVisita
    const id = novoId()
    const semResultado = await salvar(c.vendedor.cookie, id, { empresaId, concluir: true })
    expect(erroDe(semResultado)).toBe('resultado_obrigatorio')
    const faltando = await salvar(c.vendedor.cookie, id, {
      empresaId,
      resultadoId: res.id,
      concluir: true,
    })
    expect(erroDe(faltando)).toBe('respostas_invalidas')
    const errado = await salvar(c.vendedor.cookie, id, {
      empresaId,
      resultadoId: res.id,
      respostas: [{ campoId, valor: 'três' }],
    })
    expect(erroDe(errado)).toBe('respostas_invalidas')
    // o rascunho guarda o que vier válido
    const ok = await salvar(c.vendedor.cookie, id, {
      empresaId,
      resultadoId: res.id,
      respostas: [{ campoId, valor: 3 }],
    })
    expect(ok.body).toMatchObject({ situacao: 'rascunho', semCheckin: true })
  })

  it('"não localizada": conta como atividade, mas não marca a empresa como visitada', async () => {
    const c = await cenario()
    const empresaId = await c.empresa()
    const r = await salvar(c.vendedor.cookie, novoId(), {
      empresaId,
      checkin: checkin(),
      resultadoId: c.resultado('nao_localizada').id,
      concluir: true,
    })
    expect(r.status).toBe(200)
    const e = await empresaNoBanco(c.d.tenantId, empresaId)
    expect(e.atividades).toEqual([
      expect.objectContaining({ situacao: 'realizada', conta_visita: false }),
    ])
    expect(e.ultima_visita_em).toBeNull()
    expect(e.ultimo_contato_em).toBeNull()
    expect(e.visita_tentada_em).not.toBeNull()
    expect(e.tags.map((t) => t.chave)).toContain('endereco_a_confirmar')
    expect(e.tags.map((t) => t.chave)).not.toContain('visitada')

    // continua contando como atividade realizada (esforço) na lista do vendedor
    const lista = (await chamar('get', c.vendedor.cookie, '/carteira/atividades?aba=realizadas'))
      .body as { itens: { empresa: { id: string } | null }[] }
    expect(lista.itens.filter((a) => a.empresa?.id === empresaId)).toHaveLength(1)

    // uma visita real depois: a empresa vira visitada (a tentada fica para trás)
    await salvar(c.vendedor.cookie, novoId(), {
      empresaId,
      checkin: checkin(),
      resultadoId: c.resultado('Visita realizada').id,
      concluir: true,
    })
    const depois = await empresaNoBanco(c.d.tenantId, empresaId)
    expect(depois.ultima_visita_em).not.toBeNull()
    expect(depois.tags.map((t) => t.chave)).toContain('visitada')
  })

  it('"empresa encerrada" com a confirmação muda o Status para Inativo', async () => {
    const c = await cenario()
    const empresaId = await c.empresa()
    await salvar(c.vendedor.cookie, novoId(), {
      empresaId,
      resultadoId: c.resultado('encerrada').id,
      concluir: true,
      inativarEmpresa: true,
    })
    const e = await empresaNoBanco(c.d.tenantId, empresaId)
    expect(e.tags.map((t) => t.chave)).toContain('inativo')
  })

  it('só o autor grava o relatório; empresa fora da carteira do vendedor é 404', async () => {
    const c = await cenario()
    const empresaId = await c.empresa()
    const id = novoId()
    await salvar(c.vendedor.cookie, id, { empresaId, checkin: checkin() })
    const outro = await salvar(c.d.cookie, id, { empresaId, resultadoId: null })
    expect(erroDe(outro)).toBe('visita_de_outra_pessoa')

    const doDono = await c.empresa(c.idDe(c.d.usuarioId))
    const fora = await salvar(c.vendedor.cookie, novoId(), {
      empresaId: doDono,
      checkin: checkin(),
    })
    expect(fora.status).toBe(404)
  })
})

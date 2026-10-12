import type { Server } from 'node:http'

import { novoId } from '@leadtogo/db'
import type { EmpresaCriada, MeResposta, MembroDaEquipe } from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { cnpjUnico, limparLimitesAuth, ORIGEM_DO_FRONT } from '../testes/auth-teste.js'
import {
  ativar,
  auditoriaDe,
  dono,
  empresaDeOutraConta,
  ligar2fa,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  for (const chave of await valkey.keys('leadtogo:rl:*')) await valkey.del(chave)
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1' }))
})
afterEach(() => app.close())

const http = () => request(app.getHttpServer())
const criar = (cookie: string | undefined, corpo: unknown) => {
  const r = http().post('/v1/empresas').set('Origin', ORIGEM_DO_FRONT)
  return (cookie ? r.set('Cookie', cookie) : r).send(corpo as object)
}
const erroDe = (r: request.Response) => (r.body as RespostaDeErro).erro
const meDe = async (cookie: string) =>
  (await http().get('/v1/me').set('Cookie', cookie)).body as MeResposta
const nomeUnico = () => `Filial ${novoId().slice(-8)} Ltda`

const linhaDoTenant = (tenantId: string) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    const [t] = await tx<
      {
        razao_social: string
        nome_fantasia: string | null
        cnpj: string | null
        conta_id: string
        situacao: string
      }[]
    >`SELECT razao_social, nome_fantasia, cnpj, conta_id, situacao FROM tenants WHERE id = ${tenantId}`
    const config = await tx`SELECT 1 FROM tenant_configuracoes WHERE tenant_id = ${tenantId}`
    const equipe = await tx<{ papel: string; usuario_id: string; nome: string }[]>`
      SELECT papel, usuario_id, nome FROM membros WHERE tenant_id = ${tenantId}`
    return { t, config: config.length, equipe }
  })

describe('POST /v1/empresas', () => {
  it('sem sessão 401; quem não administra a conta 403; corpo inválido 400', async () => {
    expect((await criar(undefined, { razaoSocial: nomeUnico() })).status).toBe(401)

    const d = await novoDono(app)
    // admin da EMPRESA, mas sem ser dono nem administrador da conta
    const adminDaEmpresa = await usuarioSimples(app)
    await vincular(d.tenantId, adminDaEmpresa.id, 'admin')
    await ativar(adminDaEmpresa.id, d.tenantId)
    await ligar2fa(adminDaEmpresa.id)
    const negado = await criar(adminDaEmpresa.cookie, { razaoSocial: nomeUnico() })
    expect(negado.status).toBe(403)
    expect(erroDe(negado)).toBe('acesso_negado')

    for (const corpo of [
      {},
      { razaoSocial: 'A' },
      { razaoSocial: nomeUnico(), cnpj: '11222333000199' },
      { razaoSocial: nomeUnico(), extra: true },
      { razaoSocial: nomeUnico(), contaId: 'nao-e-uuid' },
    ]) {
      expect((await criar(d.cookie, corpo)).status, JSON.stringify(corpo)).toBe(400)
    }
  })

  it('cria a empresa (em teste), as configurações e o criador como administrador; registra a auditoria na empresa nova', async () => {
    const d = await novoDono(app)
    const razao = nomeUnico()
    const r = await criar(d.cookie, { razaoSocial: razao, nomeFantasia: '  Filial Norte  ' })
    expect(r.status).toBe(201)
    const corpo = r.body as EmpresaCriada
    expect(corpo).toMatchObject({
      empresa: {
        razaoSocial: razao,
        nomeFantasia: 'Filial Norte',
        papel: 'admin',
        situacao: 'teste',
        ativa: false,
      },
      cnpjRepetidoNaConta: false,
    })

    const { t, config, equipe } = await linhaDoTenant(corpo.empresa.id)
    expect(t).toMatchObject({
      razao_social: razao,
      conta_id: d.contaId,
      situacao: 'teste',
      cnpj: null,
    })
    expect(config).toBe(1)
    expect(equipe).toEqual([expect.objectContaining({ papel: 'admin', usuario_id: d.usuarioId })])

    const novoMembro = (
      await dono.begin(async (tx) => {
        await tx`SELECT set_config('app.tenant_id', ${corpo.empresa.id}, true)`
        return tx<{ id: string }[]>`SELECT id FROM membros`
      })
    )[0]?.id
    const reg = await auditoriaDe(corpo.empresa.id)
    expect(reg).toEqual([
      expect.objectContaining({
        entidade: 'empresa',
        entidade_id: corpo.empresa.id,
        acao: 'criar_empresa',
        membro_id: novoMembro,
        alteracoes: { razaoSocial: razao, contaId: d.contaId },
      }),
    ])
    // a empresa de origem não ganha o registro
    expect((await auditoriaDe(d.tenantId)).filter((x) => x.acao === 'criar_empresa')).toEqual([])
  })

  it('a empresa nova já nasce com os cadastros padrão (tags, tipos, funil, origens e motivos)', async () => {
    const d = await novoDono(app)
    const r = await criar(d.cookie, { razaoSocial: nomeUnico() })
    expect(r.status).toBe(201)
    const id = (r.body as EmpresaCriada).empresa.id
    const n = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${id}, true)`
      const [l] = await tx<
        {
          tags: number
          tipos: number
          fases: number
          origens: number
          motivos: number
          marca: boolean
        }[]
      >`
        SELECT (SELECT count(*)::int FROM tags) AS tags, (SELECT count(*)::int FROM tipos_atividade) AS tipos,
               (SELECT count(*)::int FROM funil_fases) AS fases, (SELECT count(*)::int FROM origens) AS origens,
               (SELECT count(*)::int FROM motivos) AS motivos,
               (SELECT padroes_criados_em IS NOT NULL FROM tenant_configuracoes) AS marca`
      return l
    })
    expect(n).toEqual({ tags: 6, tipos: 6, fases: 4, origens: 5, motivos: 12, marca: true })
  })

  it('a auditoria da criação grava o IP do cliente (pelo proxy confiável)', async () => {
    const d = await novoDono(app)
    const r = await criar(d.cookie, { razaoSocial: nomeUnico() }).set(
      'X-Forwarded-For',
      '198.51.100.8',
    )
    const id = (r.body as EmpresaCriada).empresa.id
    expect((await auditoriaDe(id))[0]?.ip).toBe('198.51.100.8')
  })

  it('a empresa nova aparece em /me e dá para entrar nela; lá só existe o criador', async () => {
    const d = await novoDono(app)
    const criada = (await criar(d.cookie, { razaoSocial: nomeUnico() })).body as EmpresaCriada
    const antes = await meDe(d.cookie)
    expect(antes.empresas.map((e) => e.id)).toContain(criada.empresa.id)
    expect(antes.empresaAtivaId).toBe(d.tenantId) // não troca sozinha

    const troca = await http()
      .post('/v1/sessao/empresa-ativa')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', d.cookie)
      .send({ empresaId: criada.empresa.id })
    expect(troca.status).toBe(200)
    const equipe = (await http().get('/v1/membros').set('Cookie', d.cookie))
      .body as MembroDaEquipe[]
    expect(equipe).toHaveLength(1)
    expect(equipe[0]).toMatchObject({ papel: 'admin', temLogin: true })
  })

  it('funciona sem empresa ativa (a pessoa ainda está no seletor)', async () => {
    const d = await novoDono(app, { semEmpresaAtiva: true })
    expect((await criar(d.cookie, { razaoSocial: nomeUnico() })).status).toBe(201)
  })

  it('CNPJ: aceita com máscara (guarda sem), avisa repetição na MESMA conta e não olha outras contas', async () => {
    const d = await novoDono(app)
    const cnpj = cnpjUnico()
    const mascarado = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
    const primeira = (await criar(d.cookie, { razaoSocial: nomeUnico(), cnpj: mascarado }))
      .body as EmpresaCriada
    expect(primeira.cnpjRepetidoNaConta).toBe(false)
    expect((await linhaDoTenant(primeira.empresa.id)).t?.cnpj).toBe(cnpj)

    const repetida = await criar(d.cookie, { razaoSocial: nomeUnico(), cnpj })
    expect(repetida.status).toBe(201) // é só um aviso
    expect((repetida.body as EmpresaCriada).cnpjRepetidoNaConta).toBe(true)

    // o CNPJ de uma empresa de OUTRA conta não gera aviso nem erro (não revela que existe)
    const alheia = await empresaDeOutraConta()
    const cnpjAlheio = cnpjUnico()
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${alheia.tenantId}, true)`
      await tx`UPDATE tenants SET cnpj = ${cnpjAlheio} WHERE id = ${alheia.tenantId}`
    })
    const igualAoAlheio = await criar(d.cookie, { razaoSocial: nomeUnico(), cnpj: cnpjAlheio })
    expect(igualAoAlheio.status).toBe(201)
    expect((igualAoAlheio.body as EmpresaCriada).cnpjRepetidoNaConta).toBe(false)
  })

  it('isolamento: a empresa nova nasce na conta de quem criou e não aparece para outra conta', async () => {
    const a = await novoDono(app)
    const b = await novoDono(app)
    const criada = (await criar(a.cookie, { razaoSocial: nomeUnico() })).body as EmpresaCriada
    expect((await linhaDoTenant(criada.empresa.id)).t?.conta_id).toBe(a.contaId)
    expect((await meDe(b.cookie)).empresas.map((e) => e.id)).not.toContain(criada.empresa.id)
    // trocar para a empresa de outra conta não é permitido
    const troca = await http()
      .post('/v1/sessao/empresa-ativa')
      .set('Origin', ORIGEM_DO_FRONT)
      .set('Cookie', b.cookie)
      .send({ empresaId: criada.empresa.id })
    expect(troca.status).toBe(403)
    // e a auditoria da empresa de A não vaza para a de B
    expect(await auditoriaDe(b.tenantId)).toEqual([])
  })

  it('com mais de uma conta, contaId é obrigatório; conta alheia ou inexistente: o mesmo 403', async () => {
    const d = await novoDono(app)
    const segundaConta = novoId()
    await dono`INSERT INTO contas (id, nome) VALUES (${segundaConta}, 'Segunda conta')`
    await dono`INSERT INTO conta_administradores (conta_id, usuario_id, papel) VALUES (${segundaConta}, ${d.usuarioId}, 'administrador')`

    const semConta = await criar(d.cookie, { razaoSocial: nomeUnico() })
    expect(semConta.status).toBe(400)
    expect(erroDe(semConta)).toBe('conta_obrigatoria')

    const naSegunda = (await criar(d.cookie, { razaoSocial: nomeUnico(), contaId: segundaConta }))
      .body as EmpresaCriada
    expect((await linhaDoTenant(naSegunda.empresa.id)).t?.conta_id).toBe(segundaConta)

    const alheia = await empresaDeOutraConta()
    for (const contaId of [alheia.contaId, novoId()]) {
      const r = await criar(d.cookie, { razaoSocial: nomeUnico(), contaId })
      expect(r.status).toBe(403)
      expect(erroDe(r)).toBe('conta_nao_permitida')
    }
  })
})

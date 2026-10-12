import { createHash } from 'node:crypto'
import type { Server } from 'node:http'
import { Writable } from 'node:stream'

import type {
  ConviteAceito,
  ConviteConsulta,
  ConviteCriado,
  ConviteResumo,
  MembroDaEquipe,
} from '@leadtogo/shared'
import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RespostaDeErro } from '../http/filtro-excecoes.js'
import { configuracaoDeTeste, criarAppComRotas } from '../testes/app-teste.js'
import { subirWorkerDeTeste } from '../testes/worker-teste.js'
import {
  emailUnico,
  entrar,
  limparLimitesAuth,
  ORIGEM_DO_FRONT,
  SENHA_PADRAO,
} from '../testes/auth-teste.js'
import { aguardarMensagem, limparCaixa, mensagensPara, primeiroLink } from '../testes/mailpit.js'
import {
  ativar,
  auditoriaDe,
  dono,
  membroComEmail,
  membroSemLogin,
  mudarMembro,
  novaEmpresa,
  novoDono,
  usuarioSimples,
  vincular,
} from '../testes/mundo.js'

const valkey = new Redis(process.env['REDIS_URL'] ?? '')
// O e-mail só sai quando o worker age (relay do outbox e fila de e-mail): sobe um de verdade
const workerDeTeste = await subirWorkerDeTeste()
afterAll(async () => {
  await workerDeTeste.parar()
  await valkey.quit()
  await dono.end()
})

let app: INestApplication<Server>
const logs: string[] = []
beforeEach(async () => {
  await limparLimitesAuth(valkey)
  for (const chave of await valkey.keys('leadtogo:rl:*')) await valkey.del(chave)
  await limparCaixa()
  logs.length = 0
  const destino = new Writable({
    write(pedaco, _c, pronto) {
      logs.push(String(pedaco))
      pronto()
    },
  })
  app = await criarAppComRotas([], configuracaoDeTeste({ TRUST_PROXY: '1', LOG_LEVEL: 'info' }), {
    destinoLog: destino,
  })
})
afterEach(() => app.close())

const http = () => request(app.getHttpServer())
const com = (r: request.Test, cookie?: string) => (cookie ? r.set('Cookie', cookie) : r)
const convidar = (cookie: string, corpo: unknown) =>
  http()
    .post('/v1/convites')
    .set('Cookie', cookie)
    .set('Origin', ORIGEM_DO_FRONT)
    .send(corpo as object)
const consultar = (token: string) => http().post('/v1/convites/consultar').send({ token })
const aceitar = (corpo: object, cookie?: string) =>
  com(http().post('/v1/convites/aceitar').set('Origin', ORIGEM_DO_FRONT).send(corpo), cookie)
const erroDe = (r: request.Response) => r.body as RespostaDeErro
const hash = (t: string) => createHash('sha256').update(t).digest('hex')

/** Admin com a empresa ativa, pronto para convidar. */
async function adminPronto() {
  const d = await novoDono(app)
  await ativar(d.usuarioId, d.tenantId)
  return d
}
/** Convida e devolve o token tirado do e-mail (único jeito de obtê-lo, como na vida real). */
async function convidarEPegarToken(cookie: string, email: string, papel = 'vendedor') {
  const r = await convidar(cookie, { email, papel })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  const mensagem = await aguardarMensagem(email)
  const token = new URL(primeiroLink(mensagem)).searchParams.get('token') ?? ''
  expect(token).toHaveLength(43)
  return { token, convite: r.body as ConviteCriado, mensagem }
}
const linhaDoConvite = async (id: string, tenantId: string) =>
  dono.begin(async (tx) => {
    await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
    return (
      await tx<
        {
          token_hash: string
          aceito_em: Date | null
          revogado_em: Date | null
          expira_em: Date
          convidado_por: string
        }[]
      >`
      SELECT token_hash, aceito_em, revogado_em, expira_em, convidado_por FROM convites WHERE id = ${id}`
    )[0]
  })

describe('POST /v1/convites (administrador)', () => {
  it('cria o convite, manda o e-mail em pt-BR e NUNCA devolve nem grava o token', async () => {
    const d = await adminPronto()
    const email = emailUnico('convidado')
    const { token, convite, mensagem } = await convidarEPegarToken(d.cookie, email, 'gestor')
    expect(convite).toMatchObject({
      email,
      papel: 'gestor',
      situacao: 'pendente',
      emailEnviado: true,
    })
    expect(JSON.stringify(convite)).not.toContain(token)
    expect(mensagem.Subject).toMatch(/^Convite para a .+ no Leadtogo$/)
    expect(mensagem.Text).toContain('Dono de Teste convidou você')
    expect(mensagem.Text).toContain('como gestor')
    expect(mensagem.Text).toContain('7 dias')
    const linha = await linhaDoConvite(convite.id, d.tenantId)
    expect(linha?.token_hash).toBe(hash(token)) // só o hash
    expect(linha?.token_hash).not.toBe(token)
    expect(linha?.convidado_por).toBeTruthy()
    // validade de 7 dias
    const dias = ((linha?.expira_em.getTime() ?? 0) - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(6.9)
    expect(dias).toBeLessThanOrEqual(7)
  })

  it('só administradores da empresa convidam, listam e cancelam (gestor e vendedor: 403)', async () => {
    const d = await adminPronto()
    const { convite } = await convidarEPegarToken(d.cookie, emailUnico('x'))
    for (const papel of ['gestor', 'vendedor'] as const) {
      const u = await usuarioSimples(app)
      await vincular(d.tenantId, u.id, papel)
      await ativar(u.id, d.tenantId)
      for (const r of [
        await convidar(u.cookie, { email: emailUnico('y'), papel: 'vendedor' }),
        await com(http().get('/v1/convites'), u.cookie),
        await com(
          http().delete(`/v1/convites/${convite.id}`).set('Origin', ORIGEM_DO_FRONT),
          u.cookie,
        ),
      ]) {
        expect(r.status, papel).toBe(403)
        expect(erroDe(r).erro).toBe('acesso_negado')
      }
    }
  })

  it('valida a entrada (400) e exige sessão (401)', async () => {
    const d = await adminPronto()
    for (const corpo of [
      { email: 'x', papel: 'vendedor' },
      { email: 'a@b.com', papel: 'dono' },
      { email: 'a@b.com' },
      { email: 'a@b.com', papel: 'admin', tenantId: d.tenantId },
      {},
    ]) {
      const r = await convidar(d.cookie, corpo)
      expect(r.status, JSON.stringify(corpo)).toBe(400)
      expect(erroDe(r).erro).toBe('validacao_invalida')
    }
    expect(
      (await http().post('/v1/convites').send({ email: 'a@b.com', papel: 'vendedor' })).status,
    ).toBe(401)
  })

  it('quem já é da equipe não é convidado de novo (por e-mail do membro ou da conta)', async () => {
    const d = await adminPronto()
    await membroComEmail(d.tenantId, 'ja.esta@exemplo.com')
    const r = await convidar(d.cookie, { email: 'JA.ESTA@exemplo.com', papel: 'vendedor' })
    expect(r.status).toBe(409)
    expect(erroDe(r).erro).toBe('ja_e_membro')
    const colega = await usuarioSimples(app)
    await vincular(d.tenantId, colega.id, 'vendedor')
    expect((await convidar(d.cookie, { email: colega.email, papel: 'gestor' })).status).toBe(409)
    expect(await mensagensPara('ja.esta@exemplo.com')).toHaveLength(0)
  })

  it('reenviar cancela o convite anterior (o token antigo morre) e cria outro', async () => {
    const d = await adminPronto()
    const email = emailUnico('reenvio')
    const primeiro = await convidarEPegarToken(d.cookie, email)
    await limparCaixa()
    const segundo = await convidarEPegarToken(d.cookie, email, 'gestor')
    expect(segundo.token).not.toBe(primeiro.token)
    expect(erroDe(await consultar(primeiro.token)).erro).toBe('convite_invalido')
    expect(((await consultar(segundo.token)).body as ConviteConsulta).papel).toBe('gestor')
    const lista = (await com(http().get('/v1/convites'), d.cookie)).body as ConviteResumo[]
    expect(lista.filter((c) => c.email === email)).toHaveLength(1)
  })

  it('lista só os pendentes da empresa, sem token, e marca os expirados', async () => {
    const d = await adminPronto()
    const email = emailUnico('lista')
    const { token, convite } = await convidarEPegarToken(d.cookie, email)
    const lista = await com(http().get('/v1/convites'), d.cookie)
    expect(lista.status).toBe(200)
    expect(JSON.stringify(lista.body)).not.toContain(token)
    expect((lista.body as ConviteResumo[]).find((c) => c.id === convite.id)).toMatchObject({
      email,
      situacao: 'pendente',
    })
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`UPDATE convites SET expira_em = now() - interval '1 minute' WHERE id = ${convite.id}`
    })
    const depois = (await com(http().get('/v1/convites'), d.cookie)).body as ConviteResumo[]
    expect(depois.find((c) => c.id === convite.id)?.situacao).toBe('expirado')
  })

  it('cancelar: 204, o token deixa de valer e repetir dá 404; id que não é uuid dá 400', async () => {
    const d = await adminPronto()
    const { token, convite } = await convidarEPegarToken(d.cookie, emailUnico('cancela'))
    const apagar = (id: string) =>
      com(http().delete(`/v1/convites/${id}`).set('Origin', ORIGEM_DO_FRONT), d.cookie)
    expect((await apagar(convite.id)).status).toBe(204)
    expect(erroDe(await consultar(token)).erro).toBe('convite_invalido')
    const de_novo = await apagar(convite.id)
    expect(de_novo.status).toBe(404)
    expect(erroDe(de_novo).erro).toBe('convite_nao_encontrado')
    expect((await apagar('abc')).status).toBe(400)
  })
})

describe('consultar e aceitar o convite (sem sessão)', () => {
  it('consultar mostra a empresa, o e-mail, o papel e se a conta já existe; o token vai no corpo', async () => {
    const d = await adminPronto()
    const novo = emailUnico('novo')
    const { token } = await convidarEPegarToken(d.cookie, novo, 'vendedor')
    const r = await consultar(token)
    expect(r.status).toBe(200)
    expect(r.body as ConviteConsulta).toMatchObject({
      email: novo,
      papel: 'vendedor',
      contaExistente: false,
    })
    expect((r.body as ConviteConsulta).empresa.razaoSocial).toContain('Empresa')
    const existente = await usuarioSimples(app)
    const outro = await convidarEPegarToken(d.cookie, existente.email, 'gestor')
    expect(((await consultar(outro.token)).body as ConviteConsulta).contaExistente).toBe(true)
  })

  it('token inexistente, expirado, cancelado ou já usado: o MESMO 404 (não revela o motivo)', async () => {
    const d = await adminPronto()
    const expirado = await convidarEPegarToken(d.cookie, emailUnico('exp'))
    await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      await tx`UPDATE convites SET expira_em = now() - interval '1 second' WHERE id = ${expirado.convite.id}`
    })
    const cancelado = await convidarEPegarToken(d.cookie, emailUnico('can'))
    await com(
      http().delete(`/v1/convites/${cancelado.convite.id}`).set('Origin', ORIGEM_DO_FRONT),
      d.cookie,
    )
    const usado = await convidarEPegarToken(d.cookie, emailUnico('usado'))
    await aceitar({ token: usado.token, nome: 'Fulano', senha: 'senha-forte-123' }).expect(200)

    const respostas = [
      await consultar('x'.repeat(43)),
      await consultar(expirado.token),
      await consultar(cancelado.token),
      await consultar(usado.token),
    ]
    for (const r of respostas) {
      expect(r.status).toBe(404)
      expect(erroDe(r).erro).toBe('convite_invalido')
    }
    expect(new Set(respostas.map((r) => erroDe(r).mensagem)).size).toBe(1)
    expect((await consultar('curto')).status).toBe(400) // formato inválido
  })

  it('aceitar SEM conta: cria a conta (e-mail já confirmado), o membro e marca o convite; uso único', async () => {
    const d = await adminPronto()
    const email = emailUnico('aceita')
    const { token, convite } = await convidarEPegarToken(d.cookie, email, 'gestor')
    const r = await aceitar({ token, nome: 'Bia Costa', senha: 'senha-da-bia-123' })
    expect(r.status).toBe(200)
    const aceito = r.body as ConviteAceito
    expect(aceito).toMatchObject({ tenantId: d.tenantId, contaCriada: true })

    const [u] = await dono<
      { name: string; email_verified: boolean }[]
    >`SELECT name, email_verified FROM auth."user" WHERE id = ${aceito.usuarioId}`
    expect(u).toEqual({ name: 'Bia Costa', email_verified: true })
    const membro = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return (
        await tx`SELECT nome, email, papel, usuario_id, criado_por FROM membros WHERE id = ${aceito.membroId}`
      )[0]
    })
    expect(membro).toMatchObject({
      nome: 'Bia Costa',
      email,
      papel: 'gestor',
      usuario_id: aceito.usuarioId,
    })
    expect(membro?.['criado_por']).toBe(
      (await linhaDoConvite(convite.id, d.tenantId))?.convidado_por,
    )
    expect((await linhaDoConvite(convite.id, d.tenantId))?.aceito_em).not.toBeNull()

    // entra com a conta nova e vê a empresa com o papel do convite
    const login = await entrar(app, email, 'senha-da-bia-123')
    expect(login.status).toBe(200)
    const me = (await com(http().get('/v1/me'), login.cookie)).body as {
      empresas: { id: string; papel: string }[]
    }
    expect(me.empresas).toEqual([expect.objectContaining({ id: d.tenantId, papel: 'gestor' })])

    // o token só vale uma vez
    expect(
      erroDe(await aceitar({ token, nome: 'Outra Pessoa', senha: 'outra-senha-123' })).erro,
    ).toBe('convite_invalido')
  })

  it('sem nome e senha para conta nova: 400 cadastro_necessario e nada é criado', async () => {
    const d = await adminPronto()
    const email = emailUnico('semdados')
    const { token } = await convidarEPegarToken(d.cookie, email)
    for (const corpo of [
      { token },
      { token, nome: 'So Nome' },
      { token, senha: 'senha-forte-123' },
    ]) {
      const r = await aceitar(corpo)
      expect(r.status).toBe(400)
      expect(erroDe(r).erro).toBe('cadastro_necessario')
    }
    expect(await dono`SELECT 1 FROM auth."user" WHERE email = ${email}`).toHaveLength(0)
    expect((await consultar(token)).status).toBe(200) // o convite continua válido
  })

  it('CONTA EXISTENTE: sem login 401; com a conta de outro e-mail 403; com a conta certa entra para a equipe', async () => {
    const d = await adminPronto()
    const convidada = await usuarioSimples(app)
    const { token } = await convidarEPegarToken(d.cookie, convidada.email, 'vendedor')

    const semLogin = await aceitar({ token })
    expect(semLogin.status).toBe(401)
    expect(erroDe(semLogin).erro).toBe('login_necessario')

    const intrusa = await usuarioSimples(app)
    const outra = await aceitar({ token }, intrusa.cookie)
    expect(outra.status).toBe(403)
    expect(erroDe(outra).erro).toBe('convite_de_outro_email')
    expect(
      await dono`SELECT 1 FROM membros WHERE usuario_id = ${intrusa.id}`.catch(() => []),
    ).toHaveLength(0)

    const certa = await aceitar({ token }, convidada.cookie)
    expect(certa.status).toBe(200)
    expect(certa.body as ConviteAceito).toMatchObject({
      tenantId: d.tenantId,
      usuarioId: convidada.id,
      contaCriada: false,
    })
    // aceitar não troca a empresa ativa nem a senha dela: continua a mesma conta
    expect((await entrar(app, convidada.email, SENHA_PADRAO)).status).toBe(200)
  })

  it('quem já é da equipe: 409 ja_e_membro e o convite não é gasto', async () => {
    const d = await adminPronto()
    const colega = await usuarioSimples(app)
    const { token } = await convidarEPegarToken(d.cookie, colega.email)
    await vincular(d.tenantId, colega.id, 'vendedor') // entrou por outro caminho depois do convite
    const r = await aceitar({ token }, colega.cookie)
    expect(r.status).toBe(409)
    expect(erroDe(r).erro).toBe('ja_e_membro')
  })

  it('quem saiu da equipe (excluído) pode ser convidado de novo e volta com um registro novo', async () => {
    const d = await adminPronto()
    const antigo = await usuarioSimples(app)
    await vincular(d.tenantId, antigo.id, 'vendedor')
    await mudarMembro(d.tenantId, antigo.id, 'excluido_em = now()')
    const { token } = await convidarEPegarToken(d.cookie, antigo.email, 'gestor')
    expect((await aceitar({ token }, antigo.cookie)).status).toBe(200)
    const membros = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx<
        { papel: string; excluido_em: Date | null }[]
      >`SELECT papel, excluido_em FROM membros WHERE usuario_id = ${antigo.id} ORDER BY criado_em`
    })
    expect(membros.map((m) => [m.papel, m.excluido_em === null])).toEqual([
      ['vendedor', false], // o registro antigo continua excluído
      ['gestor', true], // o novo é o ativo
    ])
  })

  it('cinco aceites simultâneos do mesmo token: um só entra e só existe um membro', async () => {
    const d = await adminPronto()
    const email = emailUnico('corrida')
    const { token } = await convidarEPegarToken(d.cookie, email)
    const respostas = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        aceitar({ token, nome: `Pessoa ${i}`, senha: 'senha-forte-123' }),
      ),
    )
    expect(respostas.filter((r) => r.status === 200)).toHaveLength(1)
    // Quem perde a corrida recebe 409 (conta já criada pelo vencedor), 404 (convite já usado) ou 401 (viu a
    // conta nova antes do commit do vencedor e pede login): nunca 200 nem 500. O que vale são as invariantes.
    expect(
      respostas.filter((r) => r.status !== 200).every((r) => [401, 404, 409].includes(r.status)),
    ).toBe(true)
    const membros = await dono.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`
      return tx`SELECT 1 FROM membros WHERE email = ${email}`
    })
    expect(membros).toHaveLength(1)
    expect(await dono`SELECT 1 FROM auth."user" WHERE email = ${email}`).toHaveLength(1)
  })

  it('o token não vai para os logs (nem na consulta nem no aceite) e as tentativas são limitadas por IP', async () => {
    const d = await adminPronto()
    const { token } = await convidarEPegarToken(d.cookie, emailUnico('log'))
    await consultar(token)
    await aceitar({ token, nome: 'Pessoa Log', senha: 'senha-forte-123' })
    expect(logs.join('')).not.toContain(token)
    expect(logs.join('')).not.toContain('senha-forte-123')

    const statuses: number[] = []
    for (let i = 0; i < 12; i++)
      statuses.push((await aceitar({ token: `lixo-${i}`.padEnd(30, 'x') })).status)
    expect(statuses).toContain(429)
  })
})

describe('auditoria dos convites', () => {
  it('convidar e cancelar geram registro (quem, o quê) na empresa certa e não aparecem na outra', async () => {
    const d = await adminPronto()
    const outra = await novoDono(app)
    const email = emailUnico('auditado')
    const { convite } = await convidarEPegarToken(d.cookie, email, 'gestor')
    const cancelar = await com(
      http().delete(`/v1/convites/${convite.id}`).set('Origin', ORIGEM_DO_FRONT),
      d.cookie,
    )
    expect(cancelar.status).toBe(204)

    const registros = (await auditoriaDe(d.tenantId)).filter((r) => r.entidade === 'convite')
    expect(registros.map((r) => r.acao)).toEqual(['convidar', 'cancelar_convite'])
    expect(registros[0]).toMatchObject({
      entidade_id: convite.id,
      alteracoes: { email, papel: 'gestor' },
      origem: 'app',
    })
    expect(registros[0]?.membro_id).toBeTruthy()
    expect(JSON.stringify(registros)).not.toMatch(/token/i)
    // a outra empresa não vê nada disso
    expect((await auditoriaDe(outra.tenantId)).filter((r) => r.entidade === 'convite')).toEqual([])
  })

  it('convite recusado (já é da equipe) não gera registro', async () => {
    const d = await adminPronto()
    await membroComEmail(d.tenantId, 'ja@exemplo.com')
    const r = await convidar(d.cookie, { email: 'ja@exemplo.com', papel: 'vendedor' })
    expect(r.status).toBe(409)
    expect((await auditoriaDe(d.tenantId)).filter((x) => x.entidade === 'convite')).toEqual([])
  })
})

describe('GET /v1/membros', () => {
  it('sem sessão 401; lista a equipe da empresa ativa, sem excluídos e sem inativos por padrão', async () => {
    expect((await http().get('/v1/membros')).status).toBe(401)
    const d = await adminPronto()
    await membroSemLogin(d.tenantId, 'Vendedor Externo')
    const inativo = await usuarioSimples(app)
    await vincular(d.tenantId, inativo.id, 'vendedor', 'Inativa')
    await mudarMembro(d.tenantId, inativo.id, 'ativo = false')
    const excluido = await usuarioSimples(app)
    await vincular(d.tenantId, excluido.id, 'vendedor', 'Excluída')
    await mudarMembro(d.tenantId, excluido.id, 'excluido_em = now()')

    const r = await com(http().get('/v1/membros'), d.cookie)
    expect(r.status).toBe(200)
    const nomes = (r.body as MembroDaEquipe[]).map((m) => m.nome)
    expect(nomes).toContain('Vendedor Externo')
    expect(nomes).toContain('Dono de Teste')
    expect(nomes).not.toContain('Inativa')
    expect(nomes).not.toContain('Excluída')
    const todos = (await com(http().get('/v1/membros?incluirInativos=true'), d.cookie))
      .body as MembroDaEquipe[]
    expect(todos.map((m) => m.nome)).toContain('Inativa')
    expect(todos.map((m) => m.nome)).not.toContain('Excluída')
    const externo = (r.body as MembroDaEquipe[]).find((m) => m.nome === 'Vendedor Externo')
    expect(externo).toMatchObject({ temLogin: false, papel: 'vendedor', ativo: true })
    expect((await com(http().get('/v1/membros?incluirInativos=talvez'), d.cookie)).status).toBe(400)
  })

  it('o e-mail só aparece para administradores e gestores; o vendedor vê o resto', async () => {
    const d = await adminPronto()
    await membroComEmail(d.tenantId, 'privado@exemplo.com', 'Com E-mail')
    const gestor = await usuarioSimples(app)
    await vincular(d.tenantId, gestor.id, 'gestor')
    await ativar(gestor.id, d.tenantId)
    const vendedor = await usuarioSimples(app)
    await vincular(d.tenantId, vendedor.id, 'vendedor')
    await ativar(vendedor.id, d.tenantId)
    for (const cookie of [d.cookie, gestor.cookie]) {
      const lista = (await com(http().get('/v1/membros'), cookie)).body as MembroDaEquipe[]
      expect(lista.find((m) => m.nome === 'Com E-mail')?.email).toBe('privado@exemplo.com')
    }
    const vista = (await com(http().get('/v1/membros'), vendedor.cookie)).body as MembroDaEquipe[]
    expect(vista.find((m) => m.nome === 'Com E-mail')).toBeDefined()
    expect(JSON.stringify(vista)).not.toContain('privado@exemplo.com')
    expect(vista.every((m) => !('email' in m))).toBe(true)
  })

  it('mostra só a equipe da empresa ativa, não a de outra empresa do mesmo usuário nem de outra conta', async () => {
    const d = await adminPronto()
    const b = await novaEmpresa(d.contaId)
    await vincular(b, d.usuarioId, 'admin', 'Eu na B')
    await membroSemLogin(b, 'Só da B')
    const outraConta = await novoDono(app)
    await membroSemLogin(outraConta.tenantId, 'De outra conta')
    const naA = (await com(http().get('/v1/membros'), d.cookie)).body as MembroDaEquipe[]
    expect(naA.map((m) => m.nome)).not.toContain('Só da B')
    expect(naA.map((m) => m.nome)).not.toContain('De outra conta')
    await ativar(d.usuarioId, b)
    const naB = (await com(http().get('/v1/membros'), d.cookie)).body as MembroDaEquipe[]
    expect(naB.map((m) => m.nome).sort()).toEqual(['Eu na B', 'Só da B'])
  })
})

import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import request from 'supertest'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { criarApp } from '../app.js'
import { configuracaoDeTeste } from '../testes/app-teste.js'
import {
  bancoDeTeste,
  cnpjUnico,
  emailUnico,
  entrar,
  limparLimitesAuth,
} from '../testes/auth-teste.js'
import { AJUDA, type EntradaSaida, executarCriarConta } from './criar-conta.js'

const owner = bancoDeTeste()
const valkey = new Redis(process.env['REDIS_URL'] ?? '')
afterAll(async () => {
  await owner.end()
  await valkey.quit()
})
beforeEach(() => limparLimitesAuth(valkey))

const SENHA = 'senha-do-terminal-123'

/** Entrada e saída falsas: guarda tudo o que o comando imprimiu. */
function io(senhaDoPrompt?: string) {
  const saida: string[] = []
  const erros: string[] = []
  const entradaSaida: EntradaSaida = {
    imprimir: (l) => saida.push(l),
    imprimirErro: (l) => erros.push(l),
    lerSenha: () => Promise.resolve(senhaDoPrompt ?? ''),
  }
  return { entradaSaida, saida, erros, tudo: () => [...saida, ...erros].join('\n') }
}

const argumentos = (email: string, extra: string[] = []) => [
  '--nome',
  'Ana do Terminal',
  '--email',
  email,
  '--empresa',
  `Empresa do Terminal ${Date.now()} Ltda`,
  ...extra,
]
const envTeste = (extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  LOG_LEVEL: 'silent',
  CRIAR_CONTA_SENHA: SENHA,
  ...extra,
})

describe('node dist/criar-conta.js (o mesmo fluxo do POST /v1/primeiro-acesso)', () => {
  it('cria conta, empresa e administrador; o e-mail já nasce confirmado e o login funciona', async () => {
    const email = emailUnico('terminal')
    const { entradaSaida, saida, tudo } = io()
    const codigo = await executarCriarConta(
      argumentos(email, ['--cnpj', cnpjUnico(), '--nome-fantasia', 'Terminal']),
      envTeste(),
      entradaSaida,
    )
    expect(codigo).toBe(0)
    expect(saida[0]).toBe('Conta criada.')
    expect(tudo()).toContain(email)
    expect(tudo()).not.toContain(SENHA) // a senha nunca é impressa

    const [u] = await owner<
      { id: string; email_verified: boolean }[]
    >`SELECT id, email_verified FROM auth."user" WHERE email = ${email}`
    expect(u?.email_verified).toBe(true)
    const [admin] =
      await owner`SELECT papel, conta_id FROM conta_administradores WHERE usuario_id = ${u?.id ?? ''}`
    expect(admin?.['papel']).toBe('dono')
    // a empresa tem RLS: o id vem da própria saída do comando ("empresa <uuid>")
    const tenantId = /empresa ([0-9a-f-]{36})/.exec(tudo())?.[1] ?? ''
    expect(tenantId).toMatch(/^[0-9a-f]{8}-/)
    const membro = await owner.begin(async (tx) => {
      await tx`SELECT set_config('app.tenant_id', ${tenantId}, true)`
      return (await tx`SELECT papel, usuario_id FROM membros`)[0]
    })
    expect(membro).toEqual({ papel: 'admin', usuario_id: u?.id })

    const app: INestApplication<Server> = await criarApp(
      configuracaoDeTeste({ VERIFICACAO_EMAIL: 'true' }),
    )
    await app.init()
    try {
      expect((await entrar(app, email, SENHA)).status).toBe(200) // mesmo com verificação ligada: já confirmado
      expect((await request(app.getHttpServer()).get('/health')).status).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('funciona com o endpoint FECHADO (é o caminho para criar a primeira conta em produção)', async () => {
    const r = io()
    expect(
      await executarCriarConta(
        argumentos(emailUnico('fechado')),
        envTeste({ PRIMEIRO_ACESSO: 'fechado' }),
        r.entradaSaida,
      ),
    ).toBe(0)
  })

  it('lê a senha do prompt/entrada padrão quando não há CRIAR_CONTA_SENHA', async () => {
    const email = emailUnico('prompt')
    const r = io('senha-lida-do-prompt-1')
    const env = envTeste()
    delete env['CRIAR_CONTA_SENHA']
    expect(await executarCriarConta(argumentos(email), env, r.entradaSaida)).toBe(0)
    const app = await criarApp(configuracaoDeTeste())
    await app.init()
    try {
      expect((await entrar(app, email, 'senha-lida-do-prompt-1')).status).toBe(200)
    } finally {
      await app.close()
    }
  })

  it('dados inválidos: código 2, lista os campos e não cria nada (nem ecoa a senha)', async () => {
    const r = io()
    const antes = (await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM contas`)[0]?.n
    const codigo = await executarCriarConta(
      ['--nome', 'A', '--email', 'xxx', '--empresa', '', '--cnpj', '11222333000182'],
      envTeste({ CRIAR_CONTA_SENHA: 'curta' }),
      r.entradaSaida,
    )
    expect(codigo).toBe(2)
    for (const campo of ['nome', 'email', 'senha', 'empresa.razaoSocial', 'empresa.cnpj'])
      expect(r.tudo()).toContain(campo)
    expect(r.tudo()).not.toContain('curta')
    expect((await owner<{ n: number }[]>`SELECT count(*)::int AS n FROM contas`)[0]?.n).toBe(antes)
  })

  it('senha vazia (pipe sem linha) é recusada', async () => {
    const r = io('')
    const env = envTeste()
    delete env['CRIAR_CONTA_SENHA']
    expect(await executarCriarConta(argumentos(emailUnico('vazia')), env, r.entradaSaida)).toBe(2)
    expect(r.tudo()).toContain('senha')
  })

  it('e-mail já cadastrado: código 1 com mensagem clara, sem sobras', async () => {
    const email = emailUnico('duplicado')
    expect(await executarCriarConta(argumentos(email), envTeste(), io().entradaSaida)).toBe(0)

    const mesmoEmail = io()
    expect(await executarCriarConta(argumentos(email), envTeste(), mesmoEmail.entradaSaida)).toBe(1)
    expect(mesmoEmail.tudo()).toContain('Já existe uma conta com este e-mail')
  })

  it('--ajuda mostra o uso (código 0); opção desconhecida dá código 2', async () => {
    const ajuda = io()
    expect(await executarCriarConta(['--ajuda'], envTeste(), ajuda.entradaSaida)).toBe(0)
    expect(ajuda.saida.join('\n')).toBe(AJUDA)
    expect(AJUDA).toContain('A senha NÃO vai em argumento')

    const desconhecida = io()
    expect(await executarCriarConta(['--senha', 'x'], envTeste(), desconhecida.entradaSaida)).toBe(
      2,
    )
    expect(desconhecida.erros.join('\n')).toContain('--senha')
  })

  it('configuração inválida: código 1 com a lista do que falta, sem mostrar valores', async () => {
    const r = io()
    const env: NodeJS.ProcessEnv = { CRIAR_CONTA_SENHA: SENHA, PATH: process.env['PATH'] }
    expect(await executarCriarConta(argumentos(emailUnico('semconfig')), env, r.entradaSaida)).toBe(
      1,
    )
    expect(r.tudo()).toContain('DATABASE_URL: obrigatória')
    expect(r.tudo()).not.toContain(SENHA)
  })
})

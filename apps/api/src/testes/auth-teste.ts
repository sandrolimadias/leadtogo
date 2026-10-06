import type { Server } from 'node:http'

import type { INestApplication } from '@nestjs/common'
import { Redis } from 'ioredis'
import postgres from 'postgres'
import request from 'supertest'

import { completarCnpj } from '@leadtogo/shared'
import { AuthService } from '../auth/auth.service.js'
import { PREFIXO_LIMITE_AUTH } from '../auth/rate-limit-valkey.js'

/** Origem do front nos testes (APP_URL do ambiente de teste). */
export const ORIGEM_DO_FRONT = 'http://localhost:5173'

export const SENHA_PADRAO = 'senha-forte-123'

let contador = 0
export function emailUnico(prefixo = 'usuario'): string {
  contador += 1
  return `${prefixo}-${Date.now()}-${contador}@exemplo.com`
}

/** CNPJ alfanumérico válido e diferente a cada chamada (o banco de teste é compartilhado entre os testes). */
export function cnpjUnico(): string {
  const base = Array.from(
    { length: 12 },
    () => 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'[Math.floor(Math.random() * 34)],
  ).join('')
  return completarCnpj(base)
}

/** Cria um usuário com senha pelo servidor (o cadastro público está desligado). */
export async function criarUsuario(
  app: INestApplication<Server>,
  dados: { email?: string; senha?: string; nome?: string; emailVerificado?: boolean } = {},
) {
  const email = dados.email ?? emailUnico()
  const senha = dados.senha ?? SENHA_PADRAO
  const { id } = await app.get(AuthService).criarUsuarioComSenha({
    nome: dados.nome ?? 'Usuário de Teste',
    email,
    senha,
    emailVerificado: dados.emailVerificado ?? true,
  })
  return { id, email, senha }
}

/** Faz o login e devolve os cabeçalhos Set-Cookie e o corpo. */
export async function entrar(
  app: INestApplication<Server>,
  email: string,
  senha: string = SENHA_PADRAO,
  origem: string = ORIGEM_DO_FRONT,
) {
  const resposta = await request(app.getHttpServer())
    .post('/v1/auth/sign-in/email')
    .set('Origin', origem)
    .send({ email, password: senha })
  const cookies = (resposta.headers['set-cookie'] as string[] | string | undefined) ?? []
  const lista = Array.isArray(cookies) ? cookies : [cookies]
  return {
    status: resposta.status,
    body: resposta.body as Record<string, unknown>,
    setCookie: lista,
    /** Valor para o cabeçalho Cookie das próximas requisições */
    cookie: lista.map((c) => c.split(';')[0]).join('; '),
  }
}

/** Conexão do owner no banco de teste da API (para conferir o que ficou gravado). */
export function bancoDeTeste() {
  return postgres(process.env['TEST_API_DATABASE_MIGRATION_URL'] ?? '', {
    max: 2,
    onnotice: () => {},
  })
}

/** Limpa os contadores do rate limit do Better Auth no Valkey de teste. */
export async function limparLimitesAuth(valkey: Redis): Promise<void> {
  const chaves = await valkey.keys(`${PREFIXO_LIMITE_AUTH}*`)
  if (chaves.length > 0) await valkey.del(...chaves)
}

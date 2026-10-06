import { Inject, Injectable } from '@nestjs/common'
import type { Request } from 'express'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'

import { ErroApi } from '../http/erro-api.js'
import type { Auth } from './auth.factory.js'
import { AUTH } from './auth.tokens.js'

export interface NovoUsuario {
  nome: string
  email: string
  senha: string
  /** E-mail já confirmado (ex.: quem aceita um convite recebido nesse endereço) */
  emailVerificado?: boolean
}

/** Operações de identidade feitas pelo servidor (o cadastro público do Better Auth está desligado). */
@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  /** Envia (ou reenvia) o e-mail de confirmação; o link leva de volta ao front. */
  async enviarVerificacaoDeEmail(email: string): Promise<void> {
    await this.auth.api.sendVerificationEmail({
      body: { email, callbackURL: new URL(this.config.APP_URL).origin },
    })
  }

  /** Cria usuário com senha (hash scrypt do Better Auth). Falha com 409 se o e-mail já existe. */
  async criarUsuarioComSenha(dados: NovoUsuario): Promise<{ id: string }> {
    const contexto = await this.auth.$context
    const email = dados.email.trim().toLowerCase()
    if (dados.senha.length < 10 || dados.senha.length > 128) {
      throw new ErroApi('senha_invalida', 'A senha deve ter entre 10 e 128 caracteres.', 400)
    }
    if (await contexto.internalAdapter.findUserByEmail(email, { includeAccounts: false })) {
      throw new ErroApi('email_ja_cadastrado', 'Já existe uma conta com este e-mail.', 409)
    }
    const usuario = await contexto.internalAdapter.createUser(
      { name: dados.nome.trim(), email, emailVerified: dados.emailVerificado ?? false },
      { method: 'email-password' },
    )
    await contexto.internalAdapter.linkAccount({
      userId: usuario.id,
      providerId: 'credential',
      accountId: usuario.id,
      password: await contexto.password.hash(dados.senha),
    })
    return { id: usuario.id }
  }

  /** Sessão da requisição (cookie), ou null. */
  async obterSessao(req: Request) {
    return this.auth.api.getSession({ headers: new Headers(req.headers as Record<string, string>) })
  }
}

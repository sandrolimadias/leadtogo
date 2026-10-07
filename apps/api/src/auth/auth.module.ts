import { type Conexao } from '@leadtogo/db'
import { Global, Module } from '@nestjs/common'
import type { Redis } from 'ioredis'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { EmailService } from '../email/email.service.js'
import { BANCO, VALKEY } from '../infra/infra.module.js'
import { type Auth, criarAuth } from './auth.factory.js'
import { AcessoPublicoController } from './acesso-publico.controller.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { AUTH } from './auth.tokens.js'

@Global()
@Module({
  controllers: [AuthController, AcessoPublicoController],
  providers: [
    {
      provide: AUTH,
      inject: [CONFIGURACAO, BANCO, VALKEY, EmailService],
      useFactory: (
        config: Configuracao,
        banco: Conexao,
        valkey: Redis,
        email: EmailService,
      ): Auth => criarAuth({ config, banco, valkey, email }),
    },
    AuthService,
  ],
  exports: [AUTH, AuthService],
})
export class AuthModule {}

import { type DynamicModule, Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import type { DestinationStream } from 'pino'

import type { Configuracao } from './configuracao/configuracao.js'
import { AuthModule } from './auth/auth.module.js'
import { ConfiguracaoModule } from './configuracao/configuracao.module.js'
import { FiltroDeExcecoes } from './http/filtro-excecoes.js'
import { HealthModule } from './health/health.module.js'
import { InfraModule } from './infra/infra.module.js'
import { LogModule } from './log/log.module.js'
import { LimiteDeRequisicoesGuard } from './rate-limit/limite.guard.js'

export interface OpcoesApp {
  /** Destino dos logs (padrão: stdout). Os testes usam para capturar as linhas. */
  destinoLog?: DestinationStream
}

@Module({})
export class AppModule {
  static registrar(config: Configuracao, opcoes: OpcoesApp = {}): DynamicModule {
    return {
      module: AppModule,
      providers: [
        { provide: APP_FILTER, useClass: FiltroDeExcecoes },
        { provide: APP_GUARD, useClass: LimiteDeRequisicoesGuard },
      ],
      imports: [
        ConfiguracaoModule.com(config),
        LogModule.com(config, opcoes.destinoLog),
        InfraModule,
        AuthModule,
        HealthModule,
      ],
    }
  }
}

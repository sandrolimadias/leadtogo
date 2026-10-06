import { type DynamicModule, Module } from '@nestjs/common'
import type { DestinationStream } from 'pino'

import type { Configuracao } from './configuracao/configuracao.js'
import { ConfiguracaoModule } from './configuracao/configuracao.module.js'
import { HealthModule } from './health/health.module.js'
import { InfraModule } from './infra/infra.module.js'
import { LogModule } from './log/log.module.js'

export interface OpcoesApp {
  /** Destino dos logs (padrão: stdout). Os testes usam para capturar as linhas. */
  destinoLog?: DestinationStream
}

@Module({})
export class AppModule {
  static registrar(config: Configuracao, opcoes: OpcoesApp = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfiguracaoModule.com(config),
        LogModule.com(config, opcoes.destinoLog),
        InfraModule,
        HealthModule,
      ],
    }
  }
}

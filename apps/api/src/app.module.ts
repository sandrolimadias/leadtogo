import { type DynamicModule, Module } from '@nestjs/common'

import type { Configuracao } from './configuracao/configuracao.js'
import { ConfiguracaoModule } from './configuracao/configuracao.module.js'
import { HealthModule } from './health/health.module.js'

@Module({})
export class AppModule {
  static registrar(config: Configuracao): DynamicModule {
    return { module: AppModule, imports: [ConfiguracaoModule.com(config), HealthModule] }
  }
}

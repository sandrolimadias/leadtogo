import { type DynamicModule, Module } from '@nestjs/common'

import type { Configuracao } from './configuracao/configuracao.js'
import { ConfiguracaoModule } from './configuracao/configuracao.module.js'

/** Módulo do worker: processadores BullMQ, sincronizações e entregas de webhook entram aqui. */
@Module({})
export class WorkerModule {
  static registrar(config: Configuracao): DynamicModule {
    return { module: WorkerModule, imports: [ConfiguracaoModule.com(config)] }
  }
}

import { type DynamicModule, Module } from '@nestjs/common'

import type { Configuracao } from './configuracao/configuracao.js'
import { ConfiguracaoModule } from './configuracao/configuracao.module.js'
import { InfraModule } from './infra/infra.module.js'

/** Módulo do worker: só a infraestrutura (banco, Valkey); as filas são montadas em worker/iniciar.ts. */
@Module({})
export class WorkerModule {
  static registrar(config: Configuracao): DynamicModule {
    return { module: WorkerModule, imports: [ConfiguracaoModule.com(config), InfraModule] }
  }
}

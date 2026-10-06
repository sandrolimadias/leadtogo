import { type DynamicModule, Global, Module } from '@nestjs/common'

import type { Configuracao } from './configuracao.js'

/** Token de injeção da configuração validada: `@Inject(CONFIGURACAO) config: Configuracao`. */
export const CONFIGURACAO = Symbol('CONFIGURACAO')

@Global()
@Module({})
export class ConfiguracaoModule {
  static com(config: Configuracao): DynamicModule {
    return {
      module: ConfiguracaoModule,
      providers: [{ provide: CONFIGURACAO, useValue: config }],
      exports: [CONFIGURACAO],
    }
  }
}

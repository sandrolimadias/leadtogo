import { Module } from '@nestjs/common'

import { ChaveGuard } from './chave.guard.js'
import { ChaveInterceptor } from './chave.interceptor.js'
import { ChavesController } from './chaves.controller.js'
import { ChavesService } from './chaves.service.js'
import { PublicaModule } from './publica/publica.module.js'

/** API aberta (docs/plano_api_aberta.md): chaves de API, API pública e webhooks. */
@Module({
  imports: [PublicaModule],
  controllers: [ChavesController],
  providers: [ChavesService, ChaveGuard, ChaveInterceptor],
  exports: [ChaveGuard, ChaveInterceptor],
})
export class IntegracoesModule {}

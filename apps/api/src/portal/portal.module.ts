import { Module } from '@nestjs/common'

import { LimitePorChave } from './limite-por-chave.js'
import { PortalAuthController } from './portal-auth.controller.js'
import { PortalEntradaService } from './portal-entrada.service.js'
import { PortalLinksService } from './portal-links.service.js'
import { PortalSegundoFatorService } from './portal-segundo-fator.service.js'
import { PortalSessaoService } from './portal-sessao.service.js'
import { PortalGuard } from './portal.guard.js'
import { PortalInterceptor } from './portal.interceptor.js'

@Module({
  controllers: [PortalAuthController],
  providers: [
    LimitePorChave,
    PortalLinksService,
    PortalSessaoService,
    PortalEntradaService,
    PortalSegundoFatorService,
    PortalGuard,
    PortalInterceptor,
  ],
  exports: [
    LimitePorChave,
    PortalLinksService,
    PortalSessaoService,
    PortalEntradaService,
    PortalGuard,
    PortalInterceptor,
  ],
})
export class PortalModule {}

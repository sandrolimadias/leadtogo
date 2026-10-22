import { Global, Module } from '@nestjs/common'

import { AcessoGuard } from './acesso.guard.js'
import { ContextoTenantService } from './contexto-tenant.service.js'
import { PermissaoService } from './permissao.service.js'
import { TenantInterceptor } from './tenant.interceptor.js'
import { VinculosService } from './vinculos.service.js'

/** Controle de acesso: guard global (sessão, empresa ativa, 2FA do admin) e transação com o tenant. */
@Global()
@Module({
  providers: [
    VinculosService,
    ContextoTenantService,
    PermissaoService,
    AcessoGuard,
    TenantInterceptor,
  ],
  exports: [
    VinculosService,
    ContextoTenantService,
    PermissaoService,
    AcessoGuard,
    TenantInterceptor,
  ],
})
export class AcessoModule {}

import { type DynamicModule, Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import type { DestinationStream } from 'pino'

import type { Configuracao } from './configuracao/configuracao.js'
import { AcessoGuard } from './acesso/acesso.guard.js'
import { AcessoModule } from './acesso/acesso.module.js'
import { TenantInterceptor } from './acesso/tenant.interceptor.js'
import { AuditoriaModule } from './auditoria/auditoria.module.js'
import { AuthModule } from './auth/auth.module.js'
import { CadastrosModule } from './cadastros/cadastros.module.js'
import { CarteiraModule } from './carteira/carteira.module.js'
import { ConfiguracoesModule } from './configuracoes/configuracoes.module.js'
import { MeModule } from './me/me.module.js'
import { ReceitaModule } from './receita/receita.module.js'
import { PrimeiroAcessoModule } from './primeiro-acesso/primeiro-acesso.module.js'
import { ConfiguracaoModule } from './configuracao/configuracao.module.js'
import { PerfisModule } from './perfis/perfis.module.js'
import { ConvitesModule } from './convites/convites.module.js'
import { EmailModule } from './email/email.module.js'
import { EmpresasModule } from './empresas/empresas.module.js'
import { FiltroDeExcecoes } from './http/filtro-excecoes.js'
import { HealthModule } from './health/health.module.js'
import { GeolocalizacaoModule } from './geolocalizacao/geolocalizacao.module.js'
import { ImportacaoModule } from './importacao/importacao.module.js'
import { MapaModule } from './mapa/mapa.module.js'
import { RotasModule } from './rotas/rotas.module.js'
import { InfraModule } from './infra/infra.module.js'
import { LogModule } from './log/log.module.js'
import { LimiteDeRequisicoesGuard } from './rate-limit/limite.guard.js'
import { VisitasModule } from './visitas/visitas.module.js'

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
        // Ordem: primeiro o rate limit, depois o controle de acesso (sessão, empresa, 2FA)
        { provide: APP_GUARD, useClass: LimiteDeRequisicoesGuard },
        { provide: APP_GUARD, useClass: AcessoGuard },
        { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
      ],
      imports: [
        ConfiguracaoModule.com(config),
        LogModule.com(config, opcoes.destinoLog),
        InfraModule,
        EmailModule,
        AuthModule,
        AcessoModule,
        AuditoriaModule,
        MeModule,
        ConfiguracoesModule,
        CadastrosModule,
        VisitasModule,
        CarteiraModule,
        ConvitesModule,
        PerfisModule,
        ImportacaoModule,
        GeolocalizacaoModule,
        MapaModule,
        RotasModule,
        EmpresasModule,
        PrimeiroAcessoModule,
        ReceitaModule,
        HealthModule,
      ],
    }
  }
}

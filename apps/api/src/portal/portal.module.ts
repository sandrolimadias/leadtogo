import { Module } from '@nestjs/common'

import { LimitePorChave } from './limite-por-chave.js'
import { CarteiraModule } from '../carteira/carteira.module.js'
import { PortalHubService } from './portal-hub.service.js'
import { PortalHubController, TarefasDoChamadoController } from './portal-hub.controller.js'
import { ChamadosModule } from '../chamados/chamados.module.js'
import { NotificacoesModule } from '../notificacoes/notificacoes.module.js'
import { PortalAnexosService } from './portal-anexos.service.js'
import { PortalChamadosService } from './portal-chamados.service.js'
import { PortalNotificacoesService } from './portal-notificacoes.service.js'
import {
  PortalChamadosController,
  PortalNotificacoesController,
} from './portal-chamados.controller.js'
import { PortalAcessosService } from './portal-acessos.service.js'
import {
  PortalAcessosController,
  PortalConfiguracaoController,
  PortalPedidosController,
} from './portal-gestao.controller.js'
import { PortalPedidosClienteController } from './portal-pedidos-cliente.controller.js'
import { PortalPedidosService } from './portal-pedidos.service.js'
import { PortalAuthController } from './portal-auth.controller.js'
import { PortalEntradaService } from './portal-entrada.service.js'
import { PortalLinksService } from './portal-links.service.js'
import { PortalSegundoFatorService } from './portal-segundo-fator.service.js'
import { PortalSessaoService } from './portal-sessao.service.js'
import { PortalPublicacoesController } from './portal-publicacoes.controller.js'
import { PortalPublicacoesService } from './portal-publicacoes.service.js'
import { PublicacoesController } from './publicacoes.controller.js'
import { PublicacoesService } from './publicacoes.service.js'
import { PortalGuard } from './portal.guard.js'
import { PortalInterceptor } from './portal.interceptor.js'

@Module({
  imports: [ChamadosModule, NotificacoesModule, CarteiraModule],
  controllers: [
    PortalAuthController,
    PortalChamadosController,
    PortalNotificacoesController,
    PortalPedidosClienteController,
    PortalAcessosController,
    PortalPedidosController,
    PortalConfiguracaoController,
    PortalHubController,
    TarefasDoChamadoController,
    PublicacoesController,
    PortalPublicacoesController,
  ],
  providers: [
    LimitePorChave,
    PortalLinksService,
    PortalSessaoService,
    PublicacoesService,
    PortalPublicacoesService,
    PortalEntradaService,
    PortalSegundoFatorService,
    PortalAcessosService,
    PortalPedidosService,
    PortalHubService,
    PortalChamadosService,
    PortalAnexosService,
    PortalNotificacoesService,
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

import { Module } from '@nestjs/common'

import { NotificacoesController } from './notificacoes.controller.js'
import { NotificacoesService } from './notificacoes.service.js'
import { TempoRealDoSino } from './tempo-real.service.js'

/** O sino do CRM (Fase 2): REST + SSE. As notificações dos chamados nascem no worker (`chamado.notificar`). */
@Module({
  controllers: [NotificacoesController],
  providers: [NotificacoesService, TempoRealDoSino],
  exports: [TempoRealDoSino],
})
export class NotificacoesModule {}

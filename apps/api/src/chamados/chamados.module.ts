import { Module } from '@nestjs/common'

import { AreasService } from './areas.service.js'
import { ConfiguracaoDeChamadosController } from './configuracao.controller.js'
import { ExpedienteService } from './expediente.service.js'
import { TriagemService } from './triagem.service.js'

/**
 * Central de chamados (Fase 2): lado da equipe. Os controllers de configuração vêm antes dos chamados
 * (`/chamados/areas` não pode cair em `/chamados/:id`).
 */
@Module({
  controllers: [ConfiguracaoDeChamadosController],
  providers: [AreasService, TriagemService, ExpedienteService],
  exports: [AreasService, TriagemService, ExpedienteService],
})
export class ChamadosModule {}

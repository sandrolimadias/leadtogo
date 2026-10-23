import { Module } from '@nestjs/common'

import { AcessoDeChamados } from './acesso-chamados.js'
import { AreasService } from './areas.service.js'
import { ChamadosController } from './chamados.controller.js'
import { ChamadosService } from './chamados.service.js'
import { ConfiguracaoDeChamadosController } from './configuracao.controller.js'
import { ExpedienteService } from './expediente.service.js'
import { TriagemService } from './triagem.service.js'

/**
 * Central de chamados (Fase 2): lado da equipe. Os controllers de configuração vêm antes dos chamados
 * (`/chamados/areas` não pode cair em `/chamados/:id`).
 */
@Module({
  controllers: [ConfiguracaoDeChamadosController, ChamadosController],
  providers: [AreasService, TriagemService, ExpedienteService, AcessoDeChamados, ChamadosService],
  exports: [AreasService, TriagemService, ExpedienteService, AcessoDeChamados, ChamadosService],
})
export class ChamadosModule {}

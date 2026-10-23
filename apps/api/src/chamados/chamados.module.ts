import { Module } from '@nestjs/common'

import { AcessoDeChamados } from './acesso-chamados.js'
import { AnexosService } from './anexos.service.js'
import { AreasService } from './areas.service.js'
import { ChamadosController } from './chamados.controller.js'
import { ChamadosService } from './chamados.service.js'
import { ConfiguracaoDeChamadosController } from './configuracao.controller.js'
import { ConversaDoChamadoController } from './conversa.controller.js'
import { ExpedienteService } from './expediente.service.js'
import { MensagensService } from './mensagens.service.js'
import { MetricasDeChamadosController } from './metricas.controller.js'
import { MetricasService } from './metricas.service.js'
import { TriagemService } from './triagem.service.js'

/**
 * Central de chamados (Fase 2): lado da equipe. Os controllers de configuração vêm antes dos chamados
 * (`/chamados/areas` não pode cair em `/chamados/:id`).
 */
@Module({
  controllers: [
    ConfiguracaoDeChamadosController,
    MetricasDeChamadosController,
    ChamadosController,
    ConversaDoChamadoController,
  ],
  providers: [
    AreasService,
    TriagemService,
    ExpedienteService,
    AcessoDeChamados,
    ChamadosService,
    MensagensService,
    AnexosService,
    MetricasService,
  ],
  exports: [
    AreasService,
    TriagemService,
    ExpedienteService,
    AcessoDeChamados,
    ChamadosService,
    MensagensService,
    AnexosService,
  ],
})
export class ChamadosModule {}

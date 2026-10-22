import { Module } from '@nestjs/common'

import { ConfiguracaoDeVisitasService } from './checkin.service.js'
import { ModelosDeVisitaService } from './modelos.service.js'
import { ResultadosDeVisitaService } from './resultados.service.js'
import {
  ConfiguracaoDeVisitasController,
  ModelosDeVisitaController,
  ResultadosDeVisitaController,
} from './visitas.controller.js'

/** Visitas (G3): resultados, modelos do relatório e configuração do check-in. */
@Module({
  controllers: [
    ResultadosDeVisitaController,
    ModelosDeVisitaController,
    ConfiguracaoDeVisitasController,
  ],
  providers: [ResultadosDeVisitaService, ModelosDeVisitaService, ConfiguracaoDeVisitasService],
})
export class VisitasModule {}

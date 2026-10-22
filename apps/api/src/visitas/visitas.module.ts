import { Module } from '@nestjs/common'

import { CarteiraModule } from '../carteira/carteira.module.js'
import { VisitasDoCampoController } from './campo.controller.js'
import { VisitasDoCampoService } from './campo.service.js'
import { ConfiguracaoDeVisitasService } from './checkin.service.js'
import { ModelosDeVisitaService } from './modelos.service.js'
import { ResultadosDeVisitaService } from './resultados.service.js'
import {
  ConfiguracaoDeVisitasController,
  ModelosDeVisitaController,
  ResultadosDeVisitaController,
} from './visitas.controller.js'

/** Visitas (G3): resultados, modelos do relatório, configuração do check-in e o campo (check-in e relatório). */
@Module({
  imports: [CarteiraModule],
  controllers: [
    VisitasDoCampoController,
    ResultadosDeVisitaController,
    ModelosDeVisitaController,
    ConfiguracaoDeVisitasController,
  ],
  providers: [
    ResultadosDeVisitaService,
    ModelosDeVisitaService,
    ConfiguracaoDeVisitasService,
    VisitasDoCampoService,
  ],
})
export class VisitasModule {}

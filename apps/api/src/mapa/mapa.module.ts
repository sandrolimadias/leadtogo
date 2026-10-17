import { Module } from '@nestjs/common'

import { GeolocalizacaoModule } from '../geolocalizacao/geolocalizacao.module.js'
import { MapaController } from './mapa.controller.js'
import { MapaService } from './mapa.service.js'
import { TilesDoMapaController } from './tiles.controller.js'

/** Mapa (G2): tiles do estado servidos do Garage e os dados das empresas no mapa. */
@Module({
  imports: [GeolocalizacaoModule],
  controllers: [TilesDoMapaController, MapaController],
  providers: [MapaService],
})
export class MapaModule {}

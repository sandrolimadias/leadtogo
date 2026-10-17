import { Module } from '@nestjs/common'

import { GeolocalizacaoController } from './geolocalizacao.controller.js'
import { GeolocalizacaoService } from './geolocalizacao.service.js'
import { LotesGeoService } from './lotes-geo.service.js'
import { RegioesGeoService } from './regioes.service.js'

/** Geolocalização e rotas (G1): posição das empresas, lotes, regiões e a fila "Confirmar endereço". */
@Module({
  controllers: [GeolocalizacaoController],
  providers: [GeolocalizacaoService, LotesGeoService, RegioesGeoService],
})
export class GeolocalizacaoModule {}

import { Module } from '@nestjs/common'

import { MeController } from './me.controller.js'
import { MeService } from './me.service.js'
import { PreferenciasController } from './preferencias.controller.js'
import { PreferenciasService } from './preferencias.service.js'

@Module({
  controllers: [MeController, PreferenciasController],
  providers: [MeService, PreferenciasService],
  exports: [MeService, PreferenciasService],
})
export class MeModule {}

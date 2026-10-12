import { Module } from '@nestjs/common'

import { ConvitesController, ConvitesPublicosController } from './convites.controller.js'
import { ConvitesService } from './convites.service.js'
import { MembrosController } from './membros.controller.js'
import { MembrosService } from './membros.service.js'

@Module({
  controllers: [ConvitesController, ConvitesPublicosController, MembrosController],
  providers: [ConvitesService, MembrosService],
  exports: [ConvitesService],
})
export class ConvitesModule {}

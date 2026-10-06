import { Module } from '@nestjs/common'

import { ConvitesController, ConvitesPublicosController } from './convites.controller.js'
import { ConvitesService } from './convites.service.js'
import { MembrosController } from './membros.controller.js'

@Module({
  controllers: [ConvitesController, ConvitesPublicosController, MembrosController],
  providers: [ConvitesService],
  exports: [ConvitesService],
})
export class ConvitesModule {}

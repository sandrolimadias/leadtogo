import { Module } from '@nestjs/common'

import { PerfilDoMembroController, PerfisController } from './perfis.controller.js'
import { PerfisService } from './perfis.service.js'

@Module({
  controllers: [PerfisController, PerfilDoMembroController],
  providers: [PerfisService],
})
export class PerfisModule {}

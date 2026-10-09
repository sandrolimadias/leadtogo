import { Module } from '@nestjs/common'

import { AlertasController } from './alertas.controller.js'
import { AlertasService } from './alertas.service.js'
import { HealthController } from './health.controller.js'
import { HealthService } from './health.service.js'

@Module({
  controllers: [HealthController, AlertasController],
  providers: [HealthService, AlertasService],
})
export class HealthModule {}

import { Controller, Get, Inject } from '@nestjs/common'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'

@Controller('health')
export class HealthController {
  constructor(@Inject(CONFIGURACAO) private readonly config: Configuracao) {}

  @Get()
  verificar() {
    return { status: 'ok', version: this.config.APP_VERSION }
  }
}

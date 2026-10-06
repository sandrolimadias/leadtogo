import { Controller, Get } from '@nestjs/common'

import { VERSAO } from '../versao.js'

@Controller('health')
export class HealthController {
  @Get()
  verificar() {
    return { status: 'ok', version: VERSAO }
  }
}

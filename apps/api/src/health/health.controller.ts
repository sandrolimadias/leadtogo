import { Controller, Get, Res } from '@nestjs/common'
import type { Response } from 'express'

import { SemLimite } from '../rate-limit/limite.decorator.js'
import { HealthService, type RelatorioSaude } from './health.service.js'

@SemLimite()
@Controller('health')
export class HealthController {
  constructor(private readonly saude: HealthService) {}

  /** 200 com tudo saudável; 503 se banco, Valkey ou Garage falhar (o smoke test do deploy depende disso). */
  @Get()
  async verificar(@Res({ passthrough: true }) res: Response): Promise<RelatorioSaude> {
    const relatorio = await this.saude.verificar()
    if (relatorio.status !== 'ok') res.status(503)
    return relatorio
  }
}

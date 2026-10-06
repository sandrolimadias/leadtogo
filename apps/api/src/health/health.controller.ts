import { Controller, Get, Res } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { saudeSchema } from '@leadtogo/shared'
import { Documenta } from '../documentacao/documenta.js'
import { Publica } from '../acesso/acesso.decorators.js'
import type { Response } from 'express'

import { SemLimite } from '../rate-limit/limite.decorator.js'
import { HealthService, type RelatorioSaude } from './health.service.js'

@Publica()
@SemLimite()
@ApiTags('Saúde')
@Controller('health')
export class HealthController {
  constructor(private readonly saude: HealthService) {}

  /** 200 com tudo saudável; 503 se banco, Valkey ou Garage falhar (o smoke test do deploy depende disso). */
  @Documenta({
    resumo: 'Saúde do serviço',
    descricao:
      'Verifica banco, Valkey e Garage (2 s no máximo cada). 200 com tudo saudável; 503 se algum falhar, sem detalhes do erro.',
    resposta: saudeSchema,
    erros: [503],
  })
  @Get()
  async verificar(@Res({ passthrough: true }) res: Response): Promise<RelatorioSaude> {
    const relatorio = await this.saude.verificar()
    if (relatorio.status !== 'ok') res.status(503)
    return relatorio
  }
}

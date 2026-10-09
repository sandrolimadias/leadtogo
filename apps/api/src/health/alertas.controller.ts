import { createHash, timingSafeEqual } from 'node:crypto'

import { Controller, Get, Headers, Inject, Res } from '@nestjs/common'
import { alertasSchema } from '@leadtogo/shared'
import { ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { Publica } from '../acesso/acesso.decorators.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { Documenta } from '../documentacao/documenta.js'
import { ErroApi } from '../http/erro-api.js'
import { AlertasService, type RelatorioAlertas } from './alertas.service.js'

/** Compara em tempo constante: o hash tem sempre o mesmo tamanho, então o comprimento não vaza. */
export function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  const hash = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(hash(recebido ?? ''), hash(esperado)) && recebido !== undefined
}

/**
 * Endpoint do Uptime Kuma (docs/runbook_observabilidade.md): 200 com tudo em dia, 503 quando há eventos
 * do outbox esgotados ou falhas de jobs acima do limite. Protegido por token no cabeçalho
 * `X-Alertas-Token`; sem `ALERTAS_TOKEN` configurado o endpoint não existe (404). Fora do OpenAPI e
 * do prefixo /v1, como o /health. Fica sob o limite de requisições global (tentativas de adivinhar o token).
 */
@Publica()
@ApiTags('Saúde')
@Controller('health/alertas')
export class AlertasController {
  constructor(
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    private readonly alertas: AlertasService,
  ) {}

  @Documenta({
    resumo: 'Alertas operacionais (Uptime Kuma)',
    descricao:
      'Protegido pelo cabeçalho X-Alertas-Token (variável ALERTAS_TOKEN; sem ela o endpoint responde 404). 200 com tudo em dia; 503 com eventos do outbox esgotados e não tratados, falhas finais de jobs (últimas 24 h) a partir do limite, ou se não for possível verificar. Só contagens.',
    resposta: alertasSchema,
    erros: [401, 404, 503],
  })
  @Get()
  async verificar(
    @Headers('x-alertas-token') token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RelatorioAlertas> {
    const esperado = this.config.ALERTAS_TOKEN
    if (!esperado) throw new ErroApi('nao_encontrado', 'Recurso não encontrado.', 404)
    if (!tokenConfere(token, esperado)) {
      throw new ErroApi('nao_autenticado', 'Token inválido.', 401)
    }
    res.setHeader('Cache-Control', 'no-store')
    const relatorio = await this.alertas.verificar()
    if (relatorio.status !== 'ok') res.status(503)
    return relatorio
  }
}

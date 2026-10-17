import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { Controller, Get, Inject, Logger, Req, Res } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import type { Readable } from 'node:stream'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ARMAZENAMENTO } from '../infra/infra.module.js'
import { Limite, SemLimite } from '../rate-limit/limite.decorator.js'

/** O que o Garage devolve quando o objeto não existe (o SDK usa `NoSuchKey`; o Garage às vezes só o 404). */
const naoExiste = (e: unknown): boolean => {
  const x = e as { name?: string; $metadata?: { httpStatusCode?: number } }
  return x.name === 'NoSuchKey' || x.name === 'NotFound' || x.$metadata?.httpStatusCode === 404
}

/**
 * Os tiles do mapa (PMTiles do estado, no bucket PRIVADO do Garage) servidos pela API, atrás da sessão,
 * com suporte a `Range`: o MapLibre lê só os pedaços do arquivo de que precisa (cabeçalho, diretórios e
 * tiles), nunca o arquivo inteiro. Sem URL pública nem credencial do Garage no navegador.
 */
@ApiTags('Mapa')
@SemLimite()
// Muitos pedaços por movimento do mapa: limite próprio, bem acima do global (300/min)
@Limite({ nome: 'mapa-tiles', max: 6000, janelaS: 60 })
@Controller('mapa')
export class TilesDoMapaController {
  private readonly log = new Logger('Mapa')

  constructor(
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    @Inject(ARMAZENAMENTO) private readonly s3: S3Client,
  ) {}

  @ApiOperation({
    summary: 'Mapa base (PMTiles do estado)',
    description:
      'Qualquer membro logado. Aceita `Range` (206 com `Content-Range`); sem `Range`, o arquivo inteiro. Arquivo ainda não enviado ao Garage: 404 `mapa_indisponivel`. Segue o formato PMTiles v3 (https://docs.protomaps.com/pmtiles/).',
  })
  @ApiResponse({ status: 200, description: 'O arquivo inteiro (sem `Range`)' })
  @ApiResponse({ status: 206, description: 'O trecho pedido' })
  @ApiResponse({
    status: 401,
    description: 'Sem login',
    schema: { $ref: '#/components/schemas/Erro' },
  })
  @ApiResponse({ status: 404, description: 'Mapa ainda não enviado (`mapa_indisponivel`)' })
  @Get('base.pmtiles')
  async base(@Req() req: Request, @Res() res: Response): Promise<void> {
    const range = typeof req.headers.range === 'string' ? req.headers.range : undefined
    try {
      const saida = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.config.S3_BUCKET,
          Key: this.config.GEO_PMTILES_CHAVE,
          ...(range ? { Range: range } : {}),
        }),
      )
      res.status(range && saida.ContentRange ? 206 : 200)
      res.setHeader('Content-Type', 'application/octet-stream')
      res.setHeader('Accept-Ranges', 'bytes')
      // O arquivo muda só quando o Ale sobe um novo; o navegador pode guardar por uma hora
      res.setHeader('Cache-Control', 'private, max-age=3600')
      if (saida.ETag) res.setHeader('ETag', saida.ETag)
      if (saida.ContentLength !== undefined) res.setHeader('Content-Length', saida.ContentLength)
      if (saida.ContentRange) res.setHeader('Content-Range', saida.ContentRange)
      const corpo = saida.Body as Readable | undefined
      if (!corpo) {
        res.end()
        return
      }
      corpo.on('error', (e: Error) => {
        this.log.warn(`Garage: ${e.message}`)
        res.destroy(e)
      })
      corpo.pipe(res)
    } catch (e) {
      if (naoExiste(e)) {
        res
          .status(404)
          .json({ erro: 'mapa_indisponivel', mensagem: 'O mapa ainda não foi enviado.' })
        return
      }
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 416) {
        res.status(416).json({ erro: 'faixa_invalida', mensagem: 'Faixa fora do arquivo.' })
        return
      }
      this.log.error(`Garage: ${e instanceof Error ? e.message : String(e)}`)
      res.status(502).json({ erro: 'garage_indisponivel', mensagem: 'Não consegui ler o mapa.' })
    }
  }
}

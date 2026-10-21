import { HeadBucketCommand, type S3Client } from '@aws-sdk/client-s3'
import type { Conexao } from '@leadtogo/db'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Redis } from 'ioredis'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ARMAZENAMENTO_SAUDE, BANCO_SAUDE, VALKEY } from '../infra/infra.module.js'

export type StatusCheck = 'ok' | 'erro'
export interface ResultadoCheck {
  status: StatusCheck
  /** Tempo da verificação, em milissegundos */
  ms: number
}
export interface RelatorioSaude {
  status: StatusCheck
  version: string
  checks: { database: ResultadoCheck; valkey: ResultadoCheck; garage: ResultadoCheck }
}

/**
 * Cada verificação tem no máximo este tempo, com relógio e conexão PRÓPRIOS (banco, Valkey e Garage rodam em
 * paralelo e nenhum espera pelo outro nem pela fila do tráfego); o /health nunca fica pendurado.
 */
export const TEMPO_LIMITE_MS = 2000

@Injectable()
export class HealthService {
  private readonly log = new Logger(HealthService.name)

  constructor(
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    @Inject(BANCO_SAUDE) private readonly banco: Conexao,
    @Inject(VALKEY) private readonly valkey: Redis,
    @Inject(ARMAZENAMENTO_SAUDE) private readonly s3: S3Client,
  ) {}

  async verificar(): Promise<RelatorioSaude> {
    const [database, valkey, garage] = await Promise.all([
      this.medir('database', async () => {
        await this.banco.cliente`SELECT 1`
      }),
      this.medir('valkey', async () => {
        if ((await this.valkey.ping()) !== 'PONG') throw new Error('resposta inesperada ao PING')
      }),
      this.medir('garage', async () => {
        await this.s3.send(new HeadBucketCommand({ Bucket: this.config.S3_BUCKET }), {
          abortSignal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        })
      }),
    ])
    const todos = [database, valkey, garage]
    return {
      status: todos.every((c) => c.status === 'ok') ? 'ok' : 'erro',
      version: this.config.APP_VERSION,
      checks: { database, valkey, garage },
    }
  }

  /** Roda a verificação com tempo limite. O motivo da falha vai para o log, nunca para a resposta. */
  private async medir(nome: string, verificacao: () => Promise<void>): Promise<ResultadoCheck> {
    const inicio = performance.now()
    let temporizador: NodeJS.Timeout | undefined
    try {
      await Promise.race([
        verificacao(),
        new Promise<never>((_, rejeitar) => {
          temporizador = setTimeout(() => rejeitar(new Error('tempo esgotado')), TEMPO_LIMITE_MS)
        }),
      ])
      return { status: 'ok', ms: Math.round(performance.now() - inicio) }
    } catch (erro) {
      this.log.warn(
        `/health: ${nome} falhou: ${erro instanceof Error ? erro.message : String(erro)}`,
      )
      return { status: 'erro', ms: Math.round(performance.now() - inicio) }
    } finally {
      clearTimeout(temporizador)
    }
  }
}

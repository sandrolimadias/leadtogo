import { S3Client } from '@aws-sdk/client-s3'
import { Global, Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common'
import { criarConexao, type Conexao } from '@leadtogo/db'
import { Redis } from 'ioredis'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'

/** Conexão Drizzle + postgres.js como `leadtogo_app` (sujeita ao RLS). */
export const BANCO = Symbol('BANCO')
/** Cliente Valkey (ioredis): rate limit, cache e, depois, as filas. */
export const VALKEY = Symbol('VALKEY')
/** Cliente S3 do Garage (estilo de caminho). */
export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO')

/** Conexões de infraestrutura, criadas uma vez e fechadas no encerramento da aplicação. */
@Global()
@Module({
  providers: [
    {
      provide: BANCO,
      inject: [CONFIGURACAO],
      useFactory: (config: Configuracao) => criarConexao(config.DATABASE_URL, { max: 10 }),
    },
    {
      provide: VALKEY,
      inject: [CONFIGURACAO],
      useFactory: async (config: Configuracao) => {
        const cliente = new Redis(config.REDIS_URL, {
          // Sem fila offline: se o Valkey cair, o comando falha na hora (o /health precisa saber)
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
          commandTimeout: 2000,
        })
        const log = new Logger('Valkey')
        cliente.on('error', (erro: Error) => log.warn(`Valkey: ${erro.message}`))
        // Espera a conexão (até 3 s) para a primeira requisição não pegar o cliente ainda
        // conectando. Se o Valkey estiver fora, a API sobe assim mesmo e o /health acusa.
        await new Promise<void>((resolver) => {
          const limite = setTimeout(resolver, 3000)
          cliente.once('ready', () => {
            clearTimeout(limite)
            resolver()
          })
        })
        return cliente
      },
    },
    {
      provide: ARMAZENAMENTO,
      inject: [CONFIGURACAO],
      useFactory: (config: Configuracao) =>
        new S3Client({
          endpoint: config.S3_ENDPOINT,
          region: config.S3_REGION,
          forcePathStyle: config.S3_FORCE_PATH_STYLE,
          credentials: { accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY },
        }),
    },
  ],
  exports: [BANCO, VALKEY, ARMAZENAMENTO],
})
export class InfraModule implements OnModuleDestroy {
  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    @Inject(VALKEY) private readonly valkey: Redis,
    @Inject(ARMAZENAMENTO) private readonly s3: S3Client,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.banco.cliente.end({ timeout: 5 })
    this.valkey.disconnect()
    this.s3.destroy()
  }
}

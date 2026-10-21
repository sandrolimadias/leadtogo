import type { S3Client } from '@aws-sdk/client-s3'
import { Global, Inject, Logger, Module, type OnModuleDestroy } from '@nestjs/common'
import { criarConexao, type Conexao } from '@leadtogo/db'
import { Redis } from 'ioredis'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { criarClienteS3 } from './s3.js'

/** Conexão Drizzle + postgres.js como `leadtogo_app` (sujeita ao RLS). */
export const BANCO = Symbol('BANCO')
/** Cliente Valkey (ioredis): rate limit, cache e, depois, as filas. */
export const VALKEY = Symbol('VALKEY')
/** Cliente S3 do Garage (estilo de caminho). */
export const ARMAZENAMENTO = Symbol('ARMAZENAMENTO')
/** Conexão e cliente S3 reservados ao /health (independentes do tráfego). */
export const BANCO_SAUDE = Symbol('BANCO_SAUDE')
export const ARMAZENAMENTO_SAUDE = Symbol('ARMAZENAMENTO_SAUDE')

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
      useFactory: (config: Configuracao) => criarClienteS3(config),
    },
    // Só para o /health: pool e agente PRÓPRIOS (1 conexão do banco, 2 sockets do Garage), para que a
    // verificação meça o serviço e não a fila do tráfego; um serviço lento não derruba o resultado do outro
    {
      provide: BANCO_SAUDE,
      inject: [CONFIGURACAO],
      useFactory: (config: Configuracao) => criarConexao(config.DATABASE_URL, { max: 1 }),
    },
    {
      provide: ARMAZENAMENTO_SAUDE,
      inject: [CONFIGURACAO],
      useFactory: (config: Configuracao) => criarClienteS3(config, { maxSockets: 2 }),
    },
  ],
  exports: [BANCO, VALKEY, ARMAZENAMENTO, BANCO_SAUDE, ARMAZENAMENTO_SAUDE],
})
export class InfraModule implements OnModuleDestroy {
  constructor(
    @Inject(BANCO) private readonly banco: Conexao,
    @Inject(VALKEY) private readonly valkey: Redis,
    @Inject(ARMAZENAMENTO) private readonly s3: S3Client,
    @Inject(BANCO_SAUDE) private readonly bancoSaude: Conexao,
    @Inject(ARMAZENAMENTO_SAUDE) private readonly s3Saude: S3Client,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.banco.cliente.end({ timeout: 5 })
    await this.bancoSaude.cliente.end({ timeout: 5 })
    this.valkey.disconnect()
    this.s3.destroy()
    this.s3Saude.destroy()
  }
}

import 'reflect-metadata'

import type { Conexao } from '@leadtogo/db'
import { NestFactory } from '@nestjs/core'
import type { Redis } from 'ioredis'
import { pino } from 'pino'

import {
  carregarConfiguracao,
  type Configuracao,
  ErroConfiguracao,
} from './configuracao/configuracao.js'
import { BANCO, VALKEY } from './infra/infra.module.js'
import { iniciarObservabilidade } from './observabilidade/erros.js'
import { iniciarWorker } from './worker/iniciar.js'
import { WorkerModule } from './worker.module.js'

// Processo worker: mesma imagem da API, iniciado com `node dist/worker.js` (docs/configuracao_tecnologia.md, seção 11.3).
let config: Configuracao
try {
  config = carregarConfiguracao()
} catch (erro) {
  if (erro instanceof ErroConfiguracao) {
    console.error(erro.message)
    process.exit(1)
  }
  throw erro
}

// O worker faz lotes e cargas: pool menor e prazos do Postgres mais folgados que os da API (a rede de
// segurança contra transação esquecida e consulta presa vale igual, só com mais folga)
config = {
  ...config,
  DB_POOL_MAX: 10,
  DB_STATEMENT_TIMEOUT_MS: Math.max(config.DB_STATEMENT_TIMEOUT_MS, 120_000),
  DB_IDLE_TX_TIMEOUT_MS: Math.max(config.DB_IDLE_TX_TIMEOUT_MS, 60_000),
}

iniciarObservabilidade(config, 'worker')

const log = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } } }
    : {}),
})

const app = await NestFactory.createApplicationContext(WorkerModule.registrar(config), {
  logger: ['error', 'warn'],
})
const worker = await iniciarWorker({
  config,
  banco: app.get<Conexao>(BANCO),
  valkey: app.get<Redis>(VALKEY),
  log,
})

// SIGTERM (deploy, `docker stop`) e SIGINT: termina os jobs em andamento dentro do prazo e sai
let saindo = false
const sair = (sinal: string) => {
  if (saindo) return
  saindo = true
  log.info(
    { sinal, prazoS: config.WORKER_ENCERRAMENTO_S },
    'encerrando: terminando os jobs em andamento',
  )
  void (async () => {
    // Sempre sai, mesmo se algo falhar no meio: um worker preso no encerramento trava o deploy
    let noPrazo = false
    let saida = 0
    try {
      noPrazo = await worker.encerrar()
      await app.close()
    } catch (erro) {
      saida = 1
      log.error(
        { erro: erro instanceof Error ? erro.message : String(erro) },
        'erro ao encerrar o worker',
      )
    }
    log.info({ noPrazo }, 'worker encerrado')
    process.exit(saida)
  })()
}
process.on('SIGTERM', () => sair('SIGTERM'))
process.on('SIGINT', () => sair('SIGINT'))

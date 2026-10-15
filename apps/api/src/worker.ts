import 'reflect-metadata'

import type { Conexao } from '@leadtogo/db'
import { NestFactory } from '@nestjs/core'
import type { Redis } from 'ioredis'
import { pino } from 'pino'

import { carregarConfiguracao, ErroConfiguracao } from './configuracao/configuracao.js'
import { BANCO, VALKEY } from './infra/infra.module.js'
import { iniciarObservabilidade } from './observabilidade/erros.js'
import { iniciarWorker } from './worker/iniciar.js'
import { WorkerModule } from './worker.module.js'

// Processo worker: mesma imagem da API, iniciado com `node dist/worker.js` (docs/configuracao_tecnologia.md, seção 11.3).
let config
try {
  config = carregarConfiguracao()
} catch (erro) {
  if (erro instanceof ErroConfiguracao) {
    console.error(erro.message)
    process.exit(1)
  }
  throw erro
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

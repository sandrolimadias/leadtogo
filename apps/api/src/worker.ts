import 'reflect-metadata'

import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { carregarConfiguracao, ErroConfiguracao } from './configuracao/configuracao.js'
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

const app = await NestFactory.createApplicationContext(WorkerModule.registrar(config))
app.enableShutdownHooks()
await app.init()

// Mantém o processo vivo até receber SIGTERM/SIGINT. Quando houver filas BullMQ, as conexões
// com o Valkey cumprem esse papel e este timer pode sair.
setInterval(() => undefined, 2 ** 31 - 1)

new Logger('Worker').log(`Worker iniciado (versão ${config.APP_VERSION})`)

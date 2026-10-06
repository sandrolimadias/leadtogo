import type { Server } from 'node:http'

import { type INestApplication, Module, type Type } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule, type OpcoesApp } from '../app.module.js'
import { configurarApp } from '../app.js'
import { carregarConfiguracao, type Configuracao } from '../configuracao/configuracao.js'

/** Configuração dos testes: serviços de teste, com trocas pontuais. */
export function configuracaoDeTeste(troca: Record<string, string> = {}): Configuracao {
  return carregarConfiguracao({ ...process.env, LOG_LEVEL: 'silent', ...troca })
}

/**
 * A aplicação real (mesmos módulos, filtro, Helmet, CORS e parsers) com controllers extras
 * só dos testes. Use para exercitar o que ainda não tem rota própria.
 */
export async function criarAppComRotas(
  controllers: Type[],
  config: Configuracao = configuracaoDeTeste(),
  opcoes: OpcoesApp = {},
): Promise<INestApplication<Server>> {
  @Module({ imports: [AppModule.registrar(config, opcoes)], controllers })
  class AppDeTeste {}

  const app = await NestFactory.create<INestApplication<Server>>(AppDeTeste, {
    bufferLogs: true,
    bodyParser: false,
  })
  configurarApp(app, config)
  await app.init()
  return app
}

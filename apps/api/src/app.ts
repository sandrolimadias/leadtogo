import 'reflect-metadata'

import type { Server } from 'node:http'

import { RequestMethod, type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { Logger } from 'nestjs-pino'

import { AppModule, type OpcoesApp } from './app.module.js'
import { carregarConfiguracao, type Configuracao } from './configuracao/configuracao.js'
import { aplicarSegurancaHttp } from './http/seguranca-http.js'

/** Configuração comum da aplicação HTTP (a mesma no main, nos testes e na geração do OpenAPI). */
export function configurarApp(app: INestApplication, config: Configuracao): void {
  app.useLogger(app.get(Logger))
  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/alertas', method: RequestMethod.GET },
    ],
  })
  app.enableShutdownHooks()
  aplicarSegurancaHttp(app, config)
}

/** Cria e configura a aplicação HTTP (usada pelo main, pelos testes e pela geração do OpenAPI). */
export async function criarApp(
  config: Configuracao = carregarConfiguracao(),
  opcoes: OpcoesApp = {},
): Promise<INestApplication<Server>> {
  const app = await NestFactory.create<INestApplication<Server>>(
    AppModule.registrar(config, opcoes),
    {
      bufferLogs: true,
      // O corpo é lido por parsers nossos (aplicarSegurancaHttp), que pulam as rotas do Better Auth
      bodyParser: false,
    },
  )
  configurarApp(app, config)
  return app
}

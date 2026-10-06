import 'reflect-metadata'

import type { Server } from 'node:http'

import { RequestMethod, type INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger'

import { AppModule } from './app.module.js'
import { carregarConfiguracao, type Configuracao } from './configuracao/configuracao.js'

/** Cria e configura a aplicação HTTP (usada pelo main, pelos testes e pela geração do OpenAPI). */
export async function criarApp(
  config: Configuracao = carregarConfiguracao(),
): Promise<INestApplication<Server>> {
  const app = await NestFactory.create<INestApplication<Server>>(AppModule.registrar(config), {
    bufferLogs: true,
  })
  app.setGlobalPrefix('v1', { exclude: [{ path: 'health', method: RequestMethod.GET }] })
  app.enableShutdownHooks()
  return app
}

export function criarDocumentoOpenApi(app: INestApplication, versao: string): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Leadtogo API')
    .setDescription('API REST do Leadtogo')
    .setVersion(versao)
    .build()
  return SwaggerModule.createDocument(app, config)
}

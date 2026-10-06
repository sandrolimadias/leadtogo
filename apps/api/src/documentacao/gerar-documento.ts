import type { OpenAPIObject } from '@nestjs/swagger'

import { criarApp } from '../app.js'
import { carregarConfiguracao } from '../configuracao/configuracao.js'
import { montarDocumento } from './openapi.js'

/** Configuração só para montar a aplicação e gerar o documento: não conecta em nada de verdade. */
export function configuracaoParaDocumentacao() {
  return carregarConfiguracao({
    NODE_ENV: 'development',
    APP_URL: 'http://localhost:5173',
    API_URL: 'http://localhost:3000',
    APP_VERSION: '0.0.0',
    BETTER_AUTH_SECRET: 'documentacao-documentacao-documentacao',
    DATABASE_URL: 'postgres://leadtogo_app:senha@localhost:5432/leadtogo',
    REDIS_URL: 'redis://localhost:6379',
    S3_ENDPOINT: 'http://localhost:3900',
    S3_BUCKET: 'leadtogo-arquivos',
    S3_ACCESS_KEY: 'documentacao',
    S3_SECRET_KEY: 'documentacao',
  })
}

/** O OpenAPI da API, com a versão fixa (o arquivo apps/api/openapi.json é gerado daqui). */
export async function gerarDocumento(): Promise<OpenAPIObject> {
  const config = configuracaoParaDocumentacao()
  const app = await criarApp(config)
  try {
    return montarDocumento(app, config.APP_VERSION)
  } finally {
    await app.close()
  }
}

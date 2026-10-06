import { writeFileSync } from 'node:fs'

import { criarApp, criarDocumentoOpenApi } from './app.js'
import { carregarConfiguracao } from './configuracao/configuracao.js'

// Gera apps/api/openapi.json, de onde o packages/api-client é gerado. Não conecta em nada:
// a configuração abaixo só existe para montar a aplicação e a versão do documento é fixa.
const config = carregarConfiguracao({
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
const app = await criarApp(config)
const documento = criarDocumentoOpenApi(app, config.APP_VERSION)
writeFileSync(
  new URL('../openapi.json', import.meta.url),
  JSON.stringify(documento, null, 2) + '\n',
)
await app.close()

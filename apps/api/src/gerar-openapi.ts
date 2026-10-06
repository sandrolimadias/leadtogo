import { writeFileSync } from 'node:fs'

import { criarApp, criarDocumentoOpenApi } from './app.js'

// Gera apps/api/openapi.json, de onde o packages/api-client é gerado.
const app = await criarApp()
const documento = criarDocumentoOpenApi(app)
writeFileSync(
  new URL('../openapi.json', import.meta.url),
  JSON.stringify(documento, null, 2) + '\n',
)
await app.close()

import { writeFileSync } from 'node:fs'

import { gerarDocumento } from './documentacao/gerar-documento.js'

// Gera apps/api/openapi.json, de onde o packages/api-client é gerado (`pnpm --filter @leadtogo/api openapi`).
const documento = await gerarDocumento()
writeFileSync(
  new URL('../openapi.json', import.meta.url),
  JSON.stringify(documento, null, 2) + '\n',
)

import { SwaggerModule } from '@nestjs/swagger'

import { criarApp, criarDocumentoOpenApi } from './app.js'

const app = await criarApp()

// Swagger em /docs. Em produção fica desligado até existir a proteção (docs/configuracao_tecnologia.md, seção 4).
if (process.env['NODE_ENV'] !== 'production') {
  SwaggerModule.setup('docs', app, criarDocumentoOpenApi(app))
}

await app.listen(Number(process.env['PORT'] ?? 3000), '0.0.0.0')

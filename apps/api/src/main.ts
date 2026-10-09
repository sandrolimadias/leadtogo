import { SwaggerModule } from '@nestjs/swagger'

import { criarApp } from './app.js'
import { carregarConfiguracao, ErroConfiguracao } from './configuracao/configuracao.js'
import { montarDocumento } from './documentacao/openapi.js'
import { iniciarObservabilidade } from './observabilidade/erros.js'

// Falha ao iniciar, com a lista do que falta, se a configuração estiver inválida.
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

iniciarObservabilidade(config, 'api')

const app = await criarApp(config)

// Swagger em /docs. Em produção fica desligado até existir a proteção (docs/configuracao_tecnologia.md, seção 4).
if (config.NODE_ENV !== 'production') {
  SwaggerModule.setup('docs', app, montarDocumento(app, config.APP_VERSION))
}

await app.listen(config.PORT, '0.0.0.0')

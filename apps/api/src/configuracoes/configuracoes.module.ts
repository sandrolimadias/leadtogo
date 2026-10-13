import { Module } from '@nestjs/common'

import { ConfiguracaoDaCarteiraController } from './carteira.controller.js'
import { ConfiguracaoDaCarteiraService } from './carteira.service.js'
import { SegurancaController } from './seguranca.controller.js'
import { SegurancaService } from './seguranca.service.js'

@Module({
  controllers: [SegurancaController, ConfiguracaoDaCarteiraController],
  providers: [SegurancaService, ConfiguracaoDaCarteiraService],
})
export class ConfiguracoesModule {}

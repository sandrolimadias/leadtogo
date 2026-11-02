import { Module } from '@nestjs/common'

import { ConfiguracaoDaCarteiraController } from './carteira.controller.js'
import { ConfiguracaoDaCarteiraService } from './carteira.service.js'
import { DadosDaEmpresaController } from './dados-da-empresa.controller.js'
import { DadosDaEmpresaService } from './dados-da-empresa.service.js'
import { SegurancaController } from './seguranca.controller.js'
import { SegurancaService } from './seguranca.service.js'

@Module({
  controllers: [SegurancaController, ConfiguracaoDaCarteiraController, DadosDaEmpresaController],
  providers: [SegurancaService, ConfiguracaoDaCarteiraService, DadosDaEmpresaService],
})
export class ConfiguracoesModule {}

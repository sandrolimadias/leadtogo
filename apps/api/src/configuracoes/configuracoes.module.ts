import { Module } from '@nestjs/common'

import { SegurancaController } from './seguranca.controller.js'
import { SegurancaService } from './seguranca.service.js'

@Module({ controllers: [SegurancaController], providers: [SegurancaService] })
export class ConfiguracoesModule {}

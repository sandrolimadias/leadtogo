import { Module } from '@nestjs/common'

import { TagsController } from './tags.controller.js'
import { TagsService } from './tags.service.js'

/** Cadastros auxiliares da empresa ativa (Módulo 1): tags, tipos de atividade, funis, origens... */
@Module({ controllers: [TagsController], providers: [TagsService] })
export class CadastrosModule {}

import { Module } from '@nestjs/common'

import {
  MotivosService,
  OrigensService,
  SolucoesService,
  TiposAtividadeService,
  VerticaisService,
} from './cadastros-simples.services.js'
import { MotivosController } from './motivos.controller.js'
import { OrigensController } from './origens.controller.js'
import { SolucoesController } from './solucoes.controller.js'
import { TagsController } from './tags.controller.js'
import { TagsService } from './tags.service.js'
import { TiposAtividadeController } from './tipos-atividade.controller.js'
import { VerticaisController } from './verticais.controller.js'

/** Cadastros auxiliares da empresa ativa (Módulo 1): tags, tipos de atividade, funis, origens... */
@Module({
  controllers: [
    TagsController,
    TiposAtividadeController,
    VerticaisController,
    SolucoesController,
    OrigensController,
    MotivosController,
  ],
  providers: [
    TagsService,
    TiposAtividadeService,
    VerticaisService,
    SolucoesService,
    OrigensService,
    MotivosService,
  ],
})
export class CadastrosModule {}

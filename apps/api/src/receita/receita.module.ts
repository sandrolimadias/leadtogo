import { Module } from '@nestjs/common'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ReceitaController } from './receita.controller.js'
import { PROVEDORES_DA_RECEITA, ReceitaService, provedoresPadrao } from './receita.service.js'

@Module({
  controllers: [ReceitaController],
  providers: [
    {
      provide: PROVEDORES_DA_RECEITA,
      inject: [CONFIGURACAO],
      useFactory: (config: Configuracao) => provedoresPadrao(config),
    },
    ReceitaService,
  ],
  exports: [ReceitaService],
})
export class ReceitaModule {}

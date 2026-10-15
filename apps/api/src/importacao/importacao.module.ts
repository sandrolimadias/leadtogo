import { Module } from '@nestjs/common'

import { LotesDeImportacaoController } from './lotes.controller.js'
import { LotesDeImportacaoService } from './lotes.service.js'
import { PreviaDaImportacaoService } from './previa.service.js'
import { PerfisDeImportacaoController } from './perfis.controller.js'
import { PerfisDeImportacaoService } from './perfis.service.js'

/** Importação de planilha (Módulo 4): perfis de regras, lotes e relatório. */
@Module({
  controllers: [PerfisDeImportacaoController, LotesDeImportacaoController],
  providers: [PerfisDeImportacaoService, LotesDeImportacaoService, PreviaDaImportacaoService],
})
export class ImportacaoModule {}

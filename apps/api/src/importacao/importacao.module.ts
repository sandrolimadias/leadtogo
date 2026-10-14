import { Module } from '@nestjs/common'

import { PerfisDeImportacaoController } from './perfis.controller.js'
import { PerfisDeImportacaoService } from './perfis.service.js'

/** Importação de planilha (Módulo 4): perfis de regras, lotes e relatório. */
@Module({
  controllers: [PerfisDeImportacaoController],
  providers: [PerfisDeImportacaoService],
})
export class ImportacaoModule {}

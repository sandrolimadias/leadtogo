import { Module } from '@nestjs/common'

import { ReceitaModule } from '../receita/receita.module.js'
import { EmpresasDaCarteiraController } from './empresas.controller.js'
import { EmpresasDaCarteiraService } from './empresas.service.js'

/** Carteira de empresas (Módulo 2): cadastro, ficha, edição e exclusão. */
@Module({
  imports: [ReceitaModule],
  controllers: [EmpresasDaCarteiraController],
  providers: [EmpresasDaCarteiraService],
})
export class CarteiraModule {}

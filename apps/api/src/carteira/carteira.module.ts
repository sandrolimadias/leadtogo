import { Module } from '@nestjs/common'

import { ReceitaModule } from '../receita/receita.module.js'
import { AtualizarPelaReceitaService } from './atualizar-receita.service.js'
import { ContatosController } from './contatos.controller.js'
import { ContatosService } from './contatos.service.js'
import { ListaDeContatosService } from './lista-contatos.service.js'
import { VinculosDoContatoService } from './vinculos-do-contato.service.js'
import { EmpresasDaCarteiraController } from './empresas.controller.js'
import { EmpresasDaCarteiraService } from './empresas.service.js'
import { HistoricoDaEmpresaService } from './historico.service.js'
import { ListaDeEmpresasService } from './lista.service.js'

/** Carteira de empresas (Módulo 2): cadastro, ficha, edição e exclusão. */
@Module({
  imports: [ReceitaModule],
  controllers: [EmpresasDaCarteiraController, ContatosController],
  providers: [
    EmpresasDaCarteiraService,
    ListaDeEmpresasService,
    HistoricoDaEmpresaService,
    AtualizarPelaReceitaService,
    ContatosService,
    ListaDeContatosService,
    VinculosDoContatoService,
  ],
})
export class CarteiraModule {}

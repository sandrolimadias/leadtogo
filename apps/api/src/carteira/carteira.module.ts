import { Module } from '@nestjs/common'

import { ReceitaModule } from '../receita/receita.module.js'
import { AtualizarPelaReceitaService } from './atualizar-receita.service.js'
import { AtividadesController } from './atividades.controller.js'
import { AtividadesService } from './atividades.service.js'
import { ListaDeAtividadesService } from './lista-atividades.service.js'
import { ListaDeOportunidadesService } from './lista-oportunidades.service.js'
import { OportunidadesController } from './oportunidades.controller.js'
import { OportunidadesService } from './oportunidades.service.js'
import { DashboardController } from './dashboard.controller.js'
import { DashboardService } from './dashboard.service.js'
import { ConverterSocioService } from './converter-socio.service.js'
import { ContatosController } from './contatos.controller.js'
import { ContatosService } from './contatos.service.js'
import { HistoricoDoContatoService } from './historico-contato.service.js'
import { ListaDeContatosService } from './lista-contatos.service.js'
import { VinculosDoContatoService } from './vinculos-do-contato.service.js'
import { EmpresasDaCarteiraController } from './empresas.controller.js'
import { EmpresasDaCarteiraService } from './empresas.service.js'
import { HistoricoDaEmpresaService } from './historico.service.js'
import { ListaDeEmpresasService } from './lista.service.js'

/** Carteira: empresas (Módulo 2), contatos (Módulo 3), atividades (Módulo 5) e oportunidades (Módulo 6). */
@Module({
  imports: [ReceitaModule],
  controllers: [
    EmpresasDaCarteiraController,
    ContatosController,
    AtividadesController,
    OportunidadesController,
    DashboardController,
  ],
  providers: [
    EmpresasDaCarteiraService,
    ListaDeEmpresasService,
    HistoricoDaEmpresaService,
    AtualizarPelaReceitaService,
    ContatosService,
    ListaDeContatosService,
    VinculosDoContatoService,
    ConverterSocioService,
    HistoricoDoContatoService,
    AtividadesService,
    ListaDeAtividadesService,
    OportunidadesService,
    ListaDeOportunidadesService,
    DashboardService,
  ],
})
export class CarteiraModule {}

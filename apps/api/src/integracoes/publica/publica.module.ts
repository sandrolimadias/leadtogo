import { Module } from '@nestjs/common'

import { CarteiraModule } from '../../carteira/carteira.module.js'
import { IdempotenciaInterceptor } from './idempotencia.interceptor.js'
import {
  PublicaAtividadesController,
  PublicaContatosController,
  PublicaController,
  PublicaEmpresasController,
  PublicaOportunidadesController,
} from './publica.controllers.js'
import { PublicaService } from './publica.service.js'

/** API pública v1 (`/v1/publica/*`, docs/plano_api_aberta.md, seção 5): só chave de API. */
@Module({
  imports: [CarteiraModule],
  controllers: [
    PublicaController,
    PublicaEmpresasController,
    PublicaContatosController,
    PublicaAtividadesController,
    PublicaOportunidadesController,
  ],
  providers: [PublicaService, IdempotenciaInterceptor],
})
export class PublicaModule {}

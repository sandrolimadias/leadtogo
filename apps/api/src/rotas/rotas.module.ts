import { Module } from '@nestjs/common'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { PontosDePartidaService } from './pontos.service.js'
import { RoteirizadorVroomOsrm } from './roteirizador.js'
import { ConfiguracoesDeRotasController, RotasController } from './rotas.controller.js'
import { ROTEIRIZADOR, RotasService } from './rotas.service.js'

/**
 * Rotas (G4): montar, otimizar (VROOM + OSRM da pilha leadtogo-rotas) e executar. Sem `VROOM_URL` e
 * `OSRM_URL` o serviço de rotas é nulo: a otimização fica desligada e as estimativas saem em linha reta.
 */
@Module({
  controllers: [RotasController, ConfiguracoesDeRotasController],
  providers: [
    RotasService,
    PontosDePartidaService,
    {
      provide: ROTEIRIZADOR,
      inject: [CONFIGURACAO],
      useFactory: (config: Configuracao) =>
        config.VROOM_URL && config.OSRM_URL
          ? new RoteirizadorVroomOsrm(
              config.VROOM_URL,
              config.OSRM_URL,
              config.ROTA_TEMPO_LIMITE_S * 1000,
            )
          : null,
    },
  ],
})
export class RotasModule {}

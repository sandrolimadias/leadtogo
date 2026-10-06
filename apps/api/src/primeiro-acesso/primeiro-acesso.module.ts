import { Module } from '@nestjs/common'

import { PrimeiroAcessoController } from './primeiro-acesso.controller.js'
import { PrimeiroAcessoService } from './primeiro-acesso.service.js'

@Module({
  controllers: [PrimeiroAcessoController],
  providers: [PrimeiroAcessoService],
  exports: [PrimeiroAcessoService],
})
export class PrimeiroAcessoModule {}

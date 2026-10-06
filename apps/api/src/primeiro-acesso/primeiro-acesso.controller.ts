import {
  type PrimeiroAcesso,
  primeiroAcessoResultadoSchema,
  type PrimeiroAcessoResultado,
  primeiroAcessoSchema,
} from '@leadtogo/shared'
import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Publica } from '../acesso/acesso.decorators.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { primeiroAcessoAberto } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { Documenta } from '../documentacao/documenta.js'
import { ErroApi } from '../http/erro-api.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PrimeiroAcessoService } from './primeiro-acesso.service.js'

@ApiTags('Primeiro acesso')
@Publica()
@Controller('primeiro-acesso')
export class PrimeiroAcessoController {
  constructor(
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    private readonly servico: PrimeiroAcessoService,
  ) {}

  /**
   * Cria a conta dona, a primeira empresa e o administrador. Fechado por padrão em produção
   * (PRIMEIRO_ACESSO=aberto|fechado): lá a primeira conta nasce por `node dist/criar-conta.js`.
   * Limite estrito por IP; sem Valkey, recusa (503) em vez de ficar sem limite.
   */
  @Documenta({
    resumo: 'Criar a primeira conta',
    descricao:
      'Cria o usuário, a conta dona, a primeira empresa, as configurações e o membro administrador. Fechado por padrão em produção (`PRIMEIRO_ACESSO`): lá a primeira conta nasce pelo comando `node dist/criar-conta.js`. Limite de 5 por hora por IP.',
    corpo: primeiroAcessoSchema,
    resposta: primeiroAcessoResultadoSchema,
    status: 201,
    erros: [400, 403, 409, 429, 503],
  })
  @Post()
  @HttpCode(201)
  @Limite({ nome: 'primeiro-acesso', max: 5, janelaS: 3600, falhaFechada: true })
  async criar(
    @Body(new ZodPipe(primeiroAcessoSchema)) dados: PrimeiroAcesso,
  ): Promise<PrimeiroAcessoResultado> {
    if (!primeiroAcessoAberto(this.config)) {
      throw new ErroApi(
        'primeiro_acesso_fechado',
        'O cadastro de novas contas está fechado. Peça um convite ao administrador.',
        403,
      )
    }
    return this.servico.criar(dados)
  }
}

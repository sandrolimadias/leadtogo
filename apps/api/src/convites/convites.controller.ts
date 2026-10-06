import {
  type AceitarConviteEntrada,
  aceitarConviteSchema,
  type ConsultarConviteEntrada,
  consultarConviteSchema,
  type ConviteAceito,
  type ConviteConsulta,
  type ConviteCriado,
  type ConviteResumo,
  type CriarConviteEntrada,
  criarConviteSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'

import { Publica } from '../acesso/acesso.decorators.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { ConvitesService } from './convites.service.js'

/** Gestão de convites (administrador da empresa ativa). */
@Controller('convites')
export class ConvitesController {
  constructor(private readonly servico: ConvitesService) {}

  /** Convida um e-mail. O token vai só por e-mail: a resposta nunca o traz. */
  @Post()
  @Limite({ nome: 'convites', max: 30, janelaS: 3600 })
  criar(@Body(new ZodPipe(criarConviteSchema)) dados: CriarConviteEntrada): Promise<ConviteCriado> {
    return this.servico.criar(dados)
  }

  @Get()
  listar(): Promise<ConviteResumo[]> {
    return this.servico.listar()
  }

  @Delete(':id')
  @HttpCode(204)
  async revogar(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.servico.revogar(id)
  }
}

/**
 * Rotas do convidado, sem sessão (ele ainda não é da equipe). O token vai no CORPO, nunca na URL.
 * Limite estrito por IP; sem Valkey, recusa em vez de ficar sem limite.
 */
@Publica()
@Controller('convites')
export class ConvitesPublicosController {
  constructor(private readonly servico: ConvitesService) {}

  @Post('consultar')
  @HttpCode(200)
  @Limite({ nome: 'convite-consultar', max: 30, janelaS: 3600, falhaFechada: true })
  consultar(
    @Body(new ZodPipe(consultarConviteSchema)) dados: ConsultarConviteEntrada,
  ): Promise<ConviteConsulta> {
    return this.servico.consultar(dados.token)
  }

  @Post('aceitar')
  @HttpCode(200)
  @Limite({ nome: 'convite-aceitar', max: 10, janelaS: 3600, falhaFechada: true })
  aceitar(
    @Req() req: Request,
    @Body(new ZodPipe(aceitarConviteSchema)) dados: AceitarConviteEntrada,
  ): Promise<ConviteAceito> {
    return this.servico.aceitar(req, dados)
  }
}

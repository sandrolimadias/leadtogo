import {
  type AceitarConviteEntrada,
  aceitarConviteSchema,
  type ConsultarConviteEntrada,
  consultarConviteSchema,
  type ConviteAceito,
  conviteAceitoSchema,
  type ConviteConsulta,
  conviteConsultaSchema,
  type ConviteCriado,
  conviteCriadoSchema,
  type ConviteResumo,
  conviteResumoSchema,
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
import { ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { z } from 'zod'

import { Publica } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { Permissao } from '../acesso/acesso.decorators.js'
import { ConvitesService } from './convites.service.js'

/** Gestão de convites (`equipe.gerir` na empresa ativa). */
@ApiTags('Equipe e convites')
@Controller('convites')
@Permissao('equipe.gerir')
export class ConvitesController {
  constructor(private readonly servico: ConvitesService) {}

  /** Convida um e-mail. O token vai só por e-mail: a resposta nunca o traz. */
  @Documenta({
    resumo: 'Convidar um membro',
    descricao:
      'Exige `equipe.gerir` e `perfis.gerir` (convidar com um perfil é atribuí-lo). O perfil vem em `perfilId` (ou, pelo legado, o de sistema do `papel`); perfil inativo dá 409. Envia um e-mail com o link do convite (validade de 7 dias, uso único). O token vai SÓ por e-mail: a resposta nunca o traz e o banco guarda apenas o hash. Reenviar cancela o convite pendente anterior.',
    corpo: criarConviteSchema,
    resposta: conviteCriadoSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409, 429],
  })
  @Post()
  @Limite({ nome: 'convites', max: 30, janelaS: 3600 })
  criar(@Body(new ZodPipe(criarConviteSchema)) dados: CriarConviteEntrada): Promise<ConviteCriado> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Convites pendentes',
    descricao:
      'Exige `equipe.gerir`. Lista os convites ainda não aceitos nem cancelados (os vencidos aparecem como `expirado`). Nunca inclui o token.',
    resposta: z.array(conviteResumoSchema),
    erros: [401, 403, 409],
  })
  @Get()
  listar(): Promise<ConviteResumo[]> {
    return this.servico.listar()
  }

  @Documenta({
    resumo: 'Cancelar um convite',
    descricao: 'Exige `equipe.gerir`. O convite de outra empresa (ou inexistente) dá 404.',
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
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
@ApiTags('Equipe e convites')
@Publica()
@Controller('convites')
export class ConvitesPublicosController {
  constructor(private readonly servico: ConvitesService) {}

  @Documenta({
    resumo: 'Consultar um convite (convidado)',
    descricao:
      'Sem login. Mostra a empresa, o e-mail, o papel e se já existe conta com o e-mail. Token inexistente, expirado, cancelado ou já usado dão o MESMO 404 (`convite_invalido`). O token vai no corpo, nunca na URL.',
    corpo: consultarConviteSchema,
    resposta: conviteConsultaSchema,
    erros: [400, 404, 429, 503],
  })
  @Post('consultar')
  @HttpCode(200)
  @Limite({ nome: 'convite-consultar', max: 30, janelaS: 3600, falhaFechada: true })
  consultar(
    @Body(new ZodPipe(consultarConviteSchema)) dados: ConsultarConviteEntrada,
  ): Promise<ConviteConsulta> {
    return this.servico.consultar(dados.token)
  }

  @Documenta({
    resumo: 'Aceitar um convite (convidado)',
    descricao:
      'Sem conta com o e-mail: informe `nome` e `senha` (a conta nasce com o e-mail confirmado). Com conta: só vale com a sessão dessa conta (`login_necessario`, `convite_de_outro_email`). Uso único.',
    corpo: aceitarConviteSchema,
    resposta: conviteAceitoSchema,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
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

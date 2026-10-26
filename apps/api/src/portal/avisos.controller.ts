import {
  type Aviso,
  avisoSchema,
  type ConsultaDeAvisos,
  consultaDeAvisosSchema,
  type CriarAvisoEntrada,
  criarAvisoSchema,
  type ListaDeAvisos,
  listaDeAvisosSchema,
} from '@leadtogo/shared'
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { AvisosService } from './avisos.service.js'

/** Avisos do portal pela EQUIPE (rotas do CRM, com o perfil de acesso do CRM). */
@ApiTags('Portal do cliente: avisos')
@Controller('portal-avisos')
export class AvisosController {
  constructor(private readonly servico: AvisosService) {}

  @Documenta({
    resumo: 'Avisos enviados e agendados',
    descricao:
      'Exige `portal.ver` ou `portal.avisos`. Do mais novo ao mais antigo, com os destinatários, quantos receberam (sino), o percentual de lidos e os pushes e e-mails. `semana` traz o uso do limite de avisos normais da semana.',
    consulta: consultaDeAvisosSchema,
    resposta: listaDeAvisosSchema,
    erros: [400, 401, 403],
  })
  @Permissao('portal.ver', 'portal.avisos')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeAvisosSchema)) consulta: ConsultaDeAvisos,
  ): Promise<ListaDeAvisos> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Enviar ou agendar um aviso',
    descricao:
      'Exige `portal.avisos`. Mensagem de até 140 caracteres; sem `enviarEm` sai agora. O aviso **normal** respeita o horário de silêncio de cada pessoa (no push) e conta no limite semanal por empresa (409 `limite_semanal`); o **urgente** chega na hora e não conta. 409 `portal_desligado`; 422 `horario_no_passado` ou `empresa_invalida`.',
    corpo: criarAvisoSchema,
    resposta: avisoSchema,
    status: 201,
    erros: [400, 401, 403, 409, 422],
  })
  @Permissao('portal.avisos')
  @Post()
  @Limite({ nome: 'portal-avisos', max: 60, janelaS: 3600 })
  criar(@Body(new ZodPipe(criarAvisoSchema)) dados: CriarAvisoEntrada): Promise<Aviso> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Cancelar um aviso agendado',
    descricao:
      'Exige `portal.avisos`. Só o que ainda não saiu (409 `aviso_ja_enviado`); o que já foi enviado não volta.',
    resposta: avisoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.avisos')
  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(@Param('id', new ParseUUIDPipe()) id: string): Promise<Aviso> {
    return this.servico.cancelar(id)
  }
}

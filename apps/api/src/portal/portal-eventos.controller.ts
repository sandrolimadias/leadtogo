import {
  type ConsultaDeEventosDoPortal,
  consultaDeEventosDoPortalSchema,
  type EventoDoPortal,
  eventoDoPortalSchema,
  type ListaDeEventosDoPortal,
  listaDeEventosDoPortalSchema,
  type ProximosEventosDoPortal,
  proximosEventosDoPortalSchema,
} from '@leadtogo/shared'
import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import { ApiProduces, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'

import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { PortalEventosService } from './portal-eventos.service.js'
import { RotaDoPortal } from './portal.decorators.js'

const uuid = () => new ParseUUIDPipe()

/** Agenda do cliente (Fase 3D): lista, confirmar, cancelar e .ics. */
@ApiTags('Portal do cliente: agenda')
@RotaDoPortal()
@Controller('portal/eventos')
export class PortalEventosController {
  constructor(private readonly servico: PortalEventosService) {}

  @Documenta({
    resumo: 'Eventos da agenda',
    descricao:
      'Os eventos publicados (e os cancelados) do alcance da empresa do cliente, próximos ou passados. Traz as vagas que restam, as vagas da empresa e a situação do próprio cliente (nenhuma, confirmado ou lista de espera).',
    consulta: consultaDeEventosDoPortalSchema,
    resposta: listaDeEventosDoPortalSchema,
    erros: [400, 401, 403, 503],
  })
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeEventosDoPortalSchema)) consulta: ConsultaDeEventosDoPortal,
  ): Promise<ListaDeEventosDoPortal> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Próximos eventos (Início)',
    descricao: 'Até 3 próximos eventos não cancelados, para o painel do Início do portal.',
    resposta: proximosEventosDoPortalSchema,
    erros: [401, 403, 503],
  })
  @Get('proximos')
  proximos(): Promise<ProximosEventosDoPortal> {
    return this.servico.proximos()
  }

  @Documenta({
    resumo: 'Ver um evento',
    resposta: eventoDoPortalSchema,
    erros: [400, 401, 403, 404, 503],
  })
  @Get(':id')
  obter(@Param('id', uuid()) id: string): Promise<EventoDoPortal> {
    return this.servico.obter(id)
  }

  @Documenta({
    resumo: 'Confirmar presença',
    descricao:
      'Vaga livre: fica confirmado. Lotado (no total ou nas vagas da empresa): entra na lista de espera e é promovido, na ordem, quando abrir uma vaga. Idempotente. Recusas: 404 `evento_nao_encontrado` (fora do alcance), 409 `evento_cancelado`, `evento_encerrado` (já começou) e `prazo_encerrado`.',
    resposta: eventoDoPortalSchema,
    status: 200,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Post(':id/confirmacao')
  @HttpCode(200)
  @Limite({ nome: 'portal-confirmar-evento', max: 120, janelaS: 3600 })
  confirmar(@Param('id', uuid()) id: string): Promise<EventoDoPortal> {
    return this.servico.confirmar(id)
  }

  @Documenta({
    resumo: 'Cancelar a própria presença',
    descricao:
      'Cancela a confirmação ou a posição na lista de espera, até o início do evento. Se havia fila, o primeiro que cabe é promovido e avisado. 409 `sem_presenca` se a pessoa não tinha presença.',
    resposta: eventoDoPortalSchema,
    erros: [400, 401, 403, 404, 409, 429, 503],
  })
  @Delete(':id/confirmacao')
  @Limite({ nome: 'portal-confirmar-evento', max: 120, janelaS: 3600 })
  cancelar(@Param('id', uuid()) id: string): Promise<EventoDoPortal> {
    return this.servico.cancelar(id)
  }

  @Documenta({
    resumo: 'Arquivo .ics do evento',
    descricao:
      'Arquivo de calendário (iCalendar) para adicionar o evento ao Google Agenda, Outlook ou Apple Calendário.',
    erros: [400, 401, 403, 404, 503],
  })
  @ApiProduces('text/calendar')
  @Get(':id/ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async ics(
    @Param('id', uuid()) id: string,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<string> {
    const { nome, conteudo } = await this.servico.ics(id)
    resposta.setHeader('Content-Disposition', `attachment; filename="${nome}"`)
    return conteudo
  }
}

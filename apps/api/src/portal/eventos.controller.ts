import {
  type CancelarEventoEntrada,
  cancelarEventoSchema,
  type ConsultaDeEventos,
  consultaDeEventosSchema,
  type Evento,
  eventoSchema,
  type ListaDeEventos,
  listaDeEventosSchema,
  type ListaDeParticipantes,
  listaDeParticipantesSchema,
  type SalvarEventoEntrada,
  salvarEventoSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { Limite } from '../rate-limit/limite.decorator.js'
import { EventosService } from './eventos.service.js'

const uuid = () => new ParseUUIDPipe()

/** Agenda do portal pela EQUIPE (rotas do CRM, com o perfil de acesso do CRM). */
@ApiTags('Portal do cliente: agenda')
@Controller('portal-eventos')
export class EventosController {
  constructor(private readonly servico: EventosService) {}

  @Documenta({
    resumo: 'Eventos da agenda',
    descricao:
      'Exige `portal.ver` ou `portal.agenda`. Por aba (próximos, passados, rascunhos), com as vagas, os confirmados e a lista de espera de cada um.',
    consulta: consultaDeEventosSchema,
    resposta: listaDeEventosSchema,
    erros: [400, 401, 403],
  })
  @Permissao('portal.ver', 'portal.agenda')
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeEventosSchema)) consulta: ConsultaDeEventos,
  ): Promise<ListaDeEventos> {
    return this.servico.listar(consulta)
  }

  @Documenta({
    resumo: 'Criar um evento (rascunho)',
    descricao:
      'Exige `portal.agenda`. Nasce como rascunho: o cliente só vê depois de `POST /portal-eventos/{id}/publicar`. Vagas nulas = sem limite; o prazo de confirmação não passa do início; alcance "empresas" exige a lista (422 `empresa_invalida` se alguma não existe).',
    corpo: salvarEventoSchema,
    resposta: eventoSchema,
    status: 201,
    erros: [400, 401, 403, 422],
  })
  @Permissao('portal.agenda')
  @Post()
  @Limite({ nome: 'portal-eventos', max: 120, janelaS: 3600 })
  criar(@Body(new ZodPipe(salvarEventoSchema)) dados: SalvarEventoEntrada): Promise<Evento> {
    return this.servico.criar(dados)
  }

  @Documenta({
    resumo: 'Ver um evento',
    descricao: 'Exige `portal.ver` ou `portal.agenda`.',
    resposta: eventoSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.ver', 'portal.agenda')
  @Get(':id')
  obter(@Param('id', uuid()) id: string): Promise<Evento> {
    return this.servico.obter(id)
  }

  @Documenta({
    resumo: 'Editar um evento',
    descricao:
      'Exige `portal.agenda`. Evento cancelado não se edita (409 `evento_cancelado`). Aumentar as vagas promove, na ordem da fila, quem passou a caber (e o avisa).',
    corpo: salvarEventoSchema,
    resposta: eventoSchema,
    erros: [400, 401, 403, 404, 409, 422],
  })
  @Permissao('portal.agenda')
  @Patch(':id')
  editar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(salvarEventoSchema)) dados: SalvarEventoEntrada,
  ): Promise<Evento> {
    return this.servico.editar(id, dados)
  }

  @Documenta({
    resumo: 'Publicar um evento',
    descricao:
      'Exige `portal.agenda`. Só o rascunho (409 `evento_ja_publicado`); o início precisa estar no futuro (422 `inicio_no_passado`).',
    resposta: eventoSchema,
    status: 200,
    erros: [400, 401, 403, 404, 409, 422],
  })
  @Permissao('portal.agenda')
  @Post(':id/publicar')
  @HttpCode(200)
  publicar(@Param('id', uuid()) id: string): Promise<Evento> {
    return this.servico.publicar(id)
  }

  @Documenta({
    resumo: 'Cancelar um evento',
    descricao:
      'Exige `portal.agenda`. Só o publicado. O cliente continua vendo o evento como cancelado, e quem estava confirmado ou na lista de espera recebe aviso (sino e e-mail) com o motivo.',
    corpo: cancelarEventoSchema,
    resposta: eventoSchema,
    status: 200,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.agenda')
  @Post(':id/cancelar')
  @HttpCode(200)
  cancelar(
    @Param('id', uuid()) id: string,
    @Body(new ZodPipe(cancelarEventoSchema)) dados: CancelarEventoEntrada,
  ): Promise<Evento> {
    return this.servico.cancelar(id, dados)
  }

  @Documenta({
    resumo: 'Excluir um evento',
    descricao:
      'Exige `portal.agenda`. Exclusão lógica de rascunho ou de evento cancelado; o publicado precisa ser cancelado antes (409 `cancele_antes_de_excluir`).',
    status: 204,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('portal.agenda')
  @Delete(':id')
  @HttpCode(204)
  async excluir(@Param('id', uuid()) id: string): Promise<void> {
    await this.servico.excluir(id)
  }

  @Documenta({
    resumo: 'Participantes do evento',
    descricao:
      'Exige `portal.ver` ou `portal.agenda`. Os confirmados e a lista de espera (com a posição na fila), com a pessoa, o e-mail e a empresa-cliente.',
    resposta: listaDeParticipantesSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.ver', 'portal.agenda')
  @Get(':id/participantes')
  participantes(@Param('id', uuid()) id: string): Promise<ListaDeParticipantes> {
    return this.servico.participantes(id)
  }

  @Documenta({
    resumo: 'Tirar um participante do evento',
    descricao:
      'Exige `portal.agenda`. Confirmado ou na fila. Se havia lista de espera, o primeiro que cabe é promovido e avisado.',
    resposta: listaDeParticipantesSchema,
    erros: [400, 401, 403, 404],
  })
  @Permissao('portal.agenda')
  @Delete(':id/participantes/:confirmacaoId')
  removerParticipante(
    @Param('id', uuid()) id: string,
    @Param('confirmacaoId', uuid()) confirmacaoId: string,
  ): Promise<ListaDeParticipantes> {
    return this.servico.removerParticipante(id, confirmacaoId)
  }
}

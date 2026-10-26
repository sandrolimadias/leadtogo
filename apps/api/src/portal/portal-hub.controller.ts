import {
  type ConsultaDoHub,
  consultaDoHubSchema,
  type CriarTarefaDoChamadoEntrada,
  criarTarefaDoChamadoSchema,
  type IndicadoresDoHub,
  indicadoresDoHubSchema,
  listaDeTarefasDoChamadoSchema,
  type TarefaDoChamado,
} from '@leadtogo/shared'
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { PortalHubService } from './portal-hub.service.js'

@ApiTags('Portal do cliente: gestão')
@Controller('portal-hub')
export class PortalHubController {
  constructor(private readonly servico: PortalHubService) {}

  @Documenta({
    resumo: 'Indicadores do hub do portal',
    descricao:
      'Exige `portal.ver`. Dos chamados abertos pelos clientes: Em aberto e Prazo estourando (do momento), 1ª resposta no prazo e Nota média (na janela de `dias`, padrão 30), além de acessos ativos e pedidos pendentes. Vale o conjunto de TODOS os chamados do portal.',
    consulta: consultaDoHubSchema,
    resposta: indicadoresDoHubSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('portal.ver')
  @Get('indicadores')
  indicadores(
    @Query(new ZodPipe(consultaDoHubSchema)) consulta: ConsultaDoHub,
  ): Promise<IndicadoresDoHub> {
    return this.servico.indicadores(consulta)
  }
}

/** Tarefas (Atividades) criadas a partir de um chamado. */
@ApiTags('Chamados')
@Controller('chamados')
export class TarefasDoChamadoController {
  constructor(private readonly servico: PortalHubService) {}

  @Documenta({
    resumo: 'Tarefas do chamado',
    descricao: 'Exige `chamados.ver` e que o chamado seja visível para a pessoa.',
    resposta: listaDeTarefasDoChamadoSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('chamados.ver')
  @Get(':id/tarefas')
  listar(@Param('id', new ParseUUIDPipe()) id: string): Promise<{ itens: TarefaDoChamado[] }> {
    return this.servico.tarefas(id)
  }

  @Documenta({
    resumo: 'Criar tarefa a partir do chamado',
    descricao:
      'Exige `chamados.atender` e `atividades.criar`. Cria uma Atividade do tipo Tarefa (pendente), ligada ao chamado e, se a pessoa pode editar a carteira da empresa-cliente, a ela. Escolher outro responsável vale as regras das atividades.',
    corpo: criarTarefaDoChamadoSchema,
    resposta: listaDeTarefasDoChamadoSchema,
    status: 201,
    erros: [400, 401, 403, 404, 409],
  })
  @Permissao('chamados.atender')
  @Post(':id/tarefas')
  criar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(criarTarefaDoChamadoSchema)) dados: CriarTarefaDoChamadoEntrada,
  ): Promise<{ itens: TarefaDoChamado[] }> {
    return this.servico.criarTarefa(id, dados)
  }
}

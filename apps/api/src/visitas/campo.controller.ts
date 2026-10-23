import {
  consultaDeVisitasSchema,
  type DistanciaDoCheckin,
  distanciaDoCheckinSchema,
  type ItemDeVisita,
  type LevarParaOfflineEntrada,
  levarParaOfflineSchema,
  type PacoteOffline,
  pacoteOfflineSchema,
  itemDeVisitaSchema,
  type RelatorioDeVisita,
  relatorioDeVisitaSchema,
  type SalvarVisitaEntrada,
  salvarVisitaSchema,
} from '@leadtogo/shared'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

import { TodoMembro } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { VisitasDoCampoService } from './campo.service.js'

const distanciaConsultaSchema = z
  .object({
    empresaId: z.uuid(),
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
  })
  .strict()

const VISIBILIDADE =
  'Vê o relatório quem vê a atividade (alcance de `atividades.ver`). A posição e a distância do check-in só vêm para quem tem `visitas.ver_localizacao`; para os demais, `null`.'

/** Visitas no campo (G3b): check-in, relatório (upsert idempotente pelo id do aparelho) e pendentes. */
@ApiTags('Visitas: campo')
@Controller('visitas')
export class VisitasDoCampoController {
  constructor(private readonly servico: VisitasDoCampoService) {}

  @Documenta({
    resumo: 'Distância até a empresa antes do check-in',
    descricao:
      'Qualquer membro que vê a empresa. Diz a distância do aparelho até a posição da empresa e o que o modo configurado faz com ela (`foraDoLimite`, `bloqueado`). Nada é gravado.',
    consulta: distanciaConsultaSchema,
    resposta: distanciaDoCheckinSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @TodoMembro()
  @Get('distancia')
  distancia(
    @Query(new ZodPipe(distanciaConsultaSchema)) c: z.infer<typeof distanciaConsultaSchema>,
  ): Promise<DistanciaDoCheckin> {
    return this.servico.distancia(c.empresaId, { latitude: c.latitude, longitude: c.longitude })
  }

  @Documenta({
    resumo: 'Levar empresas para o offline',
    descricao:
      'Qualquer membro. Até 300 empresas por vez (400 acima disso). Devolve o mínimo para visitar sem sinal: nome, endereço, posição, telefone, tags e contatos ativos (os que a pessoa vê); sem CNPJ, observações nem histórico. As que ela não vê só contam em `ignoradas`. O aparelho guarda cifrado por 7 dias.',
    corpo: levarParaOfflineSchema,
    resposta: pacoteOfflineSchema,
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Post('offline')
  @HttpCode(200)
  offline(
    @Body(new ZodPipe(levarParaOfflineSchema)) dados: LevarParaOfflineEntrada,
  ): Promise<PacoteOffline> {
    return this.servico.pacoteOffline(dados.empresaIds)
  }

  @Documenta({
    resumo: 'Listar relatórios de visita',
    descricao: `Qualquer membro. \`empresaId\` filtra pela empresa; \`so=pendentes\` traz só os rascunhos da própria pessoa (a lista do celular e o card do Dashboard). ${VISIBILIDADE} Até 200, do mais novo ao mais antigo.`,
    consulta: consultaDeVisitasSchema,
    resposta: z.array(itemDeVisitaSchema),
    erros: [400, 401, 403, 409],
  })
  @TodoMembro()
  @Get()
  listar(
    @Query(new ZodPipe(consultaDeVisitasSchema)) c: z.infer<typeof consultaDeVisitasSchema>,
  ): Promise<ItemDeVisita[]> {
    return this.servico.listar({
      ...(c.empresaId ? { empresaId: c.empresaId } : {}),
      ...(c.so ? { so: c.so } : {}),
    })
  }

  @Documenta({
    resumo: 'Obter um relatório de visita',
    descricao: `Qualquer membro. ${VISIBILIDADE}`,
    resposta: relatorioDeVisitaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @TodoMembro()
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string): Promise<RelatorioDeVisita> {
    return this.servico.obter(id)
  }

  @Documenta({
    resumo: 'Salvar o relatório de visita (check-in, rascunho ou concluir)',
    descricao:
      'Upsert pelo `id` gerado no aparelho: reenviar não duplica, e reenviar um relatório concluído devolve o gravado. Na criação, `checkin` (posição e hora) cria a atividade Visita em execução; `checkin: null` é "registrar depois". No modo `bloquear`, o check-in online além do limite é recusado (409 `checkin_fora_do_limite`); o feito offline é aceito e marcado `foraDoLimite`. Exige `atividades.criar` e a empresa na carteira que a pessoa edita. `concluir: true` valida os obrigatórios, torna a atividade Realizada e aplica os efeitos (campos de CRM, "não localizada", "encerrada", posição da empresa). Só o autor grava (409 `visita_de_outra_pessoa`).',
    corpo: salvarVisitaSchema,
    resposta: relatorioDeVisitaSchema,
    erros: [400, 401, 403, 404, 409],
  })
  @TodoMembro()
  @Put(':id')
  salvar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(salvarVisitaSchema)) dados: SalvarVisitaEntrada,
  ): Promise<RelatorioDeVisita> {
    return this.servico.salvar(id, dados)
  }
}

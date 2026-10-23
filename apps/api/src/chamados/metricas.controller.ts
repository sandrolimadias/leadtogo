import {
  type ConsultaDeChamados,
  consultaDeChamadosSchema,
  type ConsultaDeMetricas,
  consultaDeMetricasSchema,
  type MetricasDeChamados,
  metricasDeChamadosSchema,
} from '@leadtogo/shared'
import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { Permissao } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { MetricasService } from './metricas.service.js'

/** Métricas e exportação dos chamados. Vem ANTES do controller dos chamados (`/chamados/metricas` não é `/chamados/:id`). */
@ApiTags('Chamados: métricas')
@Controller('chamados')
export class MetricasDeChamadosController {
  constructor(private readonly servico: MetricasService) {}

  @Documenta({
    resumo: 'Métricas dos chamados',
    descricao:
      'Exige `chamados.ver_metricas`; o alcance (própria, equipe, todas) vale sobre o RESPONSÁVEL do chamado. Período pela data de abertura (padrão: os últimos 30 dias). Totais, abertos, tempo médio até a primeira resposta e até a resolução (minutos úteis do expediente, sem a pausa de Aguardando cliente), dias em aberto e % dentro do prazo (só áreas com meta), no geral, por área e por responsável. Até 5.000 chamados por consulta (`truncado`).',
    consulta: consultaDeMetricasSchema,
    resposta: metricasDeChamadosSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('chamados.ver_metricas')
  @Get('metricas')
  metricas(
    @Query(new ZodPipe(consultaDeMetricasSchema)) consulta: ConsultaDeMetricas,
  ): Promise<MetricasDeChamados> {
    return this.servico.metricas(consulta)
  }

  @Documenta({
    resumo: 'Exportar os chamados (CSV)',
    descricao:
      'Exige `chamados.exportar`. Um CSV (`;`, UTF-8 com BOM) com os chamados que a pessoa vê, com os mesmos filtros da lista (sem paginação; até 10.000 linhas), incluindo as metas e a situação dos prazos. Células que começariam com `=`, `+`, `-` ou `@` vão como texto.',
    consulta: consultaDeChamadosSchema,
    erros: [400, 401, 403, 409],
  })
  @Permissao('chamados.exportar')
  @Get('exportar.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="chamados.csv"')
  async exportar(
    @Query(new ZodPipe(consultaDeChamadosSchema)) consulta: ConsultaDeChamados,
  ): Promise<StreamableFile> {
    return new StreamableFile(Buffer.from(await this.servico.csv(consulta)))
  }
}

import {
  type AssociadosDoDashboard,
  associadosDoDashboardSchema,
  type ConsultaDeAssociados,
  consultaDeAssociadosSchema,
  type ConsultaDeContornos,
  consultaDeContornosSchema,
  type ConsultaDeResultados,
  consultaDeResultadosSchema,
  type ConsultaDoDashboard,
  consultaDoDashboardSchema,
  type ConsultaDoMapaDoDashboard,
  consultaDoMapaDoDashboardSchema,
  type ContornosDaUf,
  contornosDaUfSchema,
  type Dashboard,
  dashboardSchema,
  type MapaDoDashboard,
  mapaDoDashboardSchema,
  type ResultadosDoDashboard,
  resultadosDoDashboardSchema,
} from '@leadtogo/shared'
import { Controller, Get, Header, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { TodoMembro } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { DashboardResultadosService } from './dashboard-resultados.service.js'
import { DashboardService } from './dashboard.service.js'

const PERIODO_E_VISAO =
  'Período: `mes`, `mes_anterior`, `trimestre`, `semestre` e `ano` (do calendário, no fuso da empresa), `ano_anterior` (com `ano`) ou `personalizado` (com `de` e `ate`, inclusive, até 3 anos). Visão: `minha` (padrão), `equipe` ou `empresa`, limitada pelo alcance de `empresas.ver` (403 `acesso_negado` acima dele).'

/** O Dashboard da empresa ativa: Minhas atividades e a aba Resultados (período e visão). */
@ApiTags('Carteira: dashboard')
@Controller('carteira/dashboard')
export class DashboardController {
  constructor(
    private readonly servico: DashboardService,
    private readonly resultadosServico: DashboardResultadosService,
  ) {}

  @Documenta({
    resumo: 'Dashboard: minhas atividades',
    descricao:
      'A aba Minhas atividades: o nome do usuário e a contagem das atividades dele de hoje, atrasadas e dos próximos 7 dias (as janelas da tela Atividades, no fuso da empresa). Sem parâmetros (os antigos `periodo` e `funilId` são ignorados); os números do período estão em `/resultados`.',
    consulta: consultaDoDashboardSchema,
    resposta: dashboardSchema,
    erros: [400, 401, 403, 404],
  })
  @TodoMembro()
  @Get()
  dashboard(
    @Query(new ZodPipe(consultaDoDashboardSchema)) consulta: ConsultaDoDashboard,
  ): Promise<Dashboard> {
    return this.servico.dashboard(consulta)
  }

  @Documenta({
    resumo: 'Dashboard: resultados do período',
    descricao: `Os indicadores da aba Resultados. ${PERIODO_E_VISAO} Previsão: valor total das oportunidades ativas na última fase ativa de cada funil ativo, com data prevista no período (as da fase sem data em \`semPrevisao\`). Vendas: valor total das conquistadas pela data de fechamento. MRR, conversão, conquistadas × perdidas e motivos de perda como antes; o funil por fase é o de hoje. Associados: empresas com o Status de chave \`cliente\` no fim e no início do período, pelo histórico de Status; churn = desassociados ÷ associados no início. Visitas: atividades Realizadas do tipo de sistema \`visita\` (as não localizadas contam); atividades realizadas: as dos outros tipos.`,
    consulta: consultaDeResultadosSchema,
    resposta: resultadosDoDashboardSchema,
    erros: [400, 401, 403, 404],
  })
  @TodoMembro()
  @Get('resultados')
  resultados(
    @Query(new ZodPipe(consultaDeResultadosSchema)) consulta: ConsultaDeResultados,
  ): Promise<ResultadosDoDashboard> {
    return this.resultadosServico.resultados(consulta)
  }

  @Documenta({
    resumo: 'Dashboard: novos associados e desassociados',
    descricao: `A lista paginada das empresas que viraram associadas (\`novos\`: não eram no início e são no fim do período) ou deixaram de ser (\`desassociados\`), da mais recente para a mais antiga. ${PERIODO_E_VISAO}`,
    consulta: consultaDeAssociadosSchema,
    resposta: associadosDoDashboardSchema,
    erros: [400, 401, 403],
  })
  @TodoMembro()
  @Get('associados')
  associados(
    @Query(new ZodPipe(consultaDeAssociadosSchema)) consulta: ConsultaDeAssociados,
  ): Promise<AssociadosDoDashboard> {
    return this.resultadosServico.associados(consulta)
  }

  @Documenta({
    resumo: 'Dashboard: associados e empresas por município',
    descricao: `Para os mapas do quadro Carteira: a UF da empresa que usa o CRM (pelo endereço do cadastro dela) e, por município dessa UF, os associados no fim do período e as empresas do cadastro criadas até o fim do período (pela cidade do cadastro da empresa). As de outras UFs e as sem cidade vêm somadas à parte. ${PERIODO_E_VISAO}`,
    consulta: consultaDoMapaDoDashboardSchema,
    resposta: mapaDoDashboardSchema,
    erros: [400, 401, 403],
  })
  @TodoMembro()
  @Get('mapa')
  mapa(
    @Query(new ZodPipe(consultaDoMapaDoDashboardSchema)) consulta: ConsultaDoMapaDoDashboard,
  ): Promise<MapaDoDashboard> {
    return this.resultadosServico.mapa(consulta)
  }

  @Documenta({
    resumo: 'Dashboard: contornos dos municípios da UF',
    descricao:
      'Os contornos simplificados (malha municipal do IBGE) dos municípios da UF, como MultiPolygon do GeoJSON, para desenhar o mapa de densidade. Referência igual para toda empresa: pode ficar em cache. UF sem contornos carregados: lista vazia.',
    consulta: consultaDeContornosSchema,
    resposta: contornosDaUfSchema,
    erros: [400, 401],
  })
  @TodoMembro()
  @Header('Cache-Control', 'private, max-age=86400')
  @Get('contornos')
  contornos(
    @Query(new ZodPipe(consultaDeContornosSchema)) consulta: ConsultaDeContornos,
  ): Promise<ContornosDaUf> {
    return this.resultadosServico.contornos(consulta.uf)
  }
}

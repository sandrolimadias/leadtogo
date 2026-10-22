import {
  type ConsultaDoDashboard,
  consultaDoDashboardSchema,
  type Dashboard,
  dashboardSchema,
} from '@leadtogo/shared'
import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'

import { TodoMembro } from '../acesso/acesso.decorators.js'
import { Documenta } from '../documentacao/documenta.js'
import { ZodPipe } from '../http/zod.pipe.js'
import { DashboardService } from './dashboard.service.js'

/** O Dashboard da empresa ativa (visão "Minha"). */
@ApiTags('Carteira: dashboard')
@Controller('carteira/dashboard')
export class DashboardController {
  constructor(private readonly servico: DashboardService) {}

  @Documenta({
    resumo: 'Dashboard (visão Minha)',
    descricao:
      'Os números do usuário no período (`mes`, `mes_anterior` ou `trimestre` do calendário, no fuso da empresa): previsão (valor ponderado das oportunidades ativas com data prevista no período; as sem data vêm em `semPrevisao`), MRR conquistado (soma do valor mensal das conquistadas, pela data de fechamento, com a variação sobre o período anterior e os últimos 6 meses), taxa de conversão (conquistadas ÷ (conquistadas + perdidas); as canceladas ficam fora), conquistadas × perdidas e canceladas, principais motivos de perda, o funil por fase (as ativas de hoje; sem `funilId`, o funil padrão), a carteira por Status (pela chave do sistema), as empresas novas, as sem contato há N dias (Cliente e Prospect, inclui as nunca contatadas, pelo prazo configurado na empresa) e a contagem das atividades de hoje, atrasadas e dos próximos 7 dias. "Minha" = as oportunidades e atividades de que o usuário é o responsável e as empresas da carteira dele.',
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
}

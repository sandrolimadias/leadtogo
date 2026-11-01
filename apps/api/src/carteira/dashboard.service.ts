import { and, eq, isNull, schema, sql } from '@leadtogo/db'
import type { ConsultaDoDashboard, Dashboard } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { atrasada, hoje, proximos7 } from './atividades-janelas.js'
import { condicaoDeVisibilidadeDaAtividade, fusoDaEmpresa } from './atividades-leitura.js'
import { escopoDaCarteira } from './regras-de-carteira.js'

const { atividades, membros } = schema

/**
 * A aba Minhas atividades do Dashboard: o nome do usuário e as contagens das janelas de atividades (só as
 * dele). Os números do período ficam em `DashboardResultadosService` (aba Resultados).
 */
@Injectable()
export class DashboardService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async dashboard(_consulta: ConsultaDoDashboard): Promise<Dashboard> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const fuso = await fusoDaEmpresa(db, this.ctx.tenantId)
    const eu = escopo.membroId

    const [euMesmo] = await db
      .select({ nome: membros.nome })
      .from(membros)
      .where(eq(membros.id, eu))

    const minhasAtividades = and(
      isNull(atividades.excluidoEm),
      eq(atividades.responsavelId, eu),
      condicaoDeVisibilidadeDaAtividade(escopo),
    )
    const [contagem = {}] = (await db.execute(sql`
        SELECT count(*) FILTER (WHERE ${hoje(fuso)}) AS hoje,
               count(*) FILTER (WHERE ${atrasada(fuso)}) AS atrasadas,
               count(*) FILTER (WHERE ${proximos7(fuso)}) AS proximos7
        FROM atividades
        LEFT JOIN empresas ON empresas.id = atividades.empresa_id
        WHERE ${minhasAtividades}`)) as Record<string, unknown>[]

    return {
      membro: { id: eu, nome: euMesmo?.nome ?? '' },
      atividades: {
        hoje: Number(contagem['hoje'] ?? 0),
        atrasadas: Number(contagem['atrasadas'] ?? 0),
        proximos7: Number(contagem['proximos7'] ?? 0),
      },
    }
  }
}

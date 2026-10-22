import { eq, schema, sql } from '@leadtogo/db'
import type { ConfiguracaoDeVisitas } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'

const { tenantConfiguracoes } = schema

const PADRAO: ConfiguracaoDeVisitas = {
  checkinModo: 'avisar',
  checkinLimiteM: 300,
  lembreteRelatoriosHora: '17:30',
}

/** Configuração do check-in e do lembrete de relatórios pendentes (Configurações → Visitas → Check-in). */
@Injectable()
export class ConfiguracaoDeVisitasService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async obter(): Promise<ConfiguracaoDeVisitas> {
    const [linha] = await this.ctx
      .db()
      .select({
        checkinModo: tenantConfiguracoes.checkinModo,
        checkinLimiteM: tenantConfiguracoes.checkinLimiteM,
        hora: tenantConfiguracoes.lembreteRelatoriosHora,
      })
      .from(tenantConfiguracoes)
      .where(eq(tenantConfiguracoes.tenantId, this.ctx.tenantId))
    if (!linha) return PADRAO
    // o Postgres devolve "HH:MM:SS"
    return {
      checkinModo: linha.checkinModo,
      checkinLimiteM: linha.checkinLimiteM,
      lembreteRelatoriosHora: linha.hora.slice(0, 5),
    }
  }

  /** `cadastros.gerir` (na rota). Vale na próxima requisição de cada pessoa. */
  async alterar(nova: ConfiguracaoDeVisitas): Promise<ConfiguracaoDeVisitas> {
    const antes = await this.obter()
    await this.ctx.db().execute(sql`
      INSERT INTO tenant_configuracoes (tenant_id, checkin_modo, checkin_limite_m, lembrete_relatorios_hora)
      VALUES (${this.ctx.tenantId}, ${nova.checkinModo}, ${nova.checkinLimiteM}, ${nova.lembreteRelatoriosHora})
      ON CONFLICT (tenant_id) DO UPDATE
      SET checkin_modo = EXCLUDED.checkin_modo, checkin_limite_m = EXCLUDED.checkin_limite_m,
        lembrete_relatorios_hora = EXCLUDED.lembrete_relatorios_hora, atualizado_em = now()`)
    const mudancas = Object.fromEntries(
      (Object.keys(nova) as (keyof ConfiguracaoDeVisitas)[])
        .filter((k) => antes[k] !== nova[k])
        .map((k) => [k, { de: antes[k], para: nova[k] }]),
    )
    if (Object.keys(mudancas).length > 0) {
      await this.auditoria.registrar({
        entidade: 'configuracao_de_visitas',
        acao: 'alterar',
        alteracoes: mudancas,
      })
    }
    return nova
  }
}

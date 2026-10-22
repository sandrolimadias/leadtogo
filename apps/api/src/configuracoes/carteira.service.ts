import { eq, schema, sql } from '@leadtogo/db'
import type { ConfiguracaoDaCarteira, ConfiguracaoDaCarteiraPatch } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'

const { tenantConfiguracoes } = schema

/** Regras da carteira de empresas da empresa ativa (hoje: o bloqueio de empresa não ativa na Receita). */
@Injectable()
export class ConfiguracaoDaCarteiraService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async obter(): Promise<ConfiguracaoDaCarteira> {
    const [linha] = await this.ctx
      .db()
      .select({
        bloquearEmpresaNaoAtiva: tenantConfiguracoes.bloquearEmpresaNaoAtiva,
      })
      .from(tenantConfiguracoes)
      .where(eq(tenantConfiguracoes.tenantId, this.ctx.tenantId))
    // empresa sem linha de configuração: valem os padrões
    return linha ?? { bloquearEmpresaNaoAtiva: true }
  }

  /** `carteira.configurar` (na rota). Vale na próxima requisição de cada pessoa. */
  async alterar(patch: ConfiguracaoDaCarteiraPatch): Promise<ConfiguracaoDaCarteira> {
    const antes = await this.obter()
    const depois = { ...antes, ...patch }
    await this.ctx.db().execute(sql`
      INSERT INTO tenant_configuracoes (tenant_id, bloquear_empresa_nao_ativa)
      VALUES (${this.ctx.tenantId}, ${depois.bloquearEmpresaNaoAtiva})
      ON CONFLICT (tenant_id) DO UPDATE
      SET bloquear_empresa_nao_ativa = EXCLUDED.bloquear_empresa_nao_ativa, atualizado_em = now()`)
    const mudancas = Object.fromEntries(
      (Object.keys(depois) as (keyof ConfiguracaoDaCarteira)[])
        .filter((k) => antes[k] !== depois[k])
        .map((k) => [k, { de: antes[k], para: depois[k] }]),
    )
    if (Object.keys(mudancas).length > 0) {
      await this.auditoria.registrar({
        entidade: 'configuracao_da_carteira',
        acao: 'alterar',
        alteracoes: mudancas,
      })
    }
    return depois
  }
}

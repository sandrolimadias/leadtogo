import { eq, schema, sql } from '@leadtogo/db'
import type { ConfiguracaoDaCarteira, ConfiguracaoDaCarteiraPatch } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

const { tenantConfiguracoes } = schema

/** Regras da carteira de empresas da empresa ativa (bloqueio de empresa não ativa; vendedor vê todas). */
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
        vendedorVeTodasEmpresas: tenantConfiguracoes.vendedorVeTodasEmpresas,
      })
      .from(tenantConfiguracoes)
      .where(eq(tenantConfiguracoes.tenantId, this.ctx.tenantId))
    // empresa sem linha de configuração: valem os padrões
    return linha ?? { bloquearEmpresaNaoAtiva: true, vendedorVeTodasEmpresas: false }
  }

  /** Só o administrador. Vale na próxima requisição de cada pessoa. */
  async alterar(patch: ConfiguracaoDaCarteiraPatch): Promise<ConfiguracaoDaCarteira> {
    if (this.ctx.membro.papel !== 'admin') {
      throw new ErroApi(
        'acesso_negado',
        'Só administradores da empresa podem alterar as regras da carteira.',
        403,
      )
    }
    const antes = await this.obter()
    const depois = { ...antes, ...patch }
    await this.ctx.db().execute(sql`
      INSERT INTO tenant_configuracoes (tenant_id, bloquear_empresa_nao_ativa, vendedor_ve_todas_empresas)
      VALUES (${this.ctx.tenantId}, ${depois.bloquearEmpresaNaoAtiva}, ${depois.vendedorVeTodasEmpresas})
      ON CONFLICT (tenant_id) DO UPDATE
      SET bloquear_empresa_nao_ativa = EXCLUDED.bloquear_empresa_nao_ativa,
          vendedor_ve_todas_empresas = EXCLUDED.vendedor_ve_todas_empresas,
          atualizado_em = now()`)
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

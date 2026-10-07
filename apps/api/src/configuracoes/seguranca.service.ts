import { sql } from '@leadtogo/db'
import type { PoliticaDoisFatores, Seguranca, SegurancaPatch } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'

/** Configurações de segurança da empresa ativa (hoje: a política de 2FA). */
@Injectable()
export class SegurancaService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async obter(): Promise<Seguranca> {
    const [linha] = await this.ctx
      .db()
      .execute<{ dois_fatores_exigido: PoliticaDoisFatores }>(
        sql`SELECT dois_fatores_exigido FROM tenant_configuracoes WHERE tenant_id = ${this.ctx.tenantId}`,
      )
    // empresa sem linha de configuração: vale o padrão
    return { doisFatoresExigido: linha?.dois_fatores_exigido ?? 'admin' }
  }

  /** Só o administrador da empresa. A mudança vale na próxima requisição de cada pessoa. */
  async alterar(patch: SegurancaPatch): Promise<Seguranca> {
    if (this.ctx.membro.papel !== 'admin') {
      throw new ErroApi(
        'acesso_negado',
        'Só administradores da empresa podem alterar a segurança.',
        403,
      )
    }
    await this.ctx.db().execute(sql`
      INSERT INTO tenant_configuracoes (tenant_id, dois_fatores_exigido)
      VALUES (${this.ctx.tenantId}, ${patch.doisFatoresExigido}::politica_dois_fatores)
      ON CONFLICT (tenant_id) DO UPDATE
      SET dois_fatores_exigido = EXCLUDED.dois_fatores_exigido, atualizado_em = now()`)
    return { doisFatoresExigido: patch.doisFatoresExigido }
  }
}

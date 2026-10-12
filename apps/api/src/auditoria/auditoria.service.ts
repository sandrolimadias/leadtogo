import { sql } from '@leadtogo/db'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'

export interface RegistroDeAuditoria {
  entidade: string
  entidadeId?: string | undefined
  acao: string
  /** O que mudou (antes/depois) ou os dados do ato; nunca segredos nem tokens */
  alteracoes?: Record<string, unknown> | undefined
}

/**
 * Registra no log de auditoria (`auditoria`, só de acréscimo) um ato da empresa ativa, feito pelo
 * membro da requisição. Grava na transação da requisição: se o ato for desfeito, o registro também.
 */
@Injectable()
export class AuditoriaService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async registrar(registro: RegistroDeAuditoria): Promise<void> {
    await this.ctx.db().execute(sql`
      INSERT INTO auditoria (tenant_id, entidade, entidade_id, acao, alteracoes, membro_id, origem)
      VALUES (${this.ctx.tenantId}, ${registro.entidade}, ${registro.entidadeId ?? null}, ${registro.acao},
              ${registro.alteracoes ? JSON.stringify(registro.alteracoes) : null}::jsonb, ${this.ctx.membro.id}, 'app')`)
  }
}

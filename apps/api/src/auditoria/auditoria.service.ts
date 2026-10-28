import { isIP } from 'node:net'

import { type Conexao, sql } from '@leadtogo/db'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'

type Transacao = Parameters<Parameters<Conexao['db']['transaction']>[0]>[0]

export interface RegistroDeAuditoria {
  entidade: string
  entidadeId?: string | undefined
  acao: string
  /** O que mudou (antes/depois) ou os dados do ato; nunca segredos nem tokens */
  alteracoes?: Record<string, unknown> | undefined
  /** IP do cliente; sem ele, usa o da requisição (`ContextoTenantService.ip`). Valor inválido vira nulo */
  ip?: string | undefined
  /** `app` (padrão) ou `integracao` (chave de API); `registrar` decide pelo contexto da requisição */
  origem?: 'app' | 'integracao' | undefined
}

/**
 * Registra no log de auditoria (`auditoria`, só de acréscimo) um ato da empresa ativa, feito pelo
 * membro da requisição (na API pública, o membro de integração da chave, com `origem = integracao`). Grava na transação da requisição: se o ato for desfeito, o registro também.
 */
@Injectable()
export class AuditoriaService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async registrar(registro: RegistroDeAuditoria): Promise<void> {
    await this.registrarEm(this.ctx.db(), this.ctx.tenantId, this.ctx.membro.id, {
      ...registro,
      ip: registro.ip ?? this.ctx.ip,
      origem: registro.origem ?? (this.ctx.chaveApi ? 'integracao' : 'app'),
    })
  }

  /** Para quando o ato cria a própria empresa (não há empresa ativa na requisição): tenant e autor explícitos. */
  async registrarEm(
    tx: Transacao,
    tenantId: string,
    membroId: string,
    registro: RegistroDeAuditoria,
  ): Promise<void> {
    await tx.execute(sql`
      INSERT INTO auditoria (tenant_id, entidade, entidade_id, acao, alteracoes, membro_id, origem, ip)
      VALUES (${tenantId}, ${registro.entidade}, ${registro.entidadeId ?? null}, ${registro.acao},
              ${registro.alteracoes ? JSON.stringify(registro.alteracoes) : null}::jsonb, ${membroId}, ${registro.origem ?? 'app'}::origem_auditoria,
              ${registro.ip && isIP(registro.ip) ? registro.ip : null}::inet)`)
  }
}

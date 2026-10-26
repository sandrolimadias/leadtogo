import { isIP } from 'node:net'

import { sql } from '@leadtogo/db'

import type { Transacao } from '../acesso/contexto-tenant.service.js'

export interface AtoDoPortal {
  tenantId: string
  acessoId: string
  contatoId: string
  entidade: string
  entidadeId?: string | undefined
  acao: string
  alteracoes?: Record<string, unknown> | undefined
  ip?: string | undefined
}

/**
 * Auditoria do que o cliente faz. A tabela `auditoria` registra o membro da equipe (`membro_id`), então o ato do
 * cliente grava `membro_id` nulo e o ator `contato` (acesso e contato) dentro de `alteracoes.ator`. Nunca
 * entram tokens nem códigos.
 */
export async function auditarAtoDoPortal(tx: Transacao, ato: AtoDoPortal): Promise<void> {
  const alteracoes = {
    ator: { tipo: 'contato', acessoId: ato.acessoId, contatoId: ato.contatoId },
    ...ato.alteracoes,
  }
  await tx.execute(sql`
    INSERT INTO auditoria (tenant_id, entidade, entidade_id, acao, alteracoes, membro_id, origem, ip)
    VALUES (${ato.tenantId}, ${ato.entidade}, ${ato.entidadeId ?? null}, ${ato.acao},
            ${JSON.stringify(alteracoes)}::jsonb, NULL, 'app',
            ${ato.ip && isIP(ato.ip) ? ato.ip : null}::inet)`)
}

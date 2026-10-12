import { AsyncLocalStorage } from 'node:async_hooks'

import type { Conexao } from '@leadtogo/db'
import { Injectable } from '@nestjs/common'

import { ErroApi } from '../http/erro-api.js'
import type { PapelMembro } from './requisicao.js'

/** A transação da requisição, já com o tenant (ou o consolidado) definido. */
export type Transacao = Parameters<Parameters<Conexao['db']['transaction']>[0]>[0]

export interface ContextoDaRequisicao {
  usuarioId: string
  tx: Transacao
  /** Empresa ativa (ausente no consolidado) */
  tenantId?: string
  /** Empresas do consolidado (só leitura) */
  tenantIds?: string[]
  membro?: { id: string; papel: PapelMembro }
  /** IP do cliente (`req.ip`, que respeita TRUST_PROXY: o mesmo do rate limit; X-Forwarded-For forjado não vale) */
  ip?: string | undefined
}

/**
 * Contexto da requisição em andamento: a transação com `app.tenant_id` (ou `app.tenant_ids`) já
 * definidos. Todo acesso a dado de tenant passa por `db()`: assim o RLS vale para tudo e nada
 * roda fora da empresa ativa.
 */
@Injectable()
export class ContextoTenantService {
  private readonly armazenamento = new AsyncLocalStorage<ContextoDaRequisicao>()

  executar<T>(contexto: ContextoDaRequisicao, fn: () => Promise<T>): Promise<T> {
    return this.armazenamento.run(contexto, fn)
  }

  private atual(): ContextoDaRequisicao {
    const contexto = this.armazenamento.getStore()
    if (!contexto) {
      // Erro de programação (código rodando fora de uma requisição com empresa): nunca 4xx do cliente
      throw new Error('Sem contexto de tenant: use esta rota com uma empresa ativa')
    }
    return contexto
  }

  /** Transação da requisição: use no lugar da conexão geral para ler e gravar dados da empresa. */
  db(): Transacao {
    return this.atual().tx
  }

  get usuarioId(): string {
    return this.atual().usuarioId
  }

  get tenantId(): string {
    const { tenantId } = this.atual()
    if (!tenantId) throw new ErroApi('sem_empresa_ativa', 'Esta rota exige uma empresa ativa.', 409)
    return tenantId
  }

  get ip(): string | undefined {
    return this.atual().ip
  }

  get tenantIds(): string[] {
    return this.atual().tenantIds ?? []
  }

  get membro(): { id: string; papel: PapelMembro } {
    const { membro } = this.atual()
    if (!membro) throw new ErroApi('sem_empresa_ativa', 'Esta rota exige uma empresa ativa.', 409)
    return membro
  }
}

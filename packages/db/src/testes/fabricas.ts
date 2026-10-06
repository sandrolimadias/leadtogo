import type { FabricaRegistrada } from './isolamento.js'
import type { Sql } from './conexoes.js'

/**
 * Fábricas do teste de isolamento: uma por tabela com `tenant_id`. Quem cria uma tabela com
 * `tenant_id` registra aqui como inserir UMA linha válida dela; sem isso o teste falha.
 */
export const fabricas: Record<string, FabricaRegistrada> = {}

/** Cria o que as fábricas pressupõem para os tenants de teste (ex.: conta e linha em `tenants`). */
export async function prepararTenants(_owner: Sql, _ids: string[]): Promise<void> {
  // Entra com as tabelas de plataforma.
}

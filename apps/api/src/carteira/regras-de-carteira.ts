import { eq, schema, sql } from '@leadtogo/db'

import type { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import type { PapelMembro } from '../acesso/requisicao.js'

/**
 * Regra de carteira (docs/funcionalidades.md, seção 10): cada empresa tem um responsável (o vendedor).
 *  - admin e gestor veem e editam tudo;
 *  - o vendedor vê a própria carteira, ou todas se a empresa ligou "Vendedores podem ver todas as
 *    empresas"; edita sempre só a própria.
 * O RLS isola as empresas (tenants); esta regra isola os vendedores dentro da empresa, na API.
 */
export interface EscopoDaCarteira {
  membroId: string
  papel: PapelMembro
  /** Vê empresas de outros vendedores */
  veTodas: boolean
  /** Bloqueia o cadastro de CNPJ que não esteja ativo na Receita */
  bloquearNaoAtiva: boolean
}

export async function escopoDaCarteira(ctx: ContextoTenantService): Promise<EscopoDaCarteira> {
  const [config] = await ctx
    .db()
    .select({
      vendedorVeTodas: schema.tenantConfiguracoes.vendedorVeTodasEmpresas,
      bloquear: schema.tenantConfiguracoes.bloquearEmpresaNaoAtiva,
    })
    .from(schema.tenantConfiguracoes)
    .where(eq(schema.tenantConfiguracoes.tenantId, ctx.tenantId))
  const { id, papel } = ctx.membro
  return {
    membroId: id,
    papel,
    veTodas: papel !== 'vendedor' || (config?.vendedorVeTodas ?? false),
    bloquearNaoAtiva: config?.bloquear ?? true,
  }
}

export const podeVer = (e: EscopoDaCarteira, vendedorId: string): boolean =>
  e.veTodas || vendedorId === e.membroId

export const podeEditar = (e: EscopoDaCarteira, vendedorId: string): boolean =>
  e.papel !== 'vendedor' || vendedorId === e.membroId

/** Excluir empresa: só admin e gestor. */
export const podeExcluir = (e: EscopoDaCarteira): boolean => e.papel !== 'vendedor'

/** Passar a carteira para outro vendedor (e cadastrar em nome de outro): só admin e gestor. */
export const podeTransferir = (e: EscopoDaCarteira): boolean => e.papel !== 'vendedor'

/** Condição SQL das empresas que o usuário vê (`undefined` = todas). Para as listagens. */
export const condicaoDeVisibilidade = (e: EscopoDaCarteira) =>
  e.veTodas ? undefined : sql`${schema.empresas.vendedorId} = ${e.membroId}`

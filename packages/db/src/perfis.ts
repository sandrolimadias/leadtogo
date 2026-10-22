import { and, eq, isNull, sql } from 'drizzle-orm'

import { novoId } from './id.js'
import {
  convites,
  membros,
  perfilPermissoes,
  perfisAcesso,
  tenantConfiguracoes,
} from './schema/index.js'
import type { Db } from './seeds/upsert.js'

type Tx = Pick<Db, 'insert' | 'update' | 'select'>

export type ChavePerfilSistema = 'admin' | 'gestor' | 'vendedor'
export type AlcanceGravado = 'propria' | 'equipe' | 'todas'
export type PoliticaAntiga = 'admin' | 'admin_gestor' | 'todos'

/**
 * Padrões dos perfis de sistema, vindos do catálogo de permissões (packages/shared/src/permissoes.ts).
 * A API os monta e passa para cá: o pacote do banco não depende do `shared`.
 */
export interface PadroesDosPerfis {
  perfis: {
    chave: ChavePerfilSistema
    nome: string
    permissoes: { permissao: string; alcance: AlcanceGravado | null }[]
  }[]
  /** Ações de ver que o interruptor "Vendedores podem ver todas as empresas" ampliava */
  permissoesDeVer: readonly string[]
  /** Como a política antiga de 2FA vira o flag `exige_2fa` de cada perfil de sistema */
  exige2fa: (politica: PoliticaAntiga) => Record<ChavePerfilSistema, boolean>
}

/**
 * Cria os perfis de acesso de sistema (Administrador, Gestor, Vendedor) de UMA empresa, reproduzindo o
 * comportamento dos papéis antigos, e liga membros e convites pelo papel. Converte o interruptor
 * "Vendedores podem ver todas as empresas" (Vendedor com `ver = todas`, `editar = propria`) e a
 * política de 2FA por papel (flag `exige_2fa`). Idempotente pela marca `perfis_criados_em`: com ela
 * preenchida, não faz nada e devolve false. Precisa do tenant ativo na transação (RLS).
 */
export async function criarPerfisDoTenant(
  tx: Tx,
  tenantId: string,
  padroes: PadroesDosPerfis,
  membroId: string | null = null,
): Promise<boolean> {
  const reservado = await tx
    .update(tenantConfiguracoes)
    .set({ perfisCriadosEm: new Date() })
    .where(
      and(eq(tenantConfiguracoes.tenantId, tenantId), isNull(tenantConfiguracoes.perfisCriadosEm)),
    )
    .returning({
      veTodas: tenantConfiguracoes.vendedorVeTodasEmpresas,
      politica: tenantConfiguracoes.doisFatoresExigido,
    })
  const config = reservado[0]
  if (!config) return false

  const exige2fa = padroes.exige2fa(config.politica)
  const ver = new Set(padroes.permissoesDeVer)
  const autoria = { tenantId, criadoPor: membroId, atualizadoPor: membroId }
  for (const perfil of padroes.perfis) {
    const id = novoId()
    await tx.insert(perfisAcesso).values({
      ...autoria,
      id,
      nome: perfil.nome,
      sistema: true,
      chaveSistema: perfil.chave,
      exige2fa: exige2fa[perfil.chave],
    })
    const permissoes = perfil.permissoes.map((p) => ({
      tenantId,
      perfilId: id,
      permissao: p.permissao,
      alcance:
        perfil.chave === 'vendedor' && config.veTodas && ver.has(p.permissao)
          ? ('todas' as const)
          : p.alcance,
    }))
    if (permissoes.length > 0) await tx.insert(perfilPermissoes).values(permissoes)
    await tx
      .update(membros)
      .set({ perfilId: id })
      .where(
        and(
          eq(membros.tenantId, tenantId),
          eq(membros.papel, perfil.chave),
          isNull(membros.perfilId),
        ),
      )
    await tx
      .update(convites)
      .set({ perfilId: id })
      .where(
        and(
          eq(convites.tenantId, tenantId),
          eq(convites.papel, perfil.chave),
          isNull(convites.perfilId),
        ),
      )
  }
  return true
}

/** Para os testes e diagnósticos: quantos membros da empresa ainda estão sem perfil. */
export async function membrosSemPerfil(tx: Tx, tenantId: string): Promise<number> {
  const [linha] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(membros)
    .where(and(eq(membros.tenantId, tenantId), isNull(membros.perfilId)))
  return linha?.n ?? 0
}

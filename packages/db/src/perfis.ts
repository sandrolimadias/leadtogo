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
  /** Versão atual do catálogo, gravada na empresa ao criar os perfis */
  versao: number
  /** As chaves que cada versão (2 em diante) acrescentou, para sincronizar os perfis de sistema */
  novasPorVersao: Record<number, readonly string[]>
}

/**
 * Cria os perfis de acesso de sistema (Administrador, Gestor, Vendedor) de UMA empresa, reproduzindo o
 * comportamento dos papéis antigos, e liga membros e convites pelo papel. Converte o interruptor
 * "Vendedores podem ver todas as empresas" (Vendedor com `ver = todas`, `editar = propria`) e a
 * política de 2FA por papel (flag `exige_2fa`). Idempotente pela marca `perfis_criados_em`: com ela
 * preenchida, não faz nada e devolve null; senão, o id de cada perfil criado. Precisa do tenant ativo
 * na transação (RLS).
 */
export async function criarPerfisDoTenant(
  tx: Tx,
  tenantId: string,
  padroes: PadroesDosPerfis,
  membroId: string | null = null,
): Promise<Partial<Record<ChavePerfilSistema, string>> | null> {
  const reservado = await tx
    .update(tenantConfiguracoes)
    .set({ perfisCriadosEm: new Date(), catalogoPerfisVersao: padroes.versao })
    .where(
      and(eq(tenantConfiguracoes.tenantId, tenantId), isNull(tenantConfiguracoes.perfisCriadosEm)),
    )
    .returning({
      veTodas: tenantConfiguracoes.vendedorVeTodasEmpresas,
      politica: tenantConfiguracoes.doisFatoresExigido,
    })
  const config = reservado[0]
  if (!config) return null

  const exige2fa = padroes.exige2fa(config.politica)
  const ver = new Set(padroes.permissoesDeVer)
  const autoria = { tenantId, criadoPor: membroId, atualizadoPor: membroId }
  const criados: Partial<Record<ChavePerfilSistema, string>> = {}
  for (const perfil of padroes.perfis) {
    const id = novoId()
    criados[perfil.chave] = id
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
  return criados
}

/**
 * Leva os perfis de SISTEMA de uma empresa até a versão atual do catálogo: cada perfil recebe as chaves
 * novas (das versões depois da gravada) que o SEU padrão tem, com o alcance padrão. Nada mais muda (o que
 * o administrador tirou ou mudou fica); perfis criados pela empresa nunca recebem permissão sozinhos.
 * Idempotente pela marca `catalogo_perfis_versao` (reservada antes de tudo, na mesma transação). Devolve
 * quantas permissões entraram, ou null se não havia o que sincronizar. Precisa do tenant ativo (RLS).
 */
export async function sincronizarCatalogoDoTenant(
  tx: Tx,
  tenantId: string,
  padroes: PadroesDosPerfis,
): Promise<number | null> {
  const [atual] = await tx
    .select({
      versao: tenantConfiguracoes.catalogoPerfisVersao,
      criados: tenantConfiguracoes.perfisCriadosEm,
    })
    .from(tenantConfiguracoes)
    .where(eq(tenantConfiguracoes.tenantId, tenantId))
  const de = atual?.versao ?? 1
  if (!atual?.criados || de >= padroes.versao) return null
  // Reserva otimista: só passa quem ainda vê a versão lida (duas execuções juntas não sincronizam duas vezes)
  const reservado = await tx
    .update(tenantConfiguracoes)
    .set({ catalogoPerfisVersao: padroes.versao })
    .where(
      and(
        eq(tenantConfiguracoes.tenantId, tenantId),
        sql`coalesce(${tenantConfiguracoes.catalogoPerfisVersao}, 1) = ${de}`,
      ),
    )
    .returning({ tenantId: tenantConfiguracoes.tenantId })
  if (reservado.length === 0) return null

  const novas = new Set(
    Object.entries(padroes.novasPorVersao)
      .filter(([v]) => Number(v) > de && Number(v) <= padroes.versao)
      .flatMap(([, chaves]) => chaves),
  )
  if (novas.size === 0) return 0
  const sistema = await tx
    .select({ id: perfisAcesso.id, chave: perfisAcesso.chaveSistema })
    .from(perfisAcesso)
    .where(
      and(
        eq(perfisAcesso.tenantId, tenantId),
        eq(perfisAcesso.sistema, true),
        isNull(perfisAcesso.excluidoEm),
      ),
    )
  const linhas = sistema.flatMap((perfil) => {
    const padrao = padroes.perfis.find((x) => x.chave === perfil.chave)
    return (padrao?.permissoes ?? [])
      .filter((x) => novas.has(x.permissao))
      .map((x) => ({ tenantId, perfilId: perfil.id, permissao: x.permissao, alcance: x.alcance }))
  })
  if (linhas.length === 0) return 0
  const inseridas = await tx
    .insert(perfilPermissoes)
    .values(linhas)
    .onConflictDoNothing()
    .returning({ permissao: perfilPermissoes.permissao })
  return inseridas.length
}

/** Para os testes e diagnósticos: quantos membros da empresa ainda estão sem perfil. */
export async function membrosSemPerfil(tx: Tx, tenantId: string): Promise<number> {
  const [linha] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(membros)
    .where(and(eq(membros.tenantId, tenantId), isNull(membros.perfilId)))
  return linha?.n ?? 0
}

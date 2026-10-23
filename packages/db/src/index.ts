import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema/index.js'
import {
  criarPadroesChamadosDoTenant,
  criarPadroesDoTenant,
  criarPadroesGeoDoTenant,
  criarPadroesVisitaDoTenant,
  criarPapeisDoTenant,
} from './padroes.js'
import {
  criarPerfisDoTenant,
  type PadroesDosPerfis,
  sincronizarCatalogoDoTenant,
} from './perfis.js'
import { semearReferencias } from './seeds/referencias.js'
import type { Db } from './seeds/upsert.js'

export { schema }

/** Cria a conexão Drizzle (postgres.js). A API usa o usuário da aplicação, sujeito a RLS. */
export function criarConexao(url: string, opcoes: postgres.Options<Record<string, never>> = {}) {
  const cliente = postgres(url, opcoes)
  return { db: drizzle(cliente, { schema, casing: 'snake_case' }), cliente }
}

export type Conexao = ReturnType<typeof criarConexao>

/**
 * Semeia as referências globais (estados, municípios, países, portes, qualificações e CNAEs) com a
 * URL do `leadtogo_owner` (o app só lê estas tabelas). Nunca semeia a demonstração. Repetível: só
 * grava o que falta ou mudou. Devolve quantas linhas cada tabela tem no arquivo de dados.
 */
export async function semearReferenciasPorUrl(url: string): Promise<Record<string, number>> {
  const { db, cliente } = criarConexao(url, { max: 1, onnotice: () => {} })
  try {
    return await semearReferencias(db)
  } finally {
    await cliente.end()
  }
}

/**
 * Cria os cadastros padrão de TODA empresa que ainda não os teve (marca `padroes_criados_em` vazia),
 * com a URL do `leadtogo_owner`. Roda a cada start da API, logo depois das migrações: é o backfill das
 * empresas que já existiam e uma rede de segurança para as novas. Uma transação por empresa; se uma
 * falhar, as outras seguem e a falha é devolvida em `falhas` (a marca fica vazia e o próximo start
 * tenta de novo). Idempotente: empresa com a marca preenchida nunca é tocada. Faz o mesmo, com marca
 * própria (`papeis_decisao_criados_em`), para os papéis na decisão e (`geo_padroes_criados_em`) para o
 * grupo "Cadastro" e as flags do mapa, (`visitas_padroes_criados_em`) para o modelo e os resultados de
 * visita e (`perfis_criados_em`, quando a API passa os `perfis`) para os
 * perfis de acesso de sistema, ligando membros e convites.
 */
export async function criarPadroesPendentesPorUrl(
  url: string,
  perfis?: PadroesDosPerfis,
): Promise<{ criados: number; falhas: { tenantId: string; erro: string }[] }> {
  const { db, cliente } = criarConexao(url, { max: 1, onnotice: () => {} })
  try {
    const pendentes = await cliente<
      { tenant_id: string }[]
    >`SELECT tenant_id FROM app_tenants_sem_padroes()`
    let criados = 0
    const falhas: { tenantId: string; erro: string }[] = []
    for (const { tenant_id: tenantId } of pendentes) {
      try {
        const feito = await db.transaction(async (tx) => {
          // As tabelas têm RLS forçado, inclusive para o dono: o tenant precisa estar ativo
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
          return criarPadroesDoTenant(tx, tenantId)
        })
        if (feito) criados += 1
      } catch (e) {
        falhas.push({ tenantId, erro: e instanceof Error ? e.message : String(e) })
      }
    }
    // Empresas que já existiam antes dos papéis na decisão (Módulo 3) também precisam deles
    const semPapeis = await cliente<
      { tenant_id: string }[]
    >`SELECT tenant_id FROM app_tenants_sem_papeis()`
    for (const { tenant_id: tenantId } of semPapeis) {
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
          await criarPapeisDoTenant(tx, tenantId)
        })
      } catch (e) {
        falhas.push({ tenantId, erro: e instanceof Error ? e.message : String(e) })
      }
    }
    // Empresas que já existiam antes da geolocalização (G1): grupo "Cadastro" e flags do mapa
    const semGeo = await cliente<
      { tenant_id: string }[]
    >`SELECT tenant_id FROM app_tenants_sem_padroes_geo()`
    for (const { tenant_id: tenantId } of semGeo) {
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
          await criarPadroesGeoDoTenant(tx, tenantId)
        })
      } catch (e) {
        falhas.push({ tenantId, erro: e instanceof Error ? e.message : String(e) })
      }
    }
    // Empresas que já existiam antes do G3a: modelo padrão do relatório de visita e os seis resultados
    const semVisitas = await cliente<
      { tenant_id: string }[]
    >`SELECT tenant_id FROM app_tenants_sem_padroes_visita()`
    for (const { tenant_id: tenantId } of semVisitas) {
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
          await criarPadroesVisitaDoTenant(tx, tenantId)
        })
      } catch (e) {
        falhas.push({ tenantId, erro: e instanceof Error ? e.message : String(e) })
      }
    }
    // Empresas que já existiam antes da central de chamados (Fase 2): áreas, expediente, feriados e triagem
    const semChamados = await cliente<
      { tenant_id: string }[]
    >`SELECT tenant_id FROM app_tenants_sem_padroes_chamados()`
    for (const { tenant_id: tenantId } of semChamados) {
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
          await criarPadroesChamadosDoTenant(tx, tenantId)
        })
      } catch (e) {
        falhas.push({ tenantId, erro: e instanceof Error ? e.message : String(e) })
      }
    }
    // Perfis de acesso (Fase 1): os três de sistema, com membros e convites ligados pelo papel
    if (perfis) {
      const semPerfis = await cliente<
        { tenant_id: string }[]
      >`SELECT tenant_id FROM app_tenants_sem_perfis()`
      for (const { tenant_id: tenantId } of semPerfis) {
        try {
          await db.transaction(async (tx) => {
            await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
            await criarPerfisDoTenant(tx, tenantId, perfis)
          })
        } catch (e) {
          falhas.push({ tenantId, erro: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    // Catálogo de permissões: os perfis de sistema das empresas criadas numa versão anterior recebem as chaves novas
    if (perfis) {
      const desatualizadas = await cliente<
        { tenant_id: string }[]
      >`SELECT tenant_id FROM app_tenants_catalogo_desatualizado(${perfis.versao})`
      for (const { tenant_id: tenantId } of desatualizadas) {
        try {
          await db.transaction(async (tx) => {
            await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
            await sincronizarCatalogoDoTenant(tx, tenantId, perfis)
          })
        } catch (e) {
          falhas.push({ tenantId, erro: e instanceof Error ? e.message : String(e) })
        }
      }
    }
    return { criados, falhas }
  } finally {
    await cliente.end()
  }
}

export { novoId } from './id.js'
export { aplicarMigracoes, pastaMigracoes } from './migrar.js'

// A mesma instância do drizzle-orm que o `db` usa: quem monta consultas com `sql` fora deste
// pacote (a API) importa daqui, para os tipos casarem (o pnpm pode ter mais de uma cópia).
export { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
export { alias } from 'drizzle-orm/pg-core'
export {
  criarPadroesChamadosDoTenant,
  criarPadroesDoTenant,
  criarPadroesGeoDoTenant,
  criarPadroesVisitaDoTenant,
  criarPapeisDoTenant,
}
export {
  camposDoModeloDeFabrica,
  type CampoDeVisitaGravado,
  feriadosNacionaisMoveis,
  gerarFeriadosMoveis,
} from './padroes.js'
export { criarPerfisDoTenant, membrosSemPerfil, sincronizarCatalogoDoTenant } from './perfis.js'
export type {
  AlcanceGravado,
  ChavePerfilSistema,
  PadroesDosPerfis,
  PoliticaAntiga,
} from './perfis.js'
export { CHAVE_GRUPO_CADASTRO, CHAVE_TAG_ENDERECO_A_CONFIRMAR } from './padroes.js'
export type { Db }

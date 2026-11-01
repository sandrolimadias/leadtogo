import type postgres from 'postgres'
import { expect } from 'vitest'

import { comTenant, type Sql } from './conexoes.js'

/**
 * Helper de isolamento multiempresa, em duas camadas:
 *  1. catálogo: toda tabela com `tenant_id` (descoberta no catálogo do Postgres) tem RLS
 *     habilitado e forçado e políticas de SELECT, INSERT, UPDATE e DELETE;
 *  2. comportamento: com fábricas explícitas por tabela, o tenant A não lê nem grava dados
 *     do tenant B. Tabela com `tenant_id` sem fábrica faz o teste falhar.
 */

type Tx = postgres.TransactionSql

export interface Fabrica<Pais = unknown> {
  /** Coluna do tenant (padrão `tenant_id`; `tenants` isola por `id`) */
  colunaTenant?: string
  /** Chave primária (padrão `id`) */
  chave?: string
  /** Coluna qualquer que o UPDATE reescreve com o próprio valor (prova o UPDATE sem depender de tipo) */
  colunaAlteravel: string
  /** O app só tem INSERT e SELECT na tabela (ex.: auditoria): UPDATE e DELETE dele devem ser negados */
  appSemAlterar?: boolean
  /** Cria o que a linha exige (pais das FKs) para o tenant; roda como owner, uma vez por tenant */
  preparar?: (owner: Sql, tenantId: string) => Promise<Pais>
  /** Insere UMA linha válida do tenant e devolve o valor da chave. Não deve inserir mais nada */
  criar: (tx: Tx, tenantId: string, pais: Pais) => Promise<string>
}

/** Fábrica já sem o tipo dos pais (como fica no registro). Use `definirFabrica` para criar. */
export type FabricaRegistrada = Fabrica<unknown>

/** Registra uma fábrica tipada pelos pais que ela mesma prepara. */
export function definirFabrica<Pais = undefined>(fabrica: Fabrica<Pais>): FabricaRegistrada {
  return fabrica as unknown as FabricaRegistrada
}

export interface Contexto {
  app: Sql
  owner: Sql
  tenantA: string
  tenantB: string
  /** Prepara os dois tenants antes das fábricas (ex.: cria conta e linhas em `tenants`) */
  prepararTenants?: (owner: Sql, ids: string[]) => Promise<void>
}

/** Tabelas que, por desenho, não têm `tenant_id` (outras tabelas sem ele fazem o teste falhar) */
export const SEM_TENANT_ID = {
  /** Globais (docs/modelagem_banco.md seção 4): leitura para o app, escrita só do owner/worker */
  globais: [
    'cnaes',
    'municipios',
    'municipio_contornos',
    'microrregioes',
    'estados',
    'paises',
    'portes',
    'qualificacoes_socio',
    'receita_consultas',
  ],
  /** Conta dona: sem RLS por tenant; o acesso é controlado pela API (seção 3.0.2) */
  porConta: ['contas', 'conta_administradores'],
  /** Isolada pela coluna `id` (testada à parte, com `colunaTenant: 'id'`) */
  porId: ['tenants'],
}

export async function tabelasComTenantId(sql: Sql): Promise<string[]> {
  const linhas = await sql<{ tabela: string }[]>`
    SELECT c.relname AS tabela
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped AND a.attnum > 0
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
    ORDER BY c.relname`
  return linhas.map((l) => l.tabela)
}

export async function tabelasDoSchema(sql: Sql): Promise<string[]> {
  const linhas = await sql<{ tabela: string }[]>`
    SELECT c.relname AS tabela
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
    ORDER BY c.relname`
  return linhas.map((l) => l.tabela)
}

/** Camada 1: problemas de RLS no catálogo (lista vazia = tudo certo). */
export async function problemasDeCatalogo(sql: Sql, tabelas?: string[]): Promise<string[]> {
  const alvo = tabelas ?? (await tabelasComTenantId(sql))
  const problemas: string[] = []
  for (const tabela of alvo) {
    const [rel] = await sql<{ habilitado: boolean; forcado: boolean }[]>`
      SELECT c.relrowsecurity AS habilitado, c.relforcerowsecurity AS forcado
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ${tabela}`
    if (!rel?.habilitado) problemas.push(`${tabela}: RLS não habilitado`)
    if (!rel?.forcado) problemas.push(`${tabela}: RLS não forçado (o dono ignoraria as políticas)`)
    // só as permissivas dão acesso; as restritivas (portal) apenas estreitam e não cobrem comando nenhum
    const politicas = await sql<{ cmd: string }[]>`
      SELECT p.polcmd AS cmd FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ${tabela}
        AND p.polpermissive`
    const comandos = new Set(politicas.map((p) => p.cmd))
    const todos = comandos.has('*')
    for (const [cmd, nome] of [
      ['r', 'SELECT'],
      ['a', 'INSERT'],
      ['w', 'UPDATE'],
      ['d', 'DELETE'],
    ] as const) {
      if (!todos && !comandos.has(cmd)) problemas.push(`${tabela}: sem política de ${nome}`)
    }
  }
  return problemas
}

/** Tabelas sem `tenant_id` que não estão na lista de exceções (uma tabela nova esquecida cai aqui). */
export async function tabelasSemTenantIdNaoPrevistas(sql: Sql): Promise<string[]> {
  const previstas = new Set(Object.values(SEM_TENANT_ID).flat())
  const comTenant = new Set(await tabelasComTenantId(sql))
  return (await tabelasDoSchema(sql)).filter((t) => !comTenant.has(t) && !previstas.has(t))
}

/** Tabelas com `tenant_id` sem fábrica registrada. */
export function tabelasSemFabrica(
  tabelas: string[],
  fabricas: Record<string, FabricaRegistrada>,
): string[] {
  return tabelas.filter((t) => !(t in fabricas))
}

function ident(tx: Tx, nome: string) {
  return tx(nome)
}

async function contar(
  tx: Tx,
  tabela: string,
  colTenant: string,
  tenantId: string,
): Promise<number> {
  const [r] = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${ident(tx, tabela)} WHERE ${ident(tx, colTenant)} = ${tenantId}`
  return r?.n ?? 0
}

/** Camada 2: o tenant A não lê nem grava dados do B, com o app e com o owner. */
export async function testarComportamento(
  ctx: Contexto,
  tabela: string,
  fabrica: FabricaRegistrada,
): Promise<void> {
  const f = fabrica
  const colTenant = f.colunaTenant ?? 'tenant_id'
  const chave = f.chave ?? 'id'
  const { app, owner, tenantA: A, tenantB: B } = ctx

  // Dados de A e de B, criados como owner (sujeito ao FORCE: precisa do tenant de cada linha)
  const pais: Record<string, unknown> = {}
  for (const t of [A, B]) pais[t] = await f.preparar?.(owner, t)
  const idA = await comTenant(owner, A, (tx) => f.criar(tx, A, pais[A]))
  const idB = await comTenant(owner, B, (tx) => f.criar(tx, B, pais[B]))

  const porChave = (tx: Tx, valor: string) => tx`${ident(tx, chave)} = ${valor}`
  const ler = (tx: Tx, valor: string) =>
    tx`SELECT 1 FROM ${ident(tx, tabela)} WHERE ${porChave(tx, valor)}`
  const atualizar = (tx: Tx, valor: string) =>
    tx`UPDATE ${ident(tx, tabela)} SET ${ident(tx, f.colunaAlteravel)} = ${ident(tx, f.colunaAlteravel)}
       WHERE ${porChave(tx, valor)}`
  const apagar = (tx: Tx, valor: string) =>
    tx`DELETE FROM ${ident(tx, tabela)} WHERE ${porChave(tx, valor)}`
  const rejeitado = /row-level security|violates row-level/i

  for (const [papel, sql] of [
    ['leadtogo_app', app],
    ['leadtogo_owner', owner],
  ] as const) {
    const rotulo = `${tabela} (${papel})`
    const podeAlterar = !(f.appSemAlterar && papel === 'leadtogo_app')

    // Tenant A ativo: vê só o que é de A
    await comTenant(sql, A, async (tx) => {
      expect(await ler(tx, idA), `${rotulo}: A deve ler a própria linha`).toHaveLength(1)
      expect(await ler(tx, idB), `${rotulo}: A não pode ler a linha de B`).toHaveLength(0)
      expect(
        await contar(tx, tabela, colTenant, B),
        `${rotulo}: A não pode contar linhas de B`,
      ).toBe(0)
      if (podeAlterar) {
        expect((await atualizar(tx, idB)).count, `${rotulo}: A não pode alterar B`).toBe(0)
        expect((await apagar(tx, idB)).count, `${rotulo}: A não pode apagar B`).toBe(0)
        expect((await atualizar(tx, idA)).count, `${rotulo}: A deve alterar a própria linha`).toBe(
          1,
        )
      }
    })
    if (!podeAlterar) {
      // Sem privilégio, o app não altera nem apaga nem as próprias linhas
      await expect(
        comTenant(sql, A, (tx) => atualizar(tx, idA)),
        `${rotulo}: UPDATE negado`,
      ).rejects.toThrow(/permission denied/)
      await expect(
        comTenant(sql, A, (tx) => apagar(tx, idA)),
        `${rotulo}: DELETE negado`,
      ).rejects.toThrow(/permission denied/)
    }

    // Gravar em B com A ativo é rejeitado pela política (WITH CHECK)
    await expect(
      comTenant(sql, A, (tx) => f.criar(tx, B, pais[B])),
      `${rotulo}: A não pode inserir em B`,
    ).rejects.toThrow(rejeitado)

    // Mover a própria linha para B também é rejeitado
    if (podeAlterar)
      await expect(
        comTenant(
          sql,
          A,
          (tx) =>
            tx`UPDATE ${ident(tx, tabela)} SET ${ident(tx, colTenant)} = ${B} WHERE ${porChave(tx, idA)}`,
        ),
        `${rotulo}: A não pode passar a linha para B`,
      ).rejects.toThrow(rejeitado)

    // Sem tenant ativo: nada é lido nem gravado
    await comTenant(sql, null, async (tx) => {
      expect(await ler(tx, idA), `${rotulo}: sem tenant não lê`).toHaveLength(0)
      if (podeAlterar) {
        expect((await atualizar(tx, idA)).count).toBe(0)
        expect((await apagar(tx, idA)).count).toBe(0)
      }
    })
    await expect(
      comTenant(sql, null, (tx) => f.criar(tx, A, pais[A])),
      `${rotulo}: sem tenant não grava`,
    ).rejects.toThrow(rejeitado)

    // Consolidado: lê A e B, mas só grava na empresa ativa
    await comTenant(
      sql,
      A,
      async (tx) => {
        expect(await ler(tx, idA)).toHaveLength(1)
        expect(await ler(tx, idB), `${rotulo}: consolidado deve ler B`).toHaveLength(1)
        if (podeAlterar) {
          expect((await atualizar(tx, idB)).count, `${rotulo}: consolidado não altera B`).toBe(0)
          expect((await apagar(tx, idB)).count, `${rotulo}: consolidado não apaga B`).toBe(0)
        }
      },
      [A, B],
    )
    await expect(
      comTenant(sql, A, (tx) => f.criar(tx, B, pais[B]), [A, B]),
      `${rotulo}: com A ativo e consolidado A+B, não grava em B`,
    ).rejects.toThrow(rejeitado)

    // Só a lista do consolidado, sem empresa ativa: lê, mas não grava em nenhuma
    await comTenant(
      sql,
      null,
      async (tx) => {
        expect(await ler(tx, idA)).toHaveLength(1)
        if (podeAlterar) expect((await atualizar(tx, idA)).count).toBe(0)
      },
      [A, B],
    )
    await expect(comTenant(sql, null, (tx) => f.criar(tx, A, pais[A]), [A, B])).rejects.toThrow(
      rejeitado,
    )
  }

  // Nada do que foi tentado alterou B
  await comTenant(owner, B, async (tx) => {
    expect(await ler(tx, idB), `${tabela}: a linha de B deve continuar existindo`).toHaveLength(1)
  })
}

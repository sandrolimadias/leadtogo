import { sql } from 'drizzle-orm'

import { contas, membros, tenantConfiguracoes, tenants } from '../schema/index.js'
import { type Db, upsert } from './upsert.js'

/**
 * Identificadores fixos (UUID v7 válidos) para o upsert achar a mesma linha a cada execução
 * e para o E8 ligar o usuário de demonstração ao membro admin.
 */
export const DEMONSTRACAO = {
  contaId: '0199a000-0000-7000-8000-000000000001',
  tenantId: '0199a000-0000-7000-8000-000000000002',
  membroAdminId: '0199a000-0000-7000-8000-000000000003',
  emailAdmin: 'admin@demonstracao.leadtogo.local',
} as const

/** A demonstração é só de desenvolvimento: nunca roda com NODE_ENV=production. */
export function deveSemearDemonstracao(env: NodeJS.ProcessEnv): boolean {
  return env['NODE_ENV'] !== 'production'
}

/**
 * Tenant de demonstração: só a conta, o tenant, as configurações e um membro admin.
 * Os cadastros padrão (grupos de tags Status e Visitação, tipos de atividade, funil com fases)
 * entram quando essas tabelas forem criadas. Roda com o leadtogo_owner e é idempotente.
 */
export async function semearDemonstracao(db: Db): Promise<Record<string, number>> {
  const { contaId, tenantId, membroAdminId, emailAdmin } = DEMONSTRACAO

  await upsert(
    db,
    contas,
    [{ id: contaId, nome: 'Grupo Demonstração', situacao: 'ativa', plano: 'demonstracao' }],
    contas.id,
    ['nome', 'situacao', 'plano'],
  )

  // tenants, configurações e membros têm RLS forçado, inclusive para o dono: precisa do tenant ativo
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
    await upsert(
      tx as unknown as Db,
      tenants,
      [
        {
          id: tenantId,
          contaId,
          razaoSocial: 'Empresa Demonstração Ltda',
          nomeFantasia: 'Demonstração',
          email: 'contato@demonstracao.leadtogo.local',
          municipioCodigo: 3205309, // Vitória (ES)
          situacao: 'ativo',
        },
      ],
      tenants.id,
      ['contaId', 'razaoSocial', 'nomeFantasia', 'email', 'municipioCodigo', 'situacao'],
    )
    await upsert(
      tx as unknown as Db,
      tenantConfiguracoes,
      [{ tenantId }],
      tenantConfiguracoes.tenantId,
      [],
    )
    await upsert(
      tx as unknown as Db,
      membros,
      [
        {
          id: membroAdminId,
          tenantId,
          nome: 'Administrador Demonstração',
          email: emailAdmin,
          papel: 'admin',
          cargo: 'Administrador',
        },
      ],
      membros.id,
      ['nome', 'email', 'papel', 'cargo'],
    )
  })

  return { contas: 1, tenants: 1, tenant_configuracoes: 1, membros: 1 }
}

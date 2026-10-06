import { aplicarMigracoes } from '@leadtogo/db'

/**
 * Aplica as migrações pendentes com o usuário dono das tabelas (`DATABASE_MIGRATION_URL`).
 * Usa o migrador do drizzle-orm (o drizzle-kit não vai para a imagem). É o comando de pré-deploy:
 * `node dist/migrate.js`. Seguro de repetir; dois deploys ao mesmo tempo esperam um ao outro.
 */
export async function migrar(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const url = env['DATABASE_MIGRATION_URL']
  if (!url) throw new Error('DATABASE_MIGRATION_URL não definida (usuário dono das tabelas)')
  try {
    if (!['postgres:', 'postgresql:'].includes(new URL(url).protocol)) throw new Error()
  } catch {
    throw new Error('DATABASE_MIGRATION_URL deve ser uma URL postgres://')
  }
  await aplicarMigracoes(url)
}

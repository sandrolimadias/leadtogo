import { defineConfig } from 'drizzle-kit'

import { carregarEnv } from './src/env.js'

carregarEnv()

// Migrações rodam com o usuário dono das tabelas (DATABASE_MIGRATION_URL), nunca com o da aplicação.
// O `generate` só compara o schema com as migrações e não precisa de banco.
const url = process.env['DATABASE_MIGRATION_URL'] ?? ''
if (!url && !process.argv.includes('generate')) {
  throw new Error('DATABASE_MIGRATION_URL não definida (veja o .env.example)')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url },
  casing: 'snake_case',
  strict: true,
  verbose: true,
})

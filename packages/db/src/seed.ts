import { criarConexao } from './index.js'
import { carregarEnv } from './env.js'
import { semearReferencias } from './seeds/index.js'

// `pnpm db:seed`: referências (estados, países, portes, qualificações...), a partir de
// seeds/dados/. Roda com o leadtogo_owner (DATABASE_MIGRATION_URL) e pode ser repetido.
carregarEnv()

const url = process.env['DATABASE_MIGRATION_URL']
if (!url) throw new Error('DATABASE_MIGRATION_URL não definida (veja o .env.example)')

const { db, cliente } = criarConexao(url, { max: 1 })
try {
  console.log('Referências:', await semearReferencias(db))
} finally {
  await cliente.end()
}

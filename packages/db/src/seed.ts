import { carregarEnv } from './env.js'
import { criarConexao } from './index.js'
import { deveSemearDemonstracao, semearDemonstracao, semearReferencias } from './seeds/index.js'

// `pnpm db:seed`: referências (estados, municípios, países, portes, qualificações e CNAEs) e,
// fora de produção, o tenant de demonstração. Roda com o leadtogo_owner (DATABASE_MIGRATION_URL)
// e pode ser repetido. `--so-referencias` pula a demonstração.
carregarEnv()

const url = process.env['DATABASE_MIGRATION_URL']
if (!url) throw new Error('DATABASE_MIGRATION_URL não definida (veja o .env.example)')

const { db, cliente } = criarConexao(url, { max: 1 })
try {
  console.log('Referências:', await semearReferencias(db))
  if (!process.argv.includes('--so-referencias') && deveSemearDemonstracao(process.env)) {
    console.log('Demonstração:', await semearDemonstracao(db))
  }
} finally {
  await cliente.end()
}

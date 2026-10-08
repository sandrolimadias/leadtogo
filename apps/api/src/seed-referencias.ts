import { semearReferenciasPorUrl } from '@leadtogo/db'

// `node dist/seed-referencias.js`: semeia só as referências globais (estados, municípios, países, portes,
// qualificações e CNAEs), nunca a demonstração. Usa a DATABASE_MIGRATION_URL (dono das tabelas). Repetível.
try {
  const url = process.env['DATABASE_MIGRATION_URL']
  if (!url) throw new Error('DATABASE_MIGRATION_URL não definida (usuário dono das tabelas)')
  console.log('Referências:', await semearReferenciasPorUrl(url))
} catch (erro) {
  // Mensagem curta, sem a URL (pode conter a senha)
  console.error(
    `Falha ao semear as referências: ${erro instanceof Error ? erro.message : String(erro)}`,
  )
  process.exit(1)
}

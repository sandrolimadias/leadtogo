import { migrar } from './migracao/migrar.js'

// Entrypoint de migração (`node dist/migrate.js`): roda no comando de partida da API (antes do `main.js`), ver docs/runbook_e13.md.
try {
  console.log('Aplicando migrações...')
  await migrar()
  console.log('Migrações aplicadas.')
} catch (erro) {
  // Mensagem curta, sem a URL (pode conter a senha). Código de saída 1 interrompe o deploy.
  console.error(`Falha na migração: ${erro instanceof Error ? erro.message : String(erro)}`)
  process.exit(1)
}

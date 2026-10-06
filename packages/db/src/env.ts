import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Carrega o `.env` da raiz do repositório (desenvolvimento). Em produção as variáveis vêm do Coolify. */
export function carregarEnv(): void {
  const arquivo = fileURLToPath(new URL('../../../.env', import.meta.url))
  if (existsSync(arquivo)) process.loadEnvFile(arquivo)
}

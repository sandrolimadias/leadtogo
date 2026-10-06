import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** Lê um arquivo versionado de seeds/dados/ (nunca se baixa nada na hora do seed). */
export async function lerDados<T>(nome: string): Promise<T[]> {
  const arquivo = fileURLToPath(new URL(`../../seeds/dados/${nome}.json`, import.meta.url))
  const dados: unknown = JSON.parse(await readFile(arquivo, 'utf8'))
  if (!Array.isArray(dados) || dados.length === 0) {
    throw new Error(`seeds/dados/${nome}.json deve ser uma lista não vazia`)
  }
  return dados as T[]
}

import { v7 } from 'uuid'

/** Novo identificador (UUID v7): ordenável no tempo, gerado na aplicação (docs/modelagem_banco.md, seção 1). */
export function novoId(): string {
  return v7()
}

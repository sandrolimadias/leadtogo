import { createHash } from 'node:crypto'

/** O que o banco guarda do token do convite: o hash. O token em si só existe no e-mail. */
export const hashDoToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

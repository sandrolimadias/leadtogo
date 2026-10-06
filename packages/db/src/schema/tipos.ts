import { customType, timestamp, uuid } from 'drizzle-orm/pg-core'

import { novoId } from '../id.js'

/** E-mail sem diferença de caixa (extensão citext). */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext'
  },
})

/** Chave primária padrão: UUID v7 gerado na aplicação. */
export const chaveUuid = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => novoId())

/** `criado_em` e `atualizado_em` (timestamptz). */
export const carimbos = () => ({
  criadoEm: timestamp({ withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

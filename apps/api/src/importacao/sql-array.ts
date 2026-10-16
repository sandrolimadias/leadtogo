import { sql, type SQL } from '@leadtogo/db'

/** Uma lista como `ARRAY[...]::tipo[]` (o driver não serializa array JS direto num parâmetro). Vazia também vale. */
export function arraySql(valores: readonly string[], tipo: 'text' | 'uuid' | 'citext'): SQL {
  if (valores.length === 0) return sql.raw(`ARRAY[]::${tipo}[]`)
  return sql`ARRAY[${sql.join(
    valores.map((v) => sql`${v}`),
    sql`, `,
  )}]::${sql.raw(tipo)}[]`
}

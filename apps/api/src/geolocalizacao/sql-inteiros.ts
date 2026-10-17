import { sql, type SQL } from '@leadtogo/db'

/** Uma lista de inteiros como `ARRAY[...]::int[]` (o driver não serializa array JS direto num parâmetro). */
export function inteirosSql(valores: readonly number[]): SQL {
  if (valores.length === 0) return sql.raw('ARRAY[]::int[]')
  return sql`ARRAY[${sql.join(
    valores.map((v) => sql`${v}`),
    sql`, `,
  )}]::int[]`
}

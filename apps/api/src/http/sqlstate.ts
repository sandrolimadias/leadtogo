/** Código SQLSTATE de um erro do Postgres, direto ou embrulhado (`cause`) pelo Drizzle ou pelo Better Auth. */
export function sqlstateDe(erro: unknown): string | undefined {
  const e = erro as { code?: unknown; cause?: unknown } | null
  if (!e || typeof e !== 'object') return undefined
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e.code
  return e.cause ? sqlstateDe(e.cause) : undefined
}

/** Violação de unicidade (23505). */
export const ehViolacaoDeUnicidade = (erro: unknown): boolean => sqlstateDe(erro) === '23505'

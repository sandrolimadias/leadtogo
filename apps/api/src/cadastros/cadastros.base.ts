import type { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'

/** Escrever nos cadastros auxiliares é do administrador da empresa ativa; ler é de qualquer membro. */
export function exigirAdmin(ctx: ContextoTenantService): void {
  if (ctx.membro.papel !== 'admin') {
    throw new ErroApi(
      'acesso_negado',
      'Só administradores da empresa podem alterar os cadastros.',
      403,
    )
  }
}

/**
 * Confere que a nova ordem traz exatamente os itens do escopo (nem a mais, nem a menos, sem repetir):
 * é o que impede perder ou "ressuscitar" itens ao reordenar.
 */
export function conferirNovaOrdem(atuais: string[], pedidos: string[]): void {
  const esperado = new Set(atuais)
  const valido =
    pedidos.length === esperado.size &&
    new Set(pedidos).size === pedidos.length &&
    pedidos.every((id) => esperado.has(id))
  if (!valido) {
    throw new ErroApi(
      'ordem_invalida',
      'A nova ordem precisa trazer todos os itens da lista, uma vez cada.',
      400,
    )
  }
}

/**
 * O que realmente muda (antes → depois), para a auditoria. Textos comparados já aparados; listas
 * (ex.: os status de um motivo) comparadas pelo conteúdo, na ordem.
 */
export function diferencas(
  atual: object,
  dados: object,
): Record<string, { de: unknown; para: unknown }> {
  const antes = atual as Record<string, unknown>
  const saida: Record<string, { de: unknown; para: unknown }> = {}
  for (const [campo, valor] of Object.entries(dados as Record<string, unknown>)) {
    if (valor === undefined) continue
    const novo = typeof valor === 'string' ? valor.trim() : valor
    if (JSON.stringify(antes[campo]) !== JSON.stringify(novo)) {
      saida[campo] = { de: antes[campo], para: novo }
    }
  }
  return saida
}

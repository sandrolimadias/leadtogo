import { sql } from '@leadtogo/db'

import type { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { perfilEfetivo } from '../acesso/permissoes-do-membro.js'
import { ErroApi } from '../http/erro-api.js'

/**
 * Regras comuns a quem mexe em perfis e na equipe (perfis de acesso, troca de perfil, desativar):
 *  - `travar`: serializa, por empresa, essas mudanças (trava transacional) e confere de novo, já com
 *    a trava, que quem age ainda tem a permissão (outro administrador pode tê-la tirado no meio);
 *  - `exigirQuemGerePerfis`: depois da mudança, na mesma transação, a empresa precisa continuar com ao
 *    menos uma pessoa ativa, com login, cujo perfil efetivo tenha `perfis.gerir` (senão, 409 e desfaz).
 */
export async function travar(ctx: ContextoTenantService, permissao: string): Promise<void> {
  const db = ctx.db()
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`perfis:${ctx.tenantId}`}))`)
  const [ainda] = await db.execute<{ ok: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM membros m
      JOIN perfis_acesso p ON ${perfilEfetivo(sql`m`, sql`p`)}
      JOIN perfil_permissoes pp ON pp.perfil_id = p.id AND pp.permissao = ${permissao}
      WHERE m.id = ${ctx.membro.id} AND m.ativo AND m.excluido_em IS NULL) AS ok`)
  if (!ainda?.ok) {
    throw new ErroApi('acesso_negado', 'Seu perfil de acesso não permite esta ação.', 403)
  }
}

export async function exigirQuemGerePerfis(ctx: ContextoTenantService): Promise<void> {
  const [linha] = await ctx.db().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM membros m
    JOIN perfis_acesso p ON ${perfilEfetivo(sql`m`, sql`p`)}
    JOIN perfil_permissoes pp ON pp.perfil_id = p.id AND pp.permissao = 'perfis.gerir'
    WHERE m.excluido_em IS NULL AND m.ativo AND m.usuario_id IS NOT NULL`)
  if ((linha?.n ?? 0) === 0) {
    throw new ErroApi(
      'sem_administrador',
      'A empresa precisa de ao menos uma pessoa ativa que possa gerir os perfis de acesso.',
      409,
    )
  }
}

/** O usuário é o dono da conta a que a empresa ativa pertence. */
export async function ehDonoDaConta(
  ctx: ContextoTenantService,
  usuarioId: string,
): Promise<boolean> {
  const linhas = await ctx.db().execute(sql`
    SELECT 1 FROM conta_administradores ca
    JOIN tenants t ON t.conta_id = ca.conta_id
    WHERE t.id = ${ctx.tenantId} AND ca.usuario_id = ${usuarioId} AND ca.papel = 'dono'
    LIMIT 1`)
  return linhas.length > 0
}

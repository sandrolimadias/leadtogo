import { novoId, sql } from '@leadtogo/db'
import type { AlterarTriagemEntrada, ConfiguracaoDeTriagem } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

/**
 * Triagem (Fase 2): começa DESLIGADA. Ligada, os chamados sem área conhecida (e os de áreas que não pulam a
 * triagem) esperam em "Aguardando triagem" e só quem tria os vê. Quem tria são as pessoas designadas e/ou
 * os membros do perfil de triagem, desde que o perfil tenha `chamados.triar`.
 */
@Injectable()
export class TriagemService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async configuracao(): Promise<ConfiguracaoDeTriagem> {
    const db = this.ctx.db()
    const [c] = await db.execute<{
      ativa: boolean
      perfil_id: string | null
      perfil_nome: string | null
    }>(sql`
      SELECT t.ativa, t.perfil_id, p.nome AS perfil_nome
      FROM config_triagem t LEFT JOIN perfis_acesso p ON p.id = t.perfil_id
      WHERE t.tenant_id = ${this.ctx.tenantId}`)
    const membros = await db.execute<{ membro_id: string; nome: string }>(sql`
      SELECT tm.membro_id, m.nome FROM triagem_membros tm JOIN membros m ON m.id = tm.membro_id
      WHERE m.excluido_em IS NULL ORDER BY lower(m.nome)`)
    return {
      ativa: c?.ativa ?? false,
      perfilId: c?.perfil_id ?? null,
      perfilNome: c?.perfil_nome ?? null,
      membros: membros.map((m) => ({ membroId: m.membro_id, nome: m.nome })),
    }
  }

  /** A triagem está ligada? */
  async ativa(): Promise<boolean> {
    const [c] = await this.ctx.db().execute<{ ativa: boolean }>(sql`
      SELECT ativa FROM config_triagem WHERE tenant_id = ${this.ctx.tenantId}`)
    return c?.ativa ?? false
  }

  /**
   * A pessoa da requisição tria? Precisa de `chamados.triar` e, com a triagem ligada, de estar designada
   * (pessoa ou perfil de triagem). Desligada, quem tem `chamados.triar` ainda esvazia a fila que sobrou
   * (e a dos chamados abertos sem área).
   */
  async euTrio(): Promise<boolean> {
    if (!new PermissaoService(this.ctx).pode('chamados.triar')) return false
    return this.ctx.memoizar('chamados:triador', async () => {
      const [r] = await this.ctx.db().execute<{ triador: boolean }>(sql`
        SELECT (NOT t.ativa
          OR coalesce(t.perfil_id = ${this.ctx.membro.perfil?.id ?? null}::uuid, false)
          OR EXISTS (SELECT 1 FROM triagem_membros tm WHERE tm.membro_id = ${this.ctx.membro.id})) AS triador
        FROM config_triagem t WHERE t.tenant_id = ${this.ctx.tenantId}`)
      return r?.triador ?? true
    })
  }

  async alterar(dados: AlterarTriagemEntrada): Promise<ConfiguracaoDeTriagem> {
    new PermissaoService(this.ctx).exigir('chamados.gerir_areas')
    const db = this.ctx.db()
    const membroIds = [...new Set(dados.membroIds)]
    if (dados.ativa && membroIds.length === 0 && dados.perfilId === null) {
      throw new ErroApi(
        'triagem_sem_triador',
        'Para ligar a triagem, indique ao menos uma pessoa ou um perfil de triagem.',
        409,
      )
    }
    if (membroIds.length > 0) {
      const [{ n } = { n: 0 }] = await db.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM membros
        WHERE id = ANY (${`{${membroIds.join(',')}}`}::uuid[]) AND ativo AND excluido_em IS NULL`)
      if (n !== membroIds.length) {
        throw new ErroApi('membro_invalido', 'Há membros que não existem ou estão inativos.', 400)
      }
    }
    if (dados.perfilId !== null) {
      const [p] = await db.execute<{ id: string }>(sql`
        SELECT id FROM perfis_acesso WHERE id = ${dados.perfilId} AND ativo AND excluido_em IS NULL`)
      if (!p) throw new ErroApi('perfil_invalido', 'O perfil não existe ou está inativo.', 400)
    }
    const antes = await this.configuracao()
    await db.execute(sql`
      INSERT INTO config_triagem (tenant_id, ativa, perfil_id, atualizado_por)
      VALUES (${this.ctx.tenantId}, ${dados.ativa}, ${dados.perfilId}, ${this.ctx.membro.id})
      ON CONFLICT (tenant_id) DO UPDATE SET ativa = excluded.ativa, perfil_id = excluded.perfil_id,
        atualizado_em = now(), atualizado_por = excluded.atualizado_por`)
    await db.execute(sql`DELETE FROM triagem_membros WHERE tenant_id = ${this.ctx.tenantId}`)
    for (const membroId of membroIds) {
      await db.execute(sql`
        INSERT INTO triagem_membros (id, tenant_id, membro_id, criado_por)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${membroId}, ${this.ctx.membro.id})`)
    }
    await this.auditoria.registrar({
      entidade: 'chamado_triagem',
      acao: 'alterar',
      alteracoes: {
        ativa: { antes: antes.ativa, depois: dados.ativa },
        perfilId: { antes: antes.perfilId, depois: dados.perfilId },
        membroIds: { antes: antes.membros.map((m) => m.membroId), depois: membroIds },
      },
    })
    return this.configuracao()
  }
}

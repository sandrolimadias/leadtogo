import { type SQL, sql } from '@leadtogo/db'
import type { Alcance } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ErroApi } from '../http/erro-api.js'
import { ContextoTenantService } from './contexto-tenant.service.js'

/**
 * Decisões de acesso pelo perfil do membro da empresa ativa (docs/funcionalidades.md, "Perfis de
 * acesso"). O servidor sempre decide; o front só esconde.
 *  - `pode`/`exigir`: a permissão existe no perfil;
 *  - `alcance`: própria, equipe ou todas (só nas permissões que admitem alcance);
 *  - `alcanca`/`condicao`: se o responsável (o vendedor da empresa, o responsável da atividade) está
 *    dentro do alcance. "Equipe" = o próprio membro + subordinados diretos e indiretos pelo `gestor_id`,
 *    calculada uma vez por requisição, com proteção contra ciclo.
 */
@Injectable()
export class PermissaoService {
  constructor(private readonly ctx: ContextoTenantService) {}

  pode(chave: string): boolean {
    return this.ctx.membro.permissoes[chave] !== undefined
  }

  alcance(chave: string): Alcance | undefined {
    const v = this.ctx.membro.permissoes[chave]
    return v === undefined || v === true ? undefined : v
  }

  exigir(chave: string, mensagem = 'Seu perfil de acesso não permite esta ação.'): void {
    if (!this.pode(chave)) throw new ErroApi('acesso_negado', mensagem, 403)
  }

  /** Ids do próprio membro e de todos os subordinados (diretos e indiretos), sem travar em ciclo. */
  equipe(): Promise<string[]> {
    const membroId = this.ctx.membro.id
    return this.ctx.memoizar('permissao:equipe', async () => {
      const linhas = await this.ctx.db().execute<{ id: string }>(sql`
        WITH RECURSIVE equipe(id, caminho) AS (
          SELECT id, ARRAY[id] FROM membros WHERE id = ${membroId}
          UNION ALL
          SELECT m.id, e.caminho || m.id FROM membros m JOIN equipe e ON m.gestor_id = e.id
          WHERE m.excluido_em IS NULL AND NOT m.id = ANY (e.caminho)
        )
        SELECT DISTINCT id FROM equipe`)
      return linhas.map((l) => l.id)
    })
  }

  /** O responsável `responsavelId` está no alcance da permissão? Sem a permissão, false. */
  async alcanca(chave: string, responsavelId: string | null): Promise<boolean> {
    const alcance = this.alcance(chave)
    if (!alcance) return false
    if (alcance === 'todas') return true
    if (responsavelId === null) return false
    if (alcance === 'propria') return responsavelId === this.ctx.membro.id
    return (await this.equipe()).includes(responsavelId)
  }

  /**
   * Condição SQL sobre a coluna do responsável para as listagens: `undefined` = sem restrição (todas);
   * sem a permissão, uma condição que nada atende.
   */
  async condicao(chave: string, coluna: SQL): Promise<SQL | undefined> {
    const alcance = this.alcance(chave)
    if (!alcance) return sql`false`
    if (alcance === 'todas') return undefined
    if (alcance === 'propria') return sql`${coluna} = ${this.ctx.membro.id}`
    const ids = await this.equipe()
    return sql`${coluna} = ANY (${`{${ids.join(',')}}`}::uuid[])`
  }
}

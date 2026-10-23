import { type SQL, sql } from '@leadtogo/db'
import type { Alcance, StatusDoChamado } from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { TriagemService } from './triagem.service.js'

/** O que as regras de acesso precisam saber de um chamado. */
export interface ChamadoParaAcesso {
  id: string
  status: StatusDoChamado
  areaId: string | null
  responsavelId: string | null
  solicitanteMembroId: string | null
  resolvidoEm: Date | string | null
}

const lista = (ids: string[]) => `{${ids.join(',')}}`

/**
 * Quem vê e quem pode o quê num chamado (Fase 2):
 *  - **ver**: o alcance de `chamados.ver` vale sobre o responsável (e, na equipe, também sobre o solicitante);
 *    quem abriu sempre vê o seu; e todo chamado das áreas em que a pessoa atua (membro ou pelo perfil).
 *  - **fila de triagem**: "Aguardando triagem" só aparece para quem tria (e para o solicitante, que vê o seu).
 *  - **atender** (responder, anotar, assumir, mudar o estado): o alcance de `chamados.atender` sobre o responsável;
 *    em `propria`, também o chamado sem responsável de uma área em que a pessoa atua.
 *  - **atribuir** a outra pessoa: `chamados.atribuir` e ser o triador, o gestor da área ou ter `atender = todas`.
 */
@Injectable()
export class AcessoDeChamados {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly triagem: TriagemService,
  ) {}

  get permissao() {
    return new PermissaoService(this.ctx)
  }

  get euId(): string {
    return this.ctx.membro.id
  }

  /** Áreas em que a pessoa atua (como membro ou pelo perfil de acesso). */
  areasQueAtendo(): Promise<string[]> {
    return this.ctx.memoizar('chamados:areas-que-atendo', async () => {
      const linhas = await this.ctx.db().execute<{ area_id: string }>(sql`
        SELECT DISTINCT am.area_id FROM area_membros am
        JOIN areas_atendimento a ON a.id = am.area_id AND a.ativa AND a.excluido_em IS NULL
        WHERE am.membro_id = ${this.euId} OR am.perfil_id = ${this.ctx.membro.perfil?.id ?? null}::uuid`)
      return linhas.map((l) => l.area_id)
    })
  }

  /** Áreas que a pessoa gere (gestor da área). */
  areasQueGiro(): Promise<string[]> {
    return this.ctx.memoizar('chamados:areas-que-giro', async () => {
      const linhas = await this.ctx.db().execute<{ area_id: string }>(sql`
        SELECT area_id FROM area_membros WHERE membro_id = ${this.euId} AND gestor`)
      return linhas.map((l) => l.area_id)
    })
  }

  async euTrio(): Promise<boolean> {
    return this.triagem.euTrio()
  }

  /**
   * Condição SQL dos chamados que a pessoa vê (`c` é o apelido da tabela `chamados`). Sem `chamados.ver`,
   * nada.
   */
  async visiveis(): Promise<SQL> {
    const ver = this.permissao.alcance('chamados.ver')
    if (!ver) return sql`false`
    const eu = this.euId
    const triador = await this.euTrio()
    const areas = await this.areasQueAtendo()
    const partes: SQL[] = [sql`c.solicitante_membro_id = ${eu}`]
    if (ver === 'todas') partes.push(sql`true`)
    else {
      const ids = ver === 'propria' ? [eu] : await this.permissao.equipe()
      partes.push(sql`c.responsavel_id = ANY (${lista(ids)}::uuid[])`)
      if (ver === 'equipe') partes.push(sql`c.solicitante_membro_id = ANY (${lista(ids)}::uuid[])`)
    }
    if (areas.length > 0) partes.push(sql`c.area_id = ANY (${lista(areas)}::uuid[])`)
    const base = sql.join(partes, sql` OR `)
    const fila = triador ? sql`c.status = 'aguardando_triagem'` : sql`false`
    return sql`(c.excluido_em IS NULL AND (
      ((${base}) AND (c.status <> 'aguardando_triagem' OR c.solicitante_membro_id = ${eu}))
      OR ${fila}))`
  }

  /** Pode atender (responder, anotar, assumir, mudar o estado) este chamado? */
  async podeAtender(c: ChamadoParaAcesso): Promise<boolean> {
    const alcance = this.permissao.alcance('chamados.atender')
    if (!alcance || c.status === 'aguardando_triagem' || c.status === 'fechado') return false
    return this.noAlcance(alcance, c)
  }

  private async noAlcance(alcance: Alcance, c: ChamadoParaAcesso): Promise<boolean> {
    if (alcance === 'todas') return true
    if (c.responsavelId === this.euId) return true
    if (
      alcance === 'equipe' &&
      c.responsavelId &&
      (await this.permissao.equipe()).includes(c.responsavelId)
    ) {
      return true
    }
    // Sem responsável: quem atua na área pode pegar
    return (
      c.responsavelId === null &&
      c.areaId !== null &&
      (await this.areasQueAtendo()).includes(c.areaId)
    )
  }

  /** Atribuir a outra pessoa (ou tirar o responsável). */
  async podeAtribuir(c: ChamadoParaAcesso): Promise<boolean> {
    if (!this.permissao.pode('chamados.atribuir')) return false
    if (c.status === 'aguardando_triagem' || c.status === 'resolvido' || c.status === 'fechado')
      return false
    if (await this.euTrio()) return true
    if (c.areaId !== null && (await this.areasQueGiro()).includes(c.areaId)) return true
    return this.permissao.alcance('chamados.atender') === 'todas'
  }

  /** Passar o chamado para outra área (quem tria, o gestor da área ou quem atribui). */
  async podeMudarDeArea(c: ChamadoParaAcesso): Promise<boolean> {
    if (c.status === 'resolvido' || c.status === 'fechado') return false
    if (c.status === 'aguardando_triagem') return this.euTrio()
    return (await this.euTrio()) || (await this.podeAtribuir(c))
  }

  /** Reabrir: o solicitante ou quem atende (o prazo de 7 dias é conferido à parte). */
  async podeReabrir(c: ChamadoParaAcesso): Promise<boolean> {
    if (c.status !== 'resolvido') return false
    if (c.solicitanteMembroId === this.euId) return true
    const alcance = this.permissao.alcance('chamados.atender')
    return alcance !== undefined && (await this.noAlcance(alcance, c))
  }

  /** Assumir o chamado para si: só sem responsável, por quem atende (na área). */
  async podeAssumir(c: ChamadoParaAcesso): Promise<boolean> {
    if (c.responsavelId !== null) return false
    return this.podeAtender(c)
  }

  /** Responder na conversa: quem atende ou o solicitante do chamado (que responde às perguntas da equipe). */
  async podeResponder(c: ChamadoParaAcesso): Promise<boolean> {
    if (c.status === 'fechado' || c.status === 'resolvido') return false
    if (await this.podeAtender(c)) return true
    return c.solicitanteMembroId === this.euId && c.status !== 'aguardando_triagem'
  }

  /** Notas internas: só quem atende (qualquer chamado que veja, até depois de fechado). */
  podeAnotar(): boolean {
    return this.permissao.pode('chamados.atender')
  }

  /** O membro pode receber o chamado desta área? Ativo, com `chamados.atender` e da área (se ela tem membros). */
  async membroPodeReceber(membroId: string, areaId: string | null): Promise<boolean> {
    const [m] = await this.ctx.db().execute<{ ok: boolean }>(sql`
      SELECT (
        EXISTS (
          SELECT 1 FROM perfil_permissoes pp WHERE pp.perfil_id = m.perfil_id AND pp.permissao = 'chamados.atender')
        AND (
          ${areaId}::uuid IS NULL
          OR NOT EXISTS (SELECT 1 FROM area_membros am WHERE am.area_id = ${areaId}::uuid)
          OR EXISTS (SELECT 1 FROM area_membros am
            WHERE am.area_id = ${areaId}::uuid AND (am.membro_id = m.id OR am.perfil_id = m.perfil_id))
        )
      ) AS ok
      FROM membros m WHERE m.id = ${membroId} AND m.ativo AND m.excluido_em IS NULL`)
    return m?.ok ?? false
  }
}

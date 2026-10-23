import { novoId, sql } from '@leadtogo/db'
import type {
  AlterarAreaEntrada,
  AreaDeAtendimento,
  CriarAreaEntrada,
  DefinirMembrosDaAreaEntrada,
  MembroDaArea,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

type LinhaDaArea = {
  id: string
  nome: string
  descricao: string | null
  visivel_no_portal: boolean
  meta_resposta_min: number | null
  meta_resolucao_min: number | null
  pula_triagem: boolean
  ativa: boolean
  ordem: number
  chave_sistema: string | null
  abertos: number
}

type LinhaDoMembro = {
  id: string
  area_id: string
  membro_id: string | null
  membro_nome: string | null
  perfil_id: string | null
  perfil_nome: string | null
  gestor: boolean
}

const naoEncontrada = () => new ErroApi('area_nao_encontrada', 'Área não encontrada.', 404)
const nomeRepetido = () => new ErroApi('nome_duplicado', 'Já existe uma área com esse nome.', 409)
const ehNomeRepetido = (e: unknown) =>
  e instanceof Error && /areas_atendimento_nome_uq/.test(`${e.message} ${String(e.cause)}`)

/**
 * Áreas de atendimento (Fase 2): Jurídico, Financeiro... com metas, quem atende e quem gere. Quem tem
 * `chamados.gerir_areas` cria, altera e define os membros; os demais veem só as áreas ativas, sem a lista
 * de membros. Regra de exclusão dos cadastros (funcionalidades.md, seção 11): só se exclui a área que
 * nunca teve chamado; a que já foi usada só se inativa.
 */
@Injectable()
export class AreasService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private get permissao() {
    return new PermissaoService(this.ctx)
  }

  private get gere(): boolean {
    return this.permissao.pode('chamados.gerir_areas')
  }

  private async linhas(filtro: ReturnType<typeof sql>): Promise<AreaDeAtendimento[]> {
    const db = this.ctx.db()
    const areas = await db.execute<LinhaDaArea>(sql`
      SELECT a.id, a.nome, a.descricao, a.visivel_no_portal, a.meta_resposta_min, a.meta_resolucao_min,
        a.pula_triagem, a.ativa, a.ordem, a.chave_sistema,
        (SELECT count(*)::int FROM chamados c WHERE c.area_id = a.id AND c.excluido_em IS NULL
          AND c.status NOT IN ('resolvido', 'fechado')) AS abertos
      FROM areas_atendimento a
      WHERE a.excluido_em IS NULL AND ${filtro}
      ORDER BY a.ordem, lower(a.nome)`)
    const membros = this.gere
      ? await db.execute<LinhaDoMembro>(sql`
          SELECT am.id, am.area_id, am.membro_id, m.nome AS membro_nome, am.perfil_id, p.nome AS perfil_nome, am.gestor
          FROM area_membros am
          LEFT JOIN membros m ON m.id = am.membro_id
          LEFT JOIN perfis_acesso p ON p.id = am.perfil_id
          WHERE am.area_id = ANY (${`{${areas.map((a) => a.id).join(',')}}`}::uuid[])
          ORDER BY am.gestor DESC, lower(coalesce(m.nome, p.nome))`)
      : []
    return areas.map((a) => ({
      id: a.id,
      nome: a.nome,
      descricao: a.descricao,
      visivelNoPortal: a.visivel_no_portal,
      metaRespostaMin: a.meta_resposta_min,
      metaResolucaoMin: a.meta_resolucao_min,
      pulaTriagem: a.pula_triagem,
      ativa: a.ativa,
      ordem: a.ordem,
      chaveSistema: a.chave_sistema,
      chamadosAbertos: a.abertos,
      membros: membros
        .filter((m) => m.area_id === a.id)
        .map((m): MembroDaArea => ({
          id: m.id,
          membroId: m.membro_id,
          membroNome: m.membro_nome,
          perfilId: m.perfil_id,
          perfilNome: m.perfil_nome,
          gestor: m.gestor,
        })),
    }))
  }

  /** Quem gere vê todas (com `incluirInativas`); os demais só as ativas. */
  listar(incluirInativas: boolean): Promise<AreaDeAtendimento[]> {
    return this.linhas(this.gere && incluirInativas ? sql`true` : sql`a.ativa`)
  }

  async obter(id: string): Promise<AreaDeAtendimento> {
    const [area] = await this.linhas(sql`a.id = ${id}`)
    if (!area) throw naoEncontrada()
    return area
  }

  private exigirGerir() {
    this.permissao.exigir('chamados.gerir_areas')
  }

  async criar(dados: CriarAreaEntrada): Promise<AreaDeAtendimento> {
    this.exigirGerir()
    const [{ ordem } = { ordem: 0 }] = await this.ctx.db().execute<{ ordem: number }>(sql`
      SELECT coalesce(max(ordem), -1) + 1 AS ordem FROM areas_atendimento WHERE excluido_em IS NULL`)
    const id = novoId()
    try {
      await this.ctx.db().execute(sql`
        INSERT INTO areas_atendimento (id, tenant_id, nome, descricao, visivel_no_portal, meta_resposta_min,
          meta_resolucao_min, pula_triagem, ordem, criado_por, atualizado_por)
        VALUES (${id}, ${this.ctx.tenantId}, ${dados.nome}, ${dados.descricao ?? null}, ${dados.visivelNoPortal},
          ${dados.metaRespostaMin}, ${dados.metaResolucaoMin}, ${dados.pulaTriagem}, ${ordem},
          ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    } catch (e) {
      if (ehNomeRepetido(e)) throw nomeRepetido()
      throw e
    }
    await this.auditoria.registrar({
      entidade: 'chamado_area',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { nome: dados.nome },
    })
    return this.obter(id)
  }

  async alterar(id: string, dados: AlterarAreaEntrada): Promise<AreaDeAtendimento> {
    this.exigirGerir()
    const antes = await this.obter(id)
    const novo = {
      nome: dados.nome ?? antes.nome,
      descricao: dados.descricao === undefined ? antes.descricao : dados.descricao,
      visivelNoPortal: dados.visivelNoPortal ?? antes.visivelNoPortal,
      metaRespostaMin:
        dados.metaRespostaMin === undefined ? antes.metaRespostaMin : dados.metaRespostaMin,
      metaResolucaoMin:
        dados.metaResolucaoMin === undefined ? antes.metaResolucaoMin : dados.metaResolucaoMin,
      pulaTriagem: dados.pulaTriagem ?? antes.pulaTriagem,
      ativa: dados.ativa ?? antes.ativa,
    }
    try {
      await this.ctx.db().execute(sql`
        UPDATE areas_atendimento SET nome = ${novo.nome}, descricao = ${novo.descricao},
          visivel_no_portal = ${novo.visivelNoPortal}, meta_resposta_min = ${novo.metaRespostaMin},
          meta_resolucao_min = ${novo.metaResolucaoMin}, pula_triagem = ${novo.pulaTriagem},
          ativa = ${novo.ativa}, atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
        WHERE id = ${id}`)
    } catch (e) {
      if (ehNomeRepetido(e)) throw nomeRepetido()
      throw e
    }
    const mudou: Record<string, { antes: unknown; depois: unknown }> = {}
    for (const campo of Object.keys(novo) as (keyof typeof novo)[]) {
      if (antes[campo] !== novo[campo]) mudou[campo] = { antes: antes[campo], depois: novo[campo] }
    }
    if (Object.keys(mudou).length > 0) {
      await this.auditoria.registrar({
        entidade: 'chamado_area',
        entidadeId: id,
        acao: 'alterar',
        alteracoes: mudou,
      })
    }
    return this.obter(id)
  }

  /** Troca a lista de quem atende a área (membros, com o gestor marcado, e perfis). */
  async definirMembros(id: string, dados: DefinirMembrosDaAreaEntrada): Promise<AreaDeAtendimento> {
    this.exigirGerir()
    await this.obter(id)
    const db = this.ctx.db()
    const membroIds = dados.membros.map((m) => m.membroId)
    if (membroIds.length > 0) {
      const [{ n } = { n: 0 }] = await db.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM membros
        WHERE id = ANY (${`{${membroIds.join(',')}}`}::uuid[]) AND ativo AND excluido_em IS NULL`)
      if (n !== membroIds.length) {
        throw new ErroApi('membro_invalido', 'Há membros que não existem ou estão inativos.', 400)
      }
    }
    if (dados.perfilIds.length > 0) {
      const [{ n } = { n: 0 }] = await db.execute<{ n: number }>(sql`
        SELECT count(*)::int AS n FROM perfis_acesso
        WHERE id = ANY (${`{${dados.perfilIds.join(',')}}`}::uuid[]) AND ativo AND excluido_em IS NULL`)
      if (n !== new Set(dados.perfilIds).size) {
        throw new ErroApi('perfil_invalido', 'Há perfis que não existem ou estão inativos.', 400)
      }
    }
    await db.execute(sql`DELETE FROM area_membros WHERE area_id = ${id}`)
    for (const m of dados.membros) {
      await db.execute(sql`
        INSERT INTO area_membros (id, tenant_id, area_id, membro_id, gestor, criado_por)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${id}, ${m.membroId}, ${m.gestor}, ${this.ctx.membro.id})`)
    }
    for (const perfilId of new Set(dados.perfilIds)) {
      await db.execute(sql`
        INSERT INTO area_membros (id, tenant_id, area_id, perfil_id, criado_por)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${id}, ${perfilId}, ${this.ctx.membro.id})`)
    }
    await this.auditoria.registrar({
      entidade: 'chamado_area',
      entidadeId: id,
      acao: 'definir_membros',
      alteracoes: {
        membros: dados.membros.map((m) => ({ membroId: m.membroId, gestor: m.gestor })),
        perfis: [...new Set(dados.perfilIds)],
      },
    })
    return this.obter(id)
  }

  async excluir(id: string): Promise<void> {
    this.exigirGerir()
    const area = await this.obter(id)
    const [uso] = await this.ctx.db().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM chamados WHERE area_id = ${id}`)
    if ((uso?.n ?? 0) > 0) {
      throw new ErroApi(
        'area_em_uso',
        'Esta área já teve chamados: inative-a em vez de excluir.',
        409,
      )
    }
    await this.ctx.db().execute(sql`DELETE FROM area_membros WHERE area_id = ${id}`)
    await this.ctx.db().execute(sql`
      UPDATE areas_atendimento SET excluido_em = now(), ativa = false, atualizado_em = now(),
        atualizado_por = ${this.ctx.membro.id} WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'chamado_area',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { nome: area.nome },
    })
  }
}

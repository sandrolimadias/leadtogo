import { and, asc, eq, isNull, schema, sql } from '@leadtogo/db'
import {
  type AlterarTagEntrada,
  type AlterarTagGrupoEntrada,
  CHAVES_DE_TAG_COM_REGRA,
  type CriarTagEntrada,
  type CriarTagGrupoEntrada,
  type Tag,
  type TagGrupo,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ehViolacaoDeUnicidade } from '../http/sqlstate.js'
import { ErroApi } from '../http/erro-api.js'
import { conferirNovaOrdem, diferencas, exigirAdmin } from './cadastros.base.js'

const { tagGrupos, tags } = schema

type LinhaGrupo = typeof tagGrupos.$inferSelect
type LinhaTag = typeof tags.$inferSelect

/** Tag de que as regras do sistema dependem (ver `CHAVES_DE_TAG_COM_REGRA`). */
const comRegra = (t: LinhaTag): boolean =>
  t.chaveSistema !== null && (CHAVES_DE_TAG_COM_REGRA as readonly string[]).includes(t.chaveSistema)

const paraTag = (t: LinhaTag): Tag => ({
  id: t.id,
  tagGrupoId: t.tagGrupoId,
  nome: t.nome,
  cor: t.cor,
  ativo: t.ativo,
  ordem: t.ordem,
  chaveSistema: t.chaveSistema,
  apareceNoMapa: t.apareceNoMapa,
  visivelAoAbrir: t.visivelAoAbrir,
})
const paraGrupo = (g: LinhaGrupo, itens: LinhaTag[]): TagGrupo => ({
  id: g.id,
  nome: g.nome,
  selecao: g.selecao,
  obrigatorio: g.obrigatorio,
  sistema: g.sistema,
  automatico: g.automatico,
  ativo: g.ativo,
  ordem: g.ordem,
  tags: itens.map(paraTag),
})

/** Grupos de tags e tags da empresa ativa (Módulo 1). */
@Injectable()
export class TagsService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Grupos com suas tags, em ordem. Sem `incluirInativos`, esconde o que foi inativado. */
  async listar(incluirInativos: boolean): Promise<TagGrupo[]> {
    const db = this.ctx.db()
    const grupos = await db
      .select()
      .from(tagGrupos)
      .where(
        and(isNull(tagGrupos.excluidoEm), incluirInativos ? undefined : eq(tagGrupos.ativo, true)),
      )
      .orderBy(asc(tagGrupos.ordem), asc(tagGrupos.nome))
    const itens = await db
      .select()
      .from(tags)
      .where(and(isNull(tags.excluidoEm), incluirInativos ? undefined : eq(tags.ativo, true)))
      .orderBy(asc(tags.ordem), asc(tags.nome))
    return grupos.map((g) =>
      paraGrupo(
        g,
        itens.filter((t) => t.tagGrupoId === g.id),
      ),
    )
  }

  async criarGrupo(dados: CriarTagGrupoEntrada): Promise<TagGrupo> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const existentes = await db
      .select({ ordem: tagGrupos.ordem })
      .from(tagGrupos)
      .where(isNull(tagGrupos.excluidoEm))
    const ordem = existentes.reduce((m, g) => Math.max(m, g.ordem), -1) + 1
    const [grupo] = await this.gravando(() =>
      db
        .insert(tagGrupos)
        .values({
          tenantId: this.ctx.tenantId,
          nome: dados.nome.trim(),
          selecao: dados.selecao,
          obrigatorio: dados.obrigatorio ?? false,
          ordem,
          criadoPor: this.ctx.membro.id,
          atualizadoPor: this.ctx.membro.id,
        })
        .returning(),
    )
    if (!grupo) throw new Error('INSERT de grupo sem retorno')
    await this.auditoria.registrar({
      entidade: 'tag_grupo',
      entidadeId: grupo.id,
      acao: 'criar',
      alteracoes: { nome: grupo.nome, selecao: grupo.selecao, obrigatorio: grupo.obrigatorio },
    })
    return paraGrupo(grupo, [])
  }

  async alterarGrupo(id: string, dados: AlterarTagGrupoEntrada): Promise<TagGrupo> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const grupo = await this.grupo(id)
    if (grupo.sistema) {
      const mudaRegra =
        (dados.selecao !== undefined && dados.selecao !== grupo.selecao) ||
        (dados.obrigatorio !== undefined && dados.obrigatorio !== grupo.obrigatorio) ||
        dados.ativo === false
      if (mudaRegra) {
        throw new ErroApi(
          'grupo_de_sistema',
          `O grupo "${grupo.nome}" é do sistema: só dá para renomear.`,
          409,
        )
      }
    }
    const mudancas = diferencas(grupo, dados)
    if (Object.keys(mudancas).length === 0) return this.grupoCompleto(grupo)
    const [novo] = await this.gravando(() =>
      db
        .update(tagGrupos)
        .set({
          ...(dados.nome !== undefined && { nome: dados.nome.trim() }),
          ...(dados.selecao !== undefined && { selecao: dados.selecao }),
          ...(dados.obrigatorio !== undefined && { obrigatorio: dados.obrigatorio }),
          ...(dados.ativo !== undefined && { ativo: dados.ativo }),
          atualizadoPor: this.ctx.membro.id,
        })
        .where(eq(tagGrupos.id, id))
        .returning(),
    )
    if (!novo) throw new Error('UPDATE de grupo sem retorno')
    await this.auditoria.registrar({
      entidade: 'tag_grupo',
      entidadeId: id,
      acao: 'alterar',
      alteracoes: mudancas,
    })
    return this.grupoCompleto(novo)
  }

  /** Exclusão lógica do grupo e de suas tags. Grupo do sistema não se exclui. */
  async excluirGrupo(id: string): Promise<void> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const grupo = await this.grupo(id)
    if (grupo.sistema) {
      throw new ErroApi(
        'grupo_de_sistema',
        `O grupo "${grupo.nome}" é do sistema e não pode ser excluído.`,
        409,
      )
    }
    if (await this.grupoJaFoiUsado(id)) {
      throw new ErroApi(
        'grupo_em_uso',
        `O grupo "${grupo.nome}" tem tags que já foram usadas por empresas (inclusive no histórico): não dá para excluir, só inativar.`,
        409,
      )
    }
    const agora = new Date()
    await db
      .update(tags)
      .set({ excluidoEm: agora, atualizadoPor: this.ctx.membro.id })
      .where(and(eq(tags.tagGrupoId, id), isNull(tags.excluidoEm)))
    await db
      .update(tagGrupos)
      .set({ excluidoEm: agora, atualizadoPor: this.ctx.membro.id })
      .where(eq(tagGrupos.id, id))
    await this.auditoria.registrar({
      entidade: 'tag_grupo',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { nome: grupo.nome },
    })
  }

  async reordenarGrupos(ids: string[]): Promise<TagGrupo[]> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const atuais = await db
      .select({ id: tagGrupos.id })
      .from(tagGrupos)
      .where(isNull(tagGrupos.excluidoEm))
    conferirNovaOrdem(
      atuais.map((g) => g.id),
      ids,
    )
    for (const [ordem, id] of ids.entries()) {
      await db.update(tagGrupos).set({ ordem }).where(eq(tagGrupos.id, id))
    }
    await this.auditoria.registrar({
      entidade: 'tag_grupo',
      acao: 'reordenar',
      alteracoes: { ids },
    })
    return this.listar(true)
  }

  async criarTag(dados: CriarTagEntrada): Promise<Tag> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const grupo = await this.grupo(dados.tagGrupoId)
    if (grupo.automatico) {
      throw new ErroApi(
        'grupo_automatico',
        `As tags do grupo "${grupo.nome}" são aplicadas pelo sistema: não dá para criar outras.`,
        409,
      )
    }
    const existentes = await db
      .select({ ordem: tags.ordem })
      .from(tags)
      .where(and(eq(tags.tagGrupoId, grupo.id), isNull(tags.excluidoEm)))
    const ordem = existentes.reduce((m, t) => Math.max(m, t.ordem), -1) + 1
    const [tag] = await this.gravando(() =>
      db
        .insert(tags)
        .values({
          tenantId: this.ctx.tenantId,
          tagGrupoId: grupo.id,
          nome: dados.nome.trim(),
          cor: dados.cor ?? 'gray',
          ordem,
          criadoPor: this.ctx.membro.id,
          atualizadoPor: this.ctx.membro.id,
        })
        .returning(),
    )
    if (!tag) throw new Error('INSERT de tag sem retorno')
    await this.auditoria.registrar({
      entidade: 'tag',
      entidadeId: tag.id,
      acao: 'criar',
      alteracoes: { nome: tag.nome, cor: tag.cor, grupo: grupo.nome },
    })
    return paraTag(tag)
  }

  async alterarTag(id: string, dados: AlterarTagEntrada): Promise<Tag> {
    exigirAdmin(this.ctx)
    const tag = await this.tag(id)
    if (comRegra(tag) && dados.ativo === false) {
      throw new ErroApi(
        'tag_de_sistema',
        `A tag "${tag.nome}" é usada pelas regras do sistema: dá para renomear e mudar a cor, não inativar.`,
        409,
      )
    }
    const mudancas = diferencas(tag, dados)
    if (Object.keys(mudancas).length === 0) return paraTag(tag)
    const [nova] = await this.gravando(() =>
      this.ctx
        .db()
        .update(tags)
        .set({
          ...(dados.nome !== undefined && { nome: dados.nome.trim() }),
          ...(dados.cor !== undefined && { cor: dados.cor }),
          ...(dados.ativo !== undefined && { ativo: dados.ativo }),
          ...(dados.apareceNoMapa !== undefined && { apareceNoMapa: dados.apareceNoMapa }),
          ...(dados.visivelAoAbrir !== undefined && { visivelAoAbrir: dados.visivelAoAbrir }),
          atualizadoPor: this.ctx.membro.id,
        })
        .where(eq(tags.id, id))
        .returning(),
    )
    if (!nova) throw new Error('UPDATE de tag sem retorno')
    await this.auditoria.registrar({
      entidade: 'tag',
      entidadeId: id,
      acao: 'alterar',
      alteracoes: mudancas,
    })
    return paraTag(nova)
  }

  async excluirTag(id: string): Promise<void> {
    exigirAdmin(this.ctx)
    const tag = await this.tag(id)
    if (comRegra(tag)) {
      throw new ErroApi(
        'tag_de_sistema',
        `A tag "${tag.nome}" é usada pelas regras do sistema e não pode ser excluída.`,
        409,
      )
    }
    if (await this.tagJaFoiUsada(id)) {
      throw new ErroApi(
        'tag_em_uso',
        `A tag "${tag.nome}" já foi usada por empresas (inclusive no histórico de Status): não dá para excluir, só inativar.`,
        409,
      )
    }
    await this.ctx
      .db()
      .update(tags)
      .set({ excluidoEm: new Date(), atualizadoPor: this.ctx.membro.id })
      .where(eq(tags.id, id))
    await this.auditoria.registrar({
      entidade: 'tag',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { nome: tag.nome },
    })
  }

  async reordenarTags(grupoId: string, ids: string[]): Promise<TagGrupo> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const grupo = await this.grupo(grupoId)
    const atuais = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.tagGrupoId, grupoId), isNull(tags.excluidoEm)))
    conferirNovaOrdem(
      atuais.map((t) => t.id),
      ids,
    )
    for (const [ordem, id] of ids.entries()) {
      await db.update(tags).set({ ordem }).where(eq(tags.id, id))
    }
    await this.auditoria.registrar({
      entidade: 'tag_grupo',
      entidadeId: grupoId,
      acao: 'reordenar_tags',
      alteracoes: { ids },
    })
    return this.grupoCompleto(grupo)
  }

  // ---- internos ----

  /** A tag está (ou já esteve) em alguma empresa, mesmo excluída: o histórico de Status depende dela. */
  private async tagJaFoiUsada(tagId: string): Promise<boolean> {
    const [r] = await this.ctx.db().execute<{ usada: boolean }>(sql`
      SELECT (EXISTS (SELECT 1 FROM empresa_tags WHERE tag_id = ${tagId})
           OR EXISTS (SELECT 1 FROM empresa_tags_historico WHERE tag_id = ${tagId})) AS usada`)
    return r?.usada === true
  }

  /** Alguma tag do grupo (mesmo já excluída) já foi usada por empresa. */
  private async grupoJaFoiUsado(grupoId: string): Promise<boolean> {
    const [r] = await this.ctx.db().execute<{ usada: boolean }>(sql`
      SELECT (EXISTS (SELECT 1 FROM empresa_tags et JOIN tags t ON t.id = et.tag_id WHERE t.tag_grupo_id = ${grupoId})
           OR EXISTS (SELECT 1 FROM empresa_tags_historico h JOIN tags t ON t.id = h.tag_id WHERE t.tag_grupo_id = ${grupoId})) AS usada`)
    return r?.usada === true
  }

  /** Grupo não excluído da empresa ativa (o RLS esconde o de outra empresa: o mesmo 404). */
  private async grupo(id: string): Promise<LinhaGrupo> {
    const [g] = await this.ctx
      .db()
      .select()
      .from(tagGrupos)
      .where(and(eq(tagGrupos.id, id), isNull(tagGrupos.excluidoEm)))
    if (!g) throw new ErroApi('grupo_nao_encontrado', 'Grupo de tags não encontrado.', 404)
    return g
  }

  private async tag(id: string): Promise<LinhaTag> {
    const [t] = await this.ctx
      .db()
      .select()
      .from(tags)
      .where(and(eq(tags.id, id), isNull(tags.excluidoEm)))
    if (!t) throw new ErroApi('tag_nao_encontrada', 'Tag não encontrada.', 404)
    return t
  }

  private async grupoCompleto(grupo: LinhaGrupo): Promise<TagGrupo> {
    const itens = await this.ctx
      .db()
      .select()
      .from(tags)
      .where(and(eq(tags.tagGrupoId, grupo.id), isNull(tags.excluidoEm)))
      .orderBy(asc(tags.ordem), asc(tags.nome))
    return paraGrupo(grupo, itens)
  }

  /** Nome repetido (índice único parcial) vira 409 com código estável. */
  private async gravando<T>(operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao()
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ErroApi('nome_duplicado', 'Já existe um item com esse nome.', 409)
      }
      throw erro
    }
  }
}

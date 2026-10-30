import { and, asc, desc, eq, inArray, isNull, ne, novoId, schema, sql } from '@leadtogo/db'
import type {
  AlterarModeloDeVisitaEntrada,
  CampoDeVisita,
  CriarModeloDeVisitaEntrada,
  ModeloDeVisita,
  VersaoDoModeloDeVisita,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { conferirNovaOrdem } from '../cadastros/cadastros.base.js'
import { ErroApi } from '../http/erro-api.js'
import { ehViolacaoDeUnicidade } from '../http/sqlstate.js'

const { visitaModelos, visitaModeloVersoes, visitaResultados, tags, tagGrupos } = schema

type LinhaDoModelo = typeof visitaModelos.$inferSelect
type LinhaDaVersao = typeof visitaModeloVersoes.$inferSelect

const paraVersao = (v: LinhaDaVersao): VersaoDoModeloDeVisita => ({
  id: v.id,
  numero: v.numero,
  campos: v.campos as CampoDeVisita[],
  criadoEm: v.criadoEm.toISOString(),
})

/**
 * Modelos do relatório de visita (G3a). Os campos ficam em versões: a versão que já tem relatório
 * nunca muda (editar publica a N+1); sem relatório, a versão atual é editada no lugar. Um modelo é o
 * padrão da empresa. Tudo na transação da requisição (RLS) e na auditoria.
 */
@Injectable()
export class ModelosDeVisitaService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(incluirInativos: boolean): Promise<ModeloDeVisita[]> {
    const linhas = await this.ctx
      .db()
      .select()
      .from(visitaModelos)
      .where(
        and(
          isNull(visitaModelos.excluidoEm),
          incluirInativos ? undefined : eq(visitaModelos.ativo, true),
        ),
      )
      .orderBy(asc(visitaModelos.ordem), asc(visitaModelos.nome))
    return this.montar(linhas)
  }

  async obter(id: string): Promise<ModeloDeVisita> {
    const [dto] = await this.montar([await this.achar(id)])
    if (!dto) throw new Error('modelo sem versão')
    return dto
  }

  /** Todas as versões, da mais nova para a mais antiga (os relatórios antigos mostram a sua). */
  async versoes(id: string): Promise<VersaoDoModeloDeVisita[]> {
    await this.achar(id)
    const linhas = await this.ctx
      .db()
      .select()
      .from(visitaModeloVersoes)
      .where(eq(visitaModeloVersoes.modeloId, id))
      .orderBy(desc(visitaModeloVersoes.numero))
    return linhas.map(paraVersao)
  }

  async criar(dados: CriarModeloDeVisitaEntrada): Promise<ModeloDeVisita> {
    await this.conferirTags(dados.campos)
    const db = this.ctx.db()
    const [ultimo] = await db
      .select({ ordem: sql<number>`coalesce(max(${visitaModelos.ordem}), -1)::int` })
      .from(visitaModelos)
      .where(isNull(visitaModelos.excluidoEm))
    const autoria = {
      tenantId: this.ctx.tenantId,
      criadoPor: this.ctx.membro.id,
      atualizadoPor: this.ctx.membro.id,
    }
    const id = novoId()
    const versaoId = novoId()
    await this.gravando(() =>
      db.insert(visitaModelos).values({
        ...autoria,
        id,
        nome: dados.nome,
        ordem: (ultimo?.ordem ?? -1) + 1,
      }),
    )
    await db
      .insert(visitaModeloVersoes)
      .values({ ...autoria, id: versaoId, modeloId: id, numero: 1, campos: dados.campos })
    await db.update(visitaModelos).set({ versaoAtualId: versaoId }).where(eq(visitaModelos.id, id))
    await this.auditoria.registrar({
      entidade: 'modelo_visita',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { nome: dados.nome, campos: dados.campos.length },
    })
    return this.obter(id)
  }

  async alterar(id: string, dados: AlterarModeloDeVisitaEntrada): Promise<ModeloDeVisita> {
    const atual = await this.achar(id)
    const db = this.ctx.db()
    const mudancas: Record<string, unknown> = {}

    if (dados.ativo === false && atual.ativo) {
      if (atual.padrao) {
        throw new ErroApi(
          'modelo_padrao',
          'O modelo padrão não pode ser inativado. Torne outro modelo o padrão antes.',
          409,
        )
      }
      await this.recusarSeResultadoUsa(id, 'inativar', true)
    }
    if (dados.padrao && !atual.padrao) {
      if (!(dados.ativo ?? atual.ativo)) {
        throw new ErroApi('modelo_inativo', 'Um modelo inativo não pode ser o padrão.', 409)
      }
      // o índice parcial só admite um padrão: desliga o anterior antes
      await db
        .update(visitaModelos)
        .set({ padrao: false, atualizadoPor: this.ctx.membro.id })
        .where(and(eq(visitaModelos.padrao, true), ne(visitaModelos.id, id)))
      mudancas['padrao'] = { de: false, para: true }
    }
    const valores: Partial<LinhaDoModelo> = {}
    if (dados.nome !== undefined && dados.nome !== atual.nome) {
      valores.nome = dados.nome
      mudancas['nome'] = { de: atual.nome, para: dados.nome }
    }
    if (dados.ativo !== undefined && dados.ativo !== atual.ativo) {
      valores.ativo = dados.ativo
      mudancas['ativo'] = { de: atual.ativo, para: dados.ativo }
    }
    if (dados.padrao) valores.padrao = true

    if (dados.campos) {
      await this.conferirTags(dados.campos)
      const versao = await this.versaoAtual(atual)
      if (JSON.stringify(versao.campos) !== JSON.stringify(dados.campos)) {
        if (await this.emUso(id)) {
          // versão publicada nunca muda: publica a N+1
          const [maior] = await db
            .select({ n: sql<number>`max(${visitaModeloVersoes.numero})::int` })
            .from(visitaModeloVersoes)
            .where(eq(visitaModeloVersoes.modeloId, id))
          const novaId = novoId()
          const numero = (maior?.n ?? versao.numero) + 1
          await db.insert(visitaModeloVersoes).values({
            id: novaId,
            tenantId: this.ctx.tenantId,
            modeloId: id,
            numero,
            campos: dados.campos,
            criadoPor: this.ctx.membro.id,
            atualizadoPor: this.ctx.membro.id,
          })
          valores.versaoAtualId = novaId
          mudancas['versao'] = { de: versao.numero, para: numero }
        } else {
          await db
            .update(visitaModeloVersoes)
            .set({ campos: dados.campos, atualizadoPor: this.ctx.membro.id })
            .where(eq(visitaModeloVersoes.id, versao.id))
          mudancas['campos'] = { de: versao.campos.length, para: dados.campos.length }
        }
      }
    }

    if (Object.keys(valores).length > 0) {
      await this.gravando(() =>
        db
          .update(visitaModelos)
          .set({ ...valores, atualizadoPor: this.ctx.membro.id })
          .where(eq(visitaModelos.id, id)),
      )
    }
    if (Object.keys(mudancas).length > 0) {
      await this.auditoria.registrar({
        entidade: 'modelo_visita',
        entidadeId: id,
        acao: 'alterar',
        alteracoes: mudancas,
      })
    }
    return this.obter(id)
  }

  /** Só se exclui o modelo que não é o padrão, que nenhum resultado usa e que nunca teve relatório. */
  async excluir(id: string): Promise<void> {
    const atual = await this.achar(id)
    if (atual.padrao) {
      throw new ErroApi(
        'modelo_padrao',
        'O modelo padrão não pode ser excluído. Torne outro modelo o padrão antes.',
        409,
      )
    }
    await this.recusarSeResultadoUsa(id, 'excluir', false)
    if (await this.teveRelatorio(id)) {
      throw new ErroApi(
        'modelo_em_uso',
        `O modelo "${atual.nome}" já tem relatórios: não dá para excluir, só inativar.`,
        409,
      )
    }
    await this.ctx
      .db()
      .update(visitaModelos)
      .set({ excluidoEm: new Date(), atualizadoPor: this.ctx.membro.id })
      .where(eq(visitaModelos.id, id))
    await this.auditoria.registrar({
      entidade: 'modelo_visita',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { nome: atual.nome },
    })
  }

  async reordenar(ids: string[]): Promise<ModeloDeVisita[]> {
    const db = this.ctx.db()
    const atuais = await db
      .select({ id: visitaModelos.id })
      .from(visitaModelos)
      .where(isNull(visitaModelos.excluidoEm))
    conferirNovaOrdem(
      atuais.map((l) => l.id),
      ids,
    )
    for (const [ordem, id] of ids.entries()) {
      await db.update(visitaModelos).set({ ordem }).where(eq(visitaModelos.id, id))
    }
    await this.auditoria.registrar({
      entidade: 'modelo_visita',
      acao: 'reordenar',
      alteracoes: { ids },
    })
    return this.listar(true)
  }

  /**
   * Modelos cuja versão ATUAL já tem relatório (rascunho ou concluído): ela não pode mais mudar no
   * lugar, e editar publica a N+1. Versões antigas com relatório não contam (já não são editadas).
   */
  private async modelosEmUso(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const linhas = await this.ctx.db().execute<{ id: string }>(sql`
      SELECT DISTINCT m.id FROM visita_modelos m
      JOIN relatorios_visita r ON r.modelo_versao_id = m.versao_atual_id AND r.excluido_em IS NULL
      WHERE m.id = ANY (${`{${ids.join(',')}}`}::uuid[])`)
    return new Set(linhas.map((l) => l.id))
  }

  /** Já teve algum relatório, em qualquer versão: só se inativa. */
  private async teveRelatorio(id: string): Promise<boolean> {
    const [l] = await this.ctx.db().execute<{ usado: boolean }>(sql`
      SELECT EXISTS (SELECT 1 FROM relatorios_visita r JOIN visita_modelo_versoes v ON v.id = r.modelo_versao_id
        WHERE v.modelo_id = ${id}) AS usado`)
    return l?.usado === true
  }

  private async emUso(id: string): Promise<boolean> {
    return (await this.modelosEmUso([id])).has(id)
  }

  private async montar(linhas: LinhaDoModelo[]): Promise<ModeloDeVisita[]> {
    if (linhas.length === 0) return []
    const ids = linhas.map((l) => l.id)
    const db = this.ctx.db()
    const versoes = await db
      .select()
      .from(visitaModeloVersoes)
      .where(
        inArray(
          visitaModeloVersoes.id,
          linhas.flatMap((l) => (l.versaoAtualId ? [l.versaoAtualId] : [])),
        ),
      )
    const porId = new Map(versoes.map((v) => [v.id, v]))
    const contagens = await db
      .select({ modeloId: visitaResultados.modeloId, n: sql<number>`count(*)::int` })
      .from(visitaResultados)
      .where(and(inArray(visitaResultados.modeloId, ids), isNull(visitaResultados.excluidoEm)))
      .groupBy(visitaResultados.modeloId)
    const resultados = new Map(contagens.map((c) => [c.modeloId, c.n]))
    const emUso = await this.modelosEmUso(ids)
    return linhas.flatMap((l) => {
      const versao = l.versaoAtualId ? porId.get(l.versaoAtualId) : undefined
      if (!versao) return []
      return [
        {
          id: l.id,
          nome: l.nome,
          padrao: l.padrao,
          ativo: l.ativo,
          ordem: l.ordem,
          versaoAtual: paraVersao(versao),
          resultados: resultados.get(l.id) ?? 0,
          emUso: emUso.has(l.id),
        },
      ]
    })
  }

  private async versaoAtual(modelo: LinhaDoModelo): Promise<VersaoDoModeloDeVisita> {
    const [v] = await this.ctx
      .db()
      .select()
      .from(visitaModeloVersoes)
      .where(eq(visitaModeloVersoes.id, modelo.versaoAtualId ?? ''))
    if (!v) throw new Error(`modelo ${modelo.id} sem versão atual`)
    return paraVersao(v)
  }

  /** Modelo não excluído da empresa ativa (o RLS esconde o de outra empresa: o mesmo 404). */
  private async achar(id: string): Promise<LinhaDoModelo> {
    const [linha] = await this.ctx
      .db()
      .select()
      .from(visitaModelos)
      .where(and(eq(visitaModelos.id, id), isNull(visitaModelos.excluidoEm)))
    if (!linha) throw new ErroApi('item_nao_encontrado', 'Modelo de relatório não encontrado.', 404)
    return linha
  }

  private async recusarSeResultadoUsa(id: string, acao: string, soAtivos: boolean): Promise<void> {
    const usando = await this.ctx
      .db()
      .select({ nome: visitaResultados.nome })
      .from(visitaResultados)
      .where(
        and(
          eq(visitaResultados.modeloId, id),
          isNull(visitaResultados.excluidoEm),
          soAtivos ? eq(visitaResultados.ativo, true) : undefined,
        ),
      )
      .orderBy(asc(visitaResultados.ordem))
    if (usando.length > 0) {
      throw new ErroApi(
        'modelo_usado_por_resultado',
        `Não dá para ${acao}: o modelo é usado pelos resultados ${usando
          .map((r) => `"${r.nome}"`)
          .join(', ')}. Troque o modelo deles antes.`,
        409,
      )
    }
  }

  /** A tag de um campo "tag" precisa ser da empresa, ativa e de um grupo que não é automático. */
  private async conferirTags(campos: CampoDeVisita[]): Promise<void> {
    const ids = campos.flatMap((c) => (c.tipo === 'tag' ? [c.tagId] : []))
    if (ids.length === 0) return
    const validas = await this.ctx
      .db()
      .select({ id: tags.id })
      .from(tags)
      .innerJoin(tagGrupos, eq(tagGrupos.id, tags.tagGrupoId))
      .where(
        and(
          inArray(tags.id, ids),
          isNull(tags.excluidoEm),
          eq(tags.ativo, true),
          isNull(tagGrupos.excluidoEm),
          eq(tagGrupos.automatico, false),
          eq(tagGrupos.aplicaA, 'empresa'),
        ),
      )
    if (new Set(validas.map((t) => t.id)).size !== new Set(ids).size) {
      throw new ErroApi(
        'tag_invalida',
        'A tag de um campo precisa ser uma tag ativa da empresa, de um grupo que não é automático.',
        400,
      )
    }
  }

  /** Nome repetido (índice único parcial) vira 409 com código estável. */
  private async gravando<T>(operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao()
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ErroApi('nome_duplicado', 'Já existe um modelo com esse nome.', 409)
      }
      throw erro
    }
  }
}

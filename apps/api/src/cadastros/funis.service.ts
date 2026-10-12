import { and, asc, eq, isNull, ne, schema } from '@leadtogo/db'
import type {
  AlterarFaseEntrada,
  AlterarFunilEntrada,
  CriarFaseEntrada,
  CriarFunilEntrada,
  Funil,
  FunilFase,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { ehViolacaoDeUnicidade } from '../http/sqlstate.js'
import { conferirNovaOrdem, diferencas, exigirAdmin } from './cadastros.base.js'

const { funilFases, funis } = schema
type LinhaFunil = typeof funis.$inferSelect
type LinhaFase = typeof funilFases.$inferSelect

const paraFase = (f: LinhaFase): FunilFase => ({
  id: f.id,
  funilId: f.funilId,
  nome: f.nome,
  cor: f.cor,
  probabilidadePadrao: f.probabilidadePadrao,
  diasAlertaParada: f.diasAlertaParada,
  ordem: f.ordem,
})
const paraFunil = (f: LinhaFunil, fases: LinhaFase[]): Funil => ({
  id: f.id,
  nome: f.nome,
  padrao: f.padrao,
  ativo: f.ativo,
  ordem: f.ordem,
  fases: fases.map(paraFase),
})

/**
 * Funis e fases da empresa ativa. Sempre há exatamente um funil padrão e todo funil tem ao menos
 * uma fase. As fases representam só o andamento (o fechamento é pelo Status da oportunidade).
 */
@Injectable()
export class FunisService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(incluirInativos: boolean): Promise<Funil[]> {
    const db = this.ctx.db()
    const lista = await db
      .select()
      .from(funis)
      .where(and(isNull(funis.excluidoEm), incluirInativos ? undefined : eq(funis.ativo, true)))
      .orderBy(asc(funis.ordem), asc(funis.nome))
    const fases = await db
      .select()
      .from(funilFases)
      .where(isNull(funilFases.excluidoEm))
      .orderBy(asc(funilFases.ordem), asc(funilFases.nome))
    return lista.map((f) =>
      paraFunil(
        f,
        fases.filter((x) => x.funilId === f.id),
      ),
    )
  }

  async criar(dados: CriarFunilEntrada): Promise<Funil> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const existentes = await db
      .select({ ordem: funis.ordem, padrao: funis.padrao })
      .from(funis)
      .where(isNull(funis.excluidoEm))
    const ordem = existentes.reduce((m, f) => Math.max(m, f.ordem), -1) + 1
    const autoria = {
      tenantId: this.ctx.tenantId,
      criadoPor: this.ctx.membro.id,
      atualizadoPor: this.ctx.membro.id,
    }
    const [funil] = await this.gravando(() =>
      db
        .insert(funis)
        .values({
          ...autoria,
          nome: dados.nome,
          ordem,
          // O primeiro funil da empresa é o padrão; os demais nascem comuns
          padrao: !existentes.some((f) => f.padrao),
        })
        .returning(),
    )
    if (!funil) throw new Error('INSERT de funil sem retorno')
    const fases = await this.gravando(() =>
      db
        .insert(funilFases)
        .values(
          dados.fases.map((f, i) => ({
            ...autoria,
            funilId: funil.id,
            nome: f.nome,
            cor: f.cor ?? 'gray',
            probabilidadePadrao: f.probabilidadePadrao ?? 0,
            diasAlertaParada: f.diasAlertaParada ?? null,
            ordem: i,
          })),
        )
        .returning(),
    )
    await this.auditoria.registrar({
      entidade: 'funil',
      entidadeId: funil.id,
      acao: 'criar',
      alteracoes: { nome: funil.nome, fases: fases.map((f) => f.nome) },
    })
    return paraFunil(funil, ordenadas(fases))
  }

  async alterar(id: string, dados: AlterarFunilEntrada): Promise<Funil> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const atual = await this.funil(id)
    if (dados.ativo === false && atual.padrao) {
      throw new ErroApi(
        'funil_padrao',
        'O funil padrão não pode ser inativado: torne outro funil o padrão antes.',
        409,
      )
    }
    if (dados.padrao && !atual.ativo && dados.ativo !== true) {
      throw new ErroApi('funil_inativo', 'Reative o funil antes de torná-lo o padrão.', 409)
    }
    const mudancas = diferencas(atual, { nome: dados.nome, ativo: dados.ativo })
    if (dados.padrao && !atual.padrao) mudancas['padrao'] = { de: false, para: true }
    if (Object.keys(mudancas).length === 0) return this.completo(atual)

    if (dados.padrao && !atual.padrao) {
      // O índice único admite um padrão só: tira o atual antes de marcar o novo
      await db
        .update(funis)
        .set({ padrao: false, atualizadoPor: this.ctx.membro.id })
        .where(and(eq(funis.padrao, true), isNull(funis.excluidoEm), ne(funis.id, id)))
    }
    const [novo] = await this.gravando(() =>
      db
        .update(funis)
        .set({
          ...(dados.nome !== undefined && { nome: dados.nome }),
          ...(dados.ativo !== undefined && { ativo: dados.ativo }),
          ...(dados.padrao && { padrao: true }),
          atualizadoPor: this.ctx.membro.id,
        })
        .where(eq(funis.id, id))
        .returning(),
    )
    if (!novo) throw new Error('UPDATE de funil sem retorno')
    await this.auditoria.registrar({
      entidade: 'funil',
      entidadeId: id,
      acao: 'alterar',
      alteracoes: mudancas,
    })
    return this.completo(novo)
  }

  /** Exclusão lógica do funil e das fases dele. O funil padrão não se exclui. */
  async excluir(id: string): Promise<void> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const atual = await this.funil(id)
    if (atual.padrao) {
      throw new ErroApi(
        'funil_padrao',
        'O funil padrão não pode ser excluído: torne outro funil o padrão antes.',
        409,
      )
    }
    // Quando houver oportunidades (Módulo 6), um funil com oportunidades não se exclui: entra aqui
    const agora = new Date()
    await db
      .update(funilFases)
      .set({ excluidoEm: agora, atualizadoPor: this.ctx.membro.id })
      .where(and(eq(funilFases.funilId, id), isNull(funilFases.excluidoEm)))
    await db
      .update(funis)
      .set({ excluidoEm: agora, atualizadoPor: this.ctx.membro.id })
      .where(eq(funis.id, id))
    await this.auditoria.registrar({
      entidade: 'funil',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { nome: atual.nome },
    })
  }

  async reordenar(ids: string[]): Promise<Funil[]> {
    exigirAdmin(this.ctx)
    const db = this.ctx.db()
    const atuais = await db.select({ id: funis.id }).from(funis).where(isNull(funis.excluidoEm))
    conferirNovaOrdem(
      atuais.map((f) => f.id),
      ids,
    )
    for (const [ordem, id] of ids.entries()) {
      await db.update(funis).set({ ordem }).where(eq(funis.id, id))
    }
    await this.auditoria.registrar({ entidade: 'funil', acao: 'reordenar', alteracoes: { ids } })
    return this.listar(true)
  }

  // ---- fases ----

  async criarFase(funilId: string, dados: CriarFaseEntrada): Promise<Funil> {
    exigirAdmin(this.ctx)
    const funil = await this.funil(funilId)
    const existentes = await this.fasesDe(funilId)
    const ordem = existentes.reduce((m, f) => Math.max(m, f.ordem), -1) + 1
    const [fase] = await this.gravando(() =>
      this.ctx
        .db()
        .insert(funilFases)
        .values({
          tenantId: this.ctx.tenantId,
          funilId,
          nome: dados.nome,
          cor: dados.cor ?? 'gray',
          probabilidadePadrao: dados.probabilidadePadrao ?? 0,
          diasAlertaParada: dados.diasAlertaParada ?? null,
          ordem,
          criadoPor: this.ctx.membro.id,
          atualizadoPor: this.ctx.membro.id,
        })
        .returning(),
    )
    if (!fase) throw new Error('INSERT de fase sem retorno')
    await this.auditoria.registrar({
      entidade: 'funil_fase',
      entidadeId: fase.id,
      acao: 'criar',
      alteracoes: { nome: fase.nome, funil: funil.nome },
    })
    return this.completo(funil)
  }

  async alterarFase(faseId: string, dados: AlterarFaseEntrada): Promise<Funil> {
    exigirAdmin(this.ctx)
    const fase = await this.fase(faseId)
    const funil = await this.funil(fase.funilId)
    const mudancas = diferencas(fase, dados)
    if (Object.keys(mudancas).length === 0) return this.completo(funil)
    await this.gravando(() =>
      this.ctx
        .db()
        .update(funilFases)
        .set({
          ...(dados.nome !== undefined && { nome: dados.nome }),
          ...(dados.cor !== undefined && { cor: dados.cor }),
          ...(dados.probabilidadePadrao !== undefined && {
            probabilidadePadrao: dados.probabilidadePadrao,
          }),
          ...(dados.diasAlertaParada !== undefined && { diasAlertaParada: dados.diasAlertaParada }),
          atualizadoPor: this.ctx.membro.id,
        })
        .where(eq(funilFases.id, faseId)),
    )
    await this.auditoria.registrar({
      entidade: 'funil_fase',
      entidadeId: faseId,
      acao: 'alterar',
      alteracoes: mudancas,
    })
    return this.completo(funil)
  }

  /** Exclusão lógica. O funil nunca fica sem fase. */
  async excluirFase(faseId: string): Promise<Funil> {
    exigirAdmin(this.ctx)
    const fase = await this.fase(faseId)
    const funil = await this.funil(fase.funilId)
    if ((await this.fasesDe(funil.id)).length <= 1) {
      throw new ErroApi('ultima_fase', 'O funil precisa ter ao menos uma fase.', 409)
    }
    // Quando houver oportunidades (Módulo 6), fase com oportunidades não se exclui: é preciso movê-las
    await this.ctx
      .db()
      .update(funilFases)
      .set({ excluidoEm: new Date(), atualizadoPor: this.ctx.membro.id })
      .where(eq(funilFases.id, faseId))
    await this.auditoria.registrar({
      entidade: 'funil_fase',
      entidadeId: faseId,
      acao: 'excluir',
      alteracoes: { nome: fase.nome, funil: funil.nome },
    })
    return this.completo(funil)
  }

  async reordenarFases(funilId: string, ids: string[]): Promise<Funil> {
    exigirAdmin(this.ctx)
    const funil = await this.funil(funilId)
    conferirNovaOrdem(
      (await this.fasesDe(funilId)).map((f) => f.id),
      ids,
    )
    for (const [ordem, id] of ids.entries()) {
      await this.ctx.db().update(funilFases).set({ ordem }).where(eq(funilFases.id, id))
    }
    await this.auditoria.registrar({
      entidade: 'funil',
      entidadeId: funilId,
      acao: 'reordenar_fases',
      alteracoes: { ids },
    })
    return this.completo(funil)
  }

  // ---- internos ----

  private async funil(id: string): Promise<LinhaFunil> {
    const [f] = await this.ctx
      .db()
      .select()
      .from(funis)
      .where(and(eq(funis.id, id), isNull(funis.excluidoEm)))
    if (!f) throw new ErroApi('funil_nao_encontrado', 'Funil não encontrado.', 404)
    return f
  }

  private async fase(id: string): Promise<LinhaFase> {
    const [f] = await this.ctx
      .db()
      .select()
      .from(funilFases)
      .where(and(eq(funilFases.id, id), isNull(funilFases.excluidoEm)))
    if (!f) throw new ErroApi('fase_nao_encontrada', 'Fase não encontrada.', 404)
    return f
  }

  private fasesDe(funilId: string): Promise<LinhaFase[]> {
    return this.ctx
      .db()
      .select()
      .from(funilFases)
      .where(and(eq(funilFases.funilId, funilId), isNull(funilFases.excluidoEm)))
      .orderBy(asc(funilFases.ordem), asc(funilFases.nome))
  }

  private async completo(funil: LinhaFunil): Promise<Funil> {
    return paraFunil(funil, await this.fasesDe(funil.id))
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

const ordenadas = (fases: LinhaFase[]) => [...fases].sort((a, b) => a.ordem - b.ordem)

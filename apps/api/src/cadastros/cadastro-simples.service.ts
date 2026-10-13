import { and, asc, eq, isNull, schema } from '@leadtogo/db'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'
import { ehViolacaoDeUnicidade } from '../http/sqlstate.js'
import { conferirNovaOrdem, diferencas, exigirAdmin } from './cadastros.base.js'

type TabelaCadastro =
  | typeof schema.verticais
  | typeof schema.solucoes
  | typeof schema.origens
  | typeof schema.motivos
  | typeof schema.tiposAtividade
  | typeof schema.papeisDecisao
/** As colunas que os cadastros têm em comum (o que este serviço usa). */
type TabelaComum = typeof schema.verticais

export interface LinhaComum {
  id: string
  nome: string
  ativo: boolean
  ordem: number
}

export interface ConfigDoCadastro<Linha extends LinhaComum, Dto, Criar, Alterar> {
  /** Nome da entidade na auditoria (`vertical`, `tipo_atividade`...) */
  entidade: string
  /** Como a mensagem chama o item ("Vertical", "Tipo de atividade") */
  rotulo: string
  tabela: TabelaCadastro
  paraDto: (linha: Linha) => Dto
  /** Colunas a gravar na criação (além de tenant, ordem e autoria) */
  valoresCriar: (dados: Criar) => Record<string, unknown>
  /** Colunas a gravar na alteração (só as informadas) */
  valoresAlterar: (dados: Alterar) => Record<string, unknown>
  /** Regra de proteção do sistema: lança `ErroApi` 409 se a alteração não é permitida */
  conferirAlteracao?: (linha: Linha, valores: Record<string, unknown>) => void
  /** Pode ser assíncrona: confere o uso do item (excluir só o que nunca foi usado) */
  conferirExclusao?: (linha: Linha) => void | Promise<void>
}

/**
 * Cadastro auxiliar simples da empresa ativa (verticais, soluções, origens, motivos, tipos de
 * atividade): listar, criar, alterar, excluir (lógico) e reordenar. Ler é de qualquer membro;
 * escrever, do administrador. Tudo passa pela transação da requisição (RLS) e vai para a auditoria.
 */
@Injectable()
export abstract class CadastroSimplesService<
  Linha extends LinhaComum,
  Dto,
  Criar extends object,
  Alterar extends object,
> {
  protected constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    private readonly cfg: ConfigDoCadastro<Linha, Dto, Criar, Alterar>,
  ) {}

  private get t(): TabelaComum {
    return this.cfg.tabela as unknown as TabelaComum
  }

  async listar(incluirInativos: boolean): Promise<Dto[]> {
    const { t } = this
    const linhas = await this.ctx
      .db()
      .select()
      .from(t)
      .where(and(isNull(t.excluidoEm), incluirInativos ? undefined : eq(t.ativo, true)))
      .orderBy(asc(t.ordem), asc(t.nome))
    return (linhas as unknown as Linha[]).map((l) => this.cfg.paraDto(l))
  }

  async criar(dados: Criar): Promise<Dto> {
    exigirAdmin(this.ctx)
    const { t } = this
    const existentes = await this.ctx
      .db()
      .select({ ordem: t.ordem })
      .from(t)
      .where(isNull(t.excluidoEm))
    const ordem = existentes.reduce((m, l) => Math.max(m, l.ordem), -1) + 1
    const valores = {
      ...this.cfg.valoresCriar(dados),
      tenantId: this.ctx.tenantId,
      ordem,
      criadoPor: this.ctx.membro.id,
      atualizadoPor: this.ctx.membro.id,
    }
    const [linha] = (await this.gravando(() =>
      this.ctx
        .db()
        .insert(t)
        .values(valores as never)
        .returning(),
    )) as unknown as Linha[]
    if (!linha) throw new Error(`INSERT de ${this.cfg.entidade} sem retorno`)
    await this.auditoria.registrar({
      entidade: this.cfg.entidade,
      entidadeId: linha.id,
      acao: 'criar',
      alteracoes: this.cfg.valoresCriar(dados),
    })
    return this.cfg.paraDto(linha)
  }

  async alterar(id: string, dados: Alterar): Promise<Dto> {
    exigirAdmin(this.ctx)
    const { t } = this
    const atual = await this.achar(id)
    const valores = this.cfg.valoresAlterar(dados)
    this.cfg.conferirAlteracao?.(atual, valores)
    const mudancas = diferencas(atual, valores)
    if (Object.keys(mudancas).length === 0) return this.cfg.paraDto(atual)
    const [linha] = (await this.gravando(() =>
      this.ctx
        .db()
        .update(t)
        .set({ ...valores, atualizadoPor: this.ctx.membro.id })
        .where(eq(t.id, id))
        .returning(),
    )) as unknown as Linha[]
    if (!linha) throw new Error(`UPDATE de ${this.cfg.entidade} sem retorno`)
    await this.auditoria.registrar({
      entidade: this.cfg.entidade,
      entidadeId: id,
      acao: 'alterar',
      alteracoes: mudancas,
    })
    return this.cfg.paraDto(linha)
  }

  /** Exclusão lógica. Cada cadastro confere, em `conferirExclusao`, se o item já foi usado (só se exclui o que nunca foi usado). */
  async excluir(id: string): Promise<void> {
    exigirAdmin(this.ctx)
    const { t } = this
    const atual = await this.achar(id)
    await this.cfg.conferirExclusao?.(atual)
    await this.ctx
      .db()
      .update(t)
      .set({ excluidoEm: new Date(), atualizadoPor: this.ctx.membro.id })
      .where(eq(t.id, id))
    await this.auditoria.registrar({
      entidade: this.cfg.entidade,
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { nome: atual.nome },
    })
  }

  async reordenar(ids: string[]): Promise<Dto[]> {
    exigirAdmin(this.ctx)
    const { t } = this
    const db = this.ctx.db()
    const atuais = await db.select({ id: t.id }).from(t).where(isNull(t.excluidoEm))
    conferirNovaOrdem(
      atuais.map((l) => l.id),
      ids,
    )
    for (const [ordem, id] of ids.entries()) {
      await db.update(t).set({ ordem }).where(eq(t.id, id))
    }
    await this.auditoria.registrar({
      entidade: this.cfg.entidade,
      acao: 'reordenar',
      alteracoes: { ids },
    })
    return this.listar(true)
  }

  /** Item não excluído da empresa ativa (o RLS esconde o de outra empresa: o mesmo 404). */
  private async achar(id: string): Promise<Linha> {
    const { t } = this
    const [linha] = await this.ctx
      .db()
      .select()
      .from(t)
      .where(and(eq(t.id, id), isNull(t.excluidoEm)))
    if (!linha) {
      throw new ErroApi('item_nao_encontrado', `${this.cfg.rotulo} não encontrado(a).`, 404)
    }
    return linha as unknown as Linha
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

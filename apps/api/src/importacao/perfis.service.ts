import { and, asc, eq, inArray, isNull, schema } from '@leadtogo/db'
import {
  type AlterarPerfilDeImportacaoEntrada,
  type CnaesConferidos,
  type CriarPerfilDeImportacaoEntrada,
  interpretarCnaes,
  type PerfilDeImportacao,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { diferencas, exigirAdmin } from '../cadastros/cadastros.base.js'
import { ErroApi } from '../http/erro-api.js'
import { ehViolacaoDeUnicidade } from '../http/sqlstate.js'

const { cnaes, importacaoPerfis, importacoes } = schema
type Linha = typeof importacaoPerfis.$inferSelect

const paraDto = (l: Linha): PerfilDeImportacao => ({
  id: l.id,
  nome: l.nome,
  exigeSituacaoAtiva: l.exigeSituacaoAtiva,
  estabelecimento: l.estabelecimento,
  excluirMei: l.excluirMei,
  cnaes: l.cnaes,
  aceitarCnaeSecundario: l.aceitarCnaeSecundario,
  acaoForaDoPerfil: l.acaoForaDoPerfil,
  ativo: l.ativo,
})

/**
 * Perfis de regras da importação (por empresa; nada fixo no código). Ler é de qualquer membro;
 * escrever, do administrador. Tudo passa pela transação da requisição (RLS) e vai para a auditoria.
 */
@Injectable()
export class PerfisDeImportacaoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(incluirInativos: boolean): Promise<PerfilDeImportacao[]> {
    const linhas = await this.ctx
      .db()
      .select()
      .from(importacaoPerfis)
      .where(
        and(
          isNull(importacaoPerfis.excluidoEm),
          incluirInativos ? undefined : eq(importacaoPerfis.ativo, true),
        ),
      )
      .orderBy(asc(importacaoPerfis.nome))
    return linhas.map(paraDto)
  }

  async criar(dados: CriarPerfilDeImportacaoEntrada): Promise<PerfilDeImportacao> {
    exigirAdmin(this.ctx)
    await this.exigirCnaesExistentes(dados.cnaes)
    const [linha] = await this.gravando(() =>
      this.ctx
        .db()
        .insert(importacaoPerfis)
        .values({
          ...dados,
          tenantId: this.ctx.tenantId,
          criadoPor: this.ctx.membro.id,
          atualizadoPor: this.ctx.membro.id,
        })
        .returning(),
    )
    if (!linha) throw new Error('INSERT de importacao_perfil sem retorno')
    await this.auditoria.registrar({
      entidade: 'importacao_perfil',
      entidadeId: linha.id,
      acao: 'criar',
      alteracoes: { ...dados, cnaes: dados.cnaes.length },
    })
    return paraDto(linha)
  }

  async alterar(id: string, dados: AlterarPerfilDeImportacaoEntrada): Promise<PerfilDeImportacao> {
    exigirAdmin(this.ctx)
    const atual = await this.achar(id)
    if (dados.cnaes) await this.exigirCnaesExistentes(dados.cnaes)
    const mudancas = diferencas(atual, dados)
    if (Object.keys(mudancas).length === 0) return paraDto(atual)
    const [linha] = await this.gravando(() =>
      this.ctx
        .db()
        .update(importacaoPerfis)
        .set({ ...dados, atualizadoPor: this.ctx.membro.id })
        .where(eq(importacaoPerfis.id, id))
        .returning(),
    )
    if (!linha) throw new Error('UPDATE de importacao_perfil sem retorno')
    // A lista de CNAEs pode ter centenas de códigos: a auditoria guarda só a quantidade antes e depois
    const resumo = { ...mudancas }
    if (resumo['cnaes']) resumo['cnaes'] = { de: atual.cnaes.length, para: linha.cnaes.length }
    await this.auditoria.registrar({
      entidade: 'importacao_perfil',
      entidadeId: id,
      acao: 'alterar',
      alteracoes: resumo,
    })
    return paraDto(linha)
  }

  /** Exclusão lógica. Só se exclui o que nunca foi usado: perfil de algum lote só se inativa. */
  async excluir(id: string): Promise<void> {
    exigirAdmin(this.ctx)
    const atual = await this.achar(id)
    const [usado] = await this.ctx
      .db()
      .select({ id: importacoes.id })
      .from(importacoes)
      .where(eq(importacoes.perfilId, id))
      .limit(1)
    if (usado) {
      throw new ErroApi(
        'perfil_em_uso',
        'Este perfil já foi usado em uma importação: só é possível inativá-lo.',
        409,
      )
    }
    await this.ctx
      .db()
      .update(importacaoPerfis)
      .set({ excluidoEm: new Date(), atualizadoPor: this.ctx.membro.id })
      .where(eq(importacaoPerfis.id, id))
    await this.auditoria.registrar({
      entidade: 'importacao_perfil',
      entidadeId: id,
      acao: 'excluir',
      alteracoes: { nome: atual.nome },
    })
  }

  /** Lê a lista colada e separa o que existe na tabela de CNAEs do que não existe (antes de salvar). */
  async conferirCnaes(texto: string): Promise<CnaesConferidos> {
    const { codigos, invalidos, repetidos } = interpretarCnaes(texto)
    const existentes = await this.descricoes(codigos)
    return {
      validos: codigos.flatMap((codigo) => {
        const descricao = existentes.get(codigo)
        return descricao === undefined ? [] : [{ codigo, descricao }]
      }),
      invalidos: [
        ...invalidos,
        ...codigos
          .filter((c) => !existentes.has(c))
          .map((c) => ({
            texto: String(c).padStart(7, '0'),
            motivo: 'não existe na tabela de CNAEs',
          })),
      ],
      repetidos,
    }
  }

  private async descricoes(codigos: number[]): Promise<Map<number, string>> {
    if (codigos.length === 0) return new Map()
    const linhas = await this.ctx
      .db()
      .select({ codigo: cnaes.codigo, descricao: cnaes.descricao })
      .from(cnaes)
      .where(inArray(cnaes.codigo, codigos))
    return new Map(linhas.map((l) => [l.codigo, l.descricao]))
  }

  private async exigirCnaesExistentes(codigos: number[]): Promise<void> {
    const existentes = await this.descricoes(codigos)
    const faltando = codigos.filter((c) => !existentes.has(c))
    if (faltando.length > 0) {
      throw new ErroApi(
        'cnaes_invalidos',
        `CNAE(s) que não existem na tabela: ${faltando.map((c) => String(c).padStart(7, '0')).join(', ')}.`,
        400,
        [{ campo: 'cnaes', mensagem: 'há códigos que não existem na tabela de CNAEs' }],
      )
    }
  }

  private async achar(id: string): Promise<Linha> {
    const [linha] = await this.ctx
      .db()
      .select()
      .from(importacaoPerfis)
      .where(and(eq(importacaoPerfis.id, id), isNull(importacaoPerfis.excluidoEm)))
    if (!linha) throw new ErroApi('item_nao_encontrado', 'Perfil não encontrado.', 404)
    return linha
  }

  /** Nome repetido (índice único parcial) vira 409 com código estável. */
  private async gravando<T>(operacao: () => Promise<T>): Promise<T> {
    try {
      return await operacao()
    } catch (erro) {
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ErroApi('nome_duplicado', 'Já existe um perfil com esse nome.', 409)
      }
      throw erro
    }
  }
}

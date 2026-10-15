import { DeleteObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { and, eq, isNull, schema } from '@leadtogo/db'
import {
  type AlterarLoteEntrada,
  type ConsultaDoEnvio,
  type FonteDosDados,
  HORAS_PARA_DESFAZER,
  LINHAS_DE_AMOSTRA,
  type LoteDeImportacao,
  type RegrasDeImportacao,
  sugerirMapeamento,
  validarMapeamento,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { diferencas } from '../cadastros/cadastros.base.js'
import { ErroApi } from '../http/erro-api.js'
import { ARMAZENAMENTO } from '../infra/infra.module.js'
import { lerPlanilha, type Planilha } from './planilha.js'

const {
  arquivos,
  importacaoLinhas,
  importacaoPerfis,
  importacoes,
  membros,
  origens,
  tagGrupos,
  tags,
  verticais,
} = schema
type Lote = typeof importacoes.$inferSelect

/** Quantas linhas da planilha vão por INSERT (o postgres.js limita os parâmetros de uma consulta). */
const LINHAS_POR_LOTE = 500

const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
} as const

/** Quem importa: administrador e gestor. O vendedor não leva carteira para outro nome (regra de carteira). */
function exigirQuemImporta(ctx: ContextoTenantService): void {
  if (ctx.membro.papel !== 'admin' && ctx.membro.papel !== 'gestor') {
    throw new ErroApi('acesso_negado', 'Só administradores e gestores importam planilhas.', 403)
  }
}

/** "Carteira 2026.xlsx" → "Carteira 2026" (o nome sugerido do lote). */
const semExtensao = (nome: string) => nome.replace(/\.[^./\\]+$/, '').trim() || nome

/** A chave do objeto no Garage: por empresa, nunca com o nome que o usuário mandou (sem caminho forjado). */
const chaveDoObjeto = (tenantId: string, arquivoId: string, formato: Planilha['formato']) =>
  `${tenantId}/importacao/${arquivoId}/original.${formato}`

const colunasDe = (lote: Lote): string[] =>
  (lote.mapeamento as { colunas?: string[] }).colunas ?? []
const camposDe = (lote: Lote): Record<string, string> =>
  (lote.mapeamento as { campos?: Record<string, string> }).campos ?? {}

/** O que falta para o lote poder ser importado (vazio = pronta). */
function pendenciasDe(lote: Lote, colunas: string[], campos: Record<string, string>): string[] {
  const pendencias = validarMapeamento(campos, colunas, lote.fonteDados).map((e) => e.mensagem)
  if (!lote.vendedorId) pendencias.push('Escolha o vendedor responsável pelas empresas.')
  if (!lote.statusTagId)
    pendencias.push('Escolha o Status das empresas (Cliente ou Lead, por exemplo).')
  return pendencias
}

/** Lotes de importação: envio e leitura da planilha, mapeamento e escolhas, antes de importar. */
@Injectable()
export class LotesDeImportacaoService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    @Inject(ARMAZENAMENTO) private readonly s3: S3Client,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {}

  /** Lê o arquivo, guarda o original no Garage e cria o lote (rascunho) com uma linha por registro. */
  async criar(consulta: ConsultaDoEnvio, corpo: unknown): Promise<LoteDeImportacao> {
    exigirQuemImporta(this.ctx)
    if (!Buffer.isBuffer(corpo) || corpo.length === 0) {
      throw new ErroApi(
        'arquivo_vazio',
        'Envie o arquivo no corpo da requisição (Content-Type: application/octet-stream).',
        400,
      )
    }
    const planilha = await lerPlanilha(corpo)

    const db = this.ctx.db()
    const tenantId = this.ctx.tenantId
    const membroId = this.ctx.membro.id
    const arquivoId = crypto.randomUUID()
    const chave = chaveDoObjeto(tenantId, arquivoId, planilha.formato)
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.config.S3_BUCKET,
          Key: chave,
          Body: corpo,
          ContentType: MIME[planilha.formato],
        }),
      )
    } catch {
      throw new ErroApi(
        'armazenamento_indisponivel',
        'Não foi possível guardar o arquivo agora. Tente de novo em instantes.',
        503,
      )
    }

    try {
      const [arquivo] = await db
        .insert(arquivos)
        .values({
          tenantId,
          chaveArquivo: chave,
          nome: consulta.arquivo,
          mime: MIME[planilha.formato],
          tamanho: corpo.length,
          entidadeTipo: 'importacao',
          enviadoPor: membroId,
        })
        .returning()
      if (!arquivo) throw new Error('INSERT de arquivo sem retorno')
      const [lote] = await db
        .insert(importacoes)
        .values({
          tenantId,
          tipo: consulta.tipo,
          nome: consulta.nome ?? semExtensao(consulta.arquivo),
          arquivoId: arquivo.id,
          nomeArquivo: consulta.arquivo,
          mapeamento: { colunas: planilha.colunas, campos: {} },
          totalLinhas: planilha.linhas.length,
          criadoPor: membroId,
          atualizadoPor: membroId,
        })
        .returning()
      if (!lote) throw new Error('INSERT de importacao sem retorno')
      await db.update(arquivos).set({ entidadeId: lote.id }).where(eq(arquivos.id, arquivo.id))

      for (let i = 0; i < planilha.linhas.length; i += LINHAS_POR_LOTE) {
        await db.insert(importacaoLinhas).values(
          planilha.linhas.slice(i, i + LINHAS_POR_LOTE).map((valores, j) => ({
            tenantId,
            importacaoId: lote.id,
            numero: i + j + 1,
            dados: Object.fromEntries(planilha.colunas.map((c, k) => [c, valores[k] ?? ''])),
          })),
        )
      }
      await this.auditoria.registrar({
        entidade: 'importacao',
        entidadeId: lote.id,
        acao: 'criar',
        alteracoes: { nomeArquivo: consulta.arquivo, linhas: planilha.linhas.length },
      })
      return this.paraDto(lote, planilha.colunas, planilha.linhas.slice(0, LINHAS_DE_AMOSTRA))
    } catch (e) {
      // O banco desfaz tudo (transação da requisição); o objeto no Garage não: tira o que sobrou
      await this.s3
        .send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: chave }))
        .catch(() => undefined)
      throw e
    }
  }

  /** O lote da empresa ativa, com a amostra lida do banco (o RLS esconde o de outra empresa: 404). */
  async detalhar(id: string): Promise<LoteDeImportacao> {
    exigirQuemImporta(this.ctx)
    const db = this.ctx.db()
    const lote = await this.achar(id)
    const colunas = colunasDe(lote)
    const amostra = await db
      .select({ dados: importacaoLinhas.dados })
      .from(importacaoLinhas)
      .where(eq(importacaoLinhas.importacaoId, id))
      .orderBy(importacaoLinhas.numero)
      .limit(LINHAS_DE_AMOSTRA)
    return this.paraDto(
      lote,
      colunas,
      amostra.map((l) => colunas.map((c) => (l.dados as Record<string, string>)[c] ?? '')),
    )
  }

  /**
   * Muda o que o usuário escolhe nos passos (mapeamento, fonte dos dados, perfil, intervalo e carteira).
   * O lote vira `pronta` quando não falta nada e volta a `rascunho` se algo deixar de valer.
   * Só lote em rascunho ou pronta se altera: depois de importar, o que foi feito fica registrado.
   */
  async alterar(id: string, dados: AlterarLoteEntrada): Promise<LoteDeImportacao> {
    exigirQuemImporta(this.ctx)
    const db = this.ctx.db()
    const atual = await this.achar(id)
    if (atual.situacao !== 'rascunho' && atual.situacao !== 'pronta') {
      throw new ErroApi(
        'importacao_nao_editavel',
        'Esta importação já foi iniciada: não dá mais para mudar as escolhas.',
        409,
      )
    }
    const colunas = colunasDe(atual)
    const campos = dados.campos ? limparCampos(dados.campos) : camposDe(atual)
    const fonteDados: FonteDosDados = dados.fonteDados ?? atual.fonteDados
    if (dados.campos) {
      const erros = validarMapeamento(campos, colunas, fonteDados).filter(
        // o que ainda falta aparece em `pendencias`; aqui só o que está errado no que veio
        (e) => !e.mensagem.startsWith('Indique a coluna'),
      )
      if (erros.length > 0) {
        throw new ErroApi(
          'mapeamento_invalido',
          erros[0]?.mensagem ?? 'Mapeamento inválido.',
          400,
          erros.map((e) => ({ campo: e.campo, mensagem: e.mensagem })),
        )
      }
    }

    const valores: Partial<typeof importacoes.$inferInsert> = {}
    if (dados.nome !== undefined) valores.nome = dados.nome
    if (dados.fonteDados !== undefined) valores.fonteDados = dados.fonteDados
    if (dados.intervaloMs !== undefined) valores.intervaloMs = dados.intervaloMs
    if (dados.campos) valores.mapeamento = { colunas, campos }
    if (dados.perfilId !== undefined) {
      valores.perfilId = dados.perfilId
      valores.regras = dados.perfilId ? await this.regrasDoPerfil(dados.perfilId) : null
    }
    if (dados.vendedorId !== undefined) {
      await this.exigir(
        db
          .select({ id: membros.id })
          .from(membros)
          .where(
            and(
              eq(membros.id, dados.vendedorId),
              eq(membros.ativo, true),
              isNull(membros.excluidoEm),
            ),
          ),
        'vendedorId',
        'Escolha um membro ativo da equipe.',
      )
      valores.vendedorId = dados.vendedorId
    }
    if (dados.statusTagId !== undefined) {
      await this.exigir(
        db
          .select({ id: tags.id })
          .from(tags)
          .innerJoin(tagGrupos, eq(tagGrupos.id, tags.tagGrupoId))
          .where(
            and(
              eq(tags.id, dados.statusTagId),
              eq(tagGrupos.chaveSistema, 'status'),
              eq(tags.ativo, true),
              isNull(tags.excluidoEm),
            ),
          ),
        'statusTagId',
        'Escolha uma tag ativa do grupo Status.',
      )
      valores.statusTagId = dados.statusTagId
    }
    if (dados.origemId) {
      await this.exigir(
        db
          .select({ id: origens.id })
          .from(origens)
          .where(
            and(
              eq(origens.id, dados.origemId),
              eq(origens.ativo, true),
              isNull(origens.excluidoEm),
            ),
          ),
        'origemId',
        'Escolha uma origem ativa.',
      )
    }
    if (dados.origemId !== undefined) valores.origemId = dados.origemId
    if (dados.verticalId) {
      await this.exigir(
        db
          .select({ id: verticais.id })
          .from(verticais)
          .where(
            and(
              eq(verticais.id, dados.verticalId),
              eq(verticais.ativo, true),
              isNull(verticais.excluidoEm),
            ),
          ),
        'verticalId',
        'Escolha uma vertical ativa.',
      )
    }
    if (dados.verticalId !== undefined) valores.verticalId = dados.verticalId

    const depois = { ...atual, ...valores }
    const pronta = pendenciasDe(depois, colunas, camposDe(depois)).length === 0
    valores.situacao = pronta ? 'pronta' : 'rascunho'

    const mudancas = diferencas(
      { ...atual, campos: camposDe(atual) },
      { ...valores, ...(dados.campos ? { campos } : {}), mapeamento: undefined, regras: undefined },
    )
    const [lote] = await db
      .update(importacoes)
      .set({ ...valores, atualizadoPor: this.ctx.membro.id })
      .where(eq(importacoes.id, id))
      .returning()
    if (!lote) throw new Error('UPDATE de importacao sem retorno')
    if (Object.keys(mudancas).length > 0) {
      await this.auditoria.registrar({
        entidade: 'importacao',
        entidadeId: id,
        acao: 'alterar',
        alteracoes: mudancas,
      })
    }
    return this.detalhar(id)
  }

  /** Cópia das regras do perfil no momento da escolha: mexer no perfil depois não muda o lote. */
  private async regrasDoPerfil(perfilId: string): Promise<RegrasDeImportacao> {
    const [p] = await this.ctx
      .db()
      .select()
      .from(importacaoPerfis)
      .where(
        and(
          eq(importacaoPerfis.id, perfilId),
          eq(importacaoPerfis.ativo, true),
          isNull(importacaoPerfis.excluidoEm),
        ),
      )
    if (!p) {
      throw new ErroApi('perfil_invalido', 'Escolha um perfil ativo ou "Sem regras".', 400, [
        { campo: 'perfilId', mensagem: 'Escolha um perfil ativo ou "Sem regras".' },
      ])
    }
    return {
      exigeSituacaoAtiva: p.exigeSituacaoAtiva,
      estabelecimento: p.estabelecimento,
      excluirMei: p.excluirMei,
      cnaes: p.cnaes,
      aceitarCnaeSecundario: p.aceitarCnaeSecundario,
      acaoForaDoPerfil: p.acaoForaDoPerfil,
    }
  }

  private async exigir(consulta: PromiseLike<unknown[]>, campo: string, mensagem: string) {
    const [achou] = await consulta
    if (!achou) throw new ErroApi('escolha_invalida', mensagem, 400, [{ campo, mensagem }])
  }

  private async achar(id: string): Promise<Lote> {
    const [lote] = await this.ctx.db().select().from(importacoes).where(eq(importacoes.id, id))
    if (!lote || lote.excluidoEm) {
      throw new ErroApi('importacao_nao_encontrada', 'Importação não encontrada.', 404)
    }
    return lote
  }

  private paraDto(lote: Lote, colunas: string[], amostra: string[][]): LoteDeImportacao {
    const campos = camposDe(lote)
    return {
      id: lote.id,
      nome: lote.nome,
      tipo: lote.tipo,
      nomeArquivo: lote.nomeArquivo,
      situacao: lote.situacao,
      totalLinhas: lote.totalLinhas,
      colunas,
      amostra: amostra.map((valores) =>
        Object.fromEntries(colunas.map((c, i) => [c, valores[i] ?? ''])),
      ),
      campos,
      sugestao: sugerirMapeamento(colunas),
      fonteDados: lote.fonteDados,
      intervaloMs: lote.intervaloMs,
      perfilId: lote.perfilId,
      vendedorId: lote.vendedorId,
      statusTagId: lote.statusTagId,
      origemId: lote.origemId,
      verticalId: lote.verticalId,
      pendencias: pendenciasDe(lote, colunas, campos),
      criadoEm: lote.criadoEm.toISOString(),
      concluidoEm: lote.concluidoEm?.toISOString() ?? null,
      desfazerAte:
        lote.situacao === 'concluida' && lote.concluidoEm
          ? new Date(lote.concluidoEm.getTime() + HORAS_PARA_DESFAZER * 3_600_000).toISOString()
          : null,
    }
  }
}

/** Tira o que veio vazio: coluna `null` ou em branco é "não mapear este campo". */
function limparCampos(campos: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(campos).filter(
      (e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== '',
    ),
  )
}

import { DeleteObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { eq, schema } from '@leadtogo/db'
import { type ConsultaDoEnvio, LINHAS_DE_AMOSTRA, type LoteDeImportacao } from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { ARMAZENAMENTO } from '../infra/infra.module.js'
import { lerPlanilha, type Planilha } from './planilha.js'

const { arquivos, importacoes, importacaoLinhas } = schema
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

/** Lotes de importação: envio e leitura da planilha, antes do mapeamento. */
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
    const [lote] = await db.select().from(importacoes).where(eq(importacoes.id, id))
    if (!lote || lote.excluidoEm) {
      throw new ErroApi('importacao_nao_encontrada', 'Importação não encontrada.', 404)
    }
    const colunas = (lote.mapeamento as { colunas?: string[] }).colunas ?? []
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

  private paraDto(lote: Lote, colunas: string[], amostra: string[][]): LoteDeImportacao {
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
      criadoEm: lote.criadoEm.toISOString(),
    }
  }
}

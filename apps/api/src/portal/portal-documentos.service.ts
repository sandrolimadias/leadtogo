import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { novoId, sql } from '@leadtogo/db'
import {
  type ConsultaDeDocumentosDoPortal,
  type DocumentoDoPortal,
  type DownloadDoDocumento,
  type ListaDeDocumentosDoPortal,
  VALIDADE_DO_DOWNLOAD_SEGUNDOS,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { criarClienteS3 } from '../infra/s3.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'

type ClienteParaAssinar = Parameters<typeof getSignedUrl>[0]

type LinhaDoDocumento = {
  id: string
  titulo: string
  descricao: string | null
  nome: string
  tamanho: number
  chave_arquivo: string
  criado_em: string | Date
}

const naoEncontrado = () =>
  new ErroApi('documento_nao_encontrado', 'Documento não encontrado.', 404)

/**
 * Documentos vistos e baixados pelo CLIENTE (Fase 3C). O banco só mostra documento limpo, visível e do alcance da
 * empresa da sessão (políticas restritivas); as consultas repetem a condição de propósito. Cada download fica
 * registrado (quem, de que empresa, quando) e a URL vale por 60 segundos.
 */
@Injectable()
export class PortalDocumentosService {
  private readonly assinador: S3Client

  constructor(
    private readonly ctx: ContextoTenantService,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {
    this.assinador = criarClienteS3({
      ...config,
      S3_ENDPOINT: config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT,
    })
  }

  private get visivel() {
    return sql`d.estado = 'limpo' AND d.enviado_em IS NOT NULL AND d.visivel_no_portal AND d.excluido_em IS NULL`
  }

  private paraDocumento(l: LinhaDoDocumento): DocumentoDoPortal {
    return {
      id: l.id,
      titulo: l.titulo,
      descricao: l.descricao,
      nome: l.nome,
      tamanho: Number(l.tamanho),
      publicadoEm: new Date(l.criado_em).toISOString(),
    }
  }

  async listar(c: ConsultaDeDocumentosDoPortal): Promise<ListaDeDocumentosDoPortal> {
    const db = this.ctx.db()
    const termo = c.busca ? `%${c.busca}%` : null
    const onde = sql`${this.visivel} AND ${
      termo
        ? sql`(lower(f_unaccent(d.titulo)) LIKE lower(f_unaccent(${termo})) OR lower(f_unaccent(coalesce(d.descricao, ''))) LIKE lower(f_unaccent(${termo})))`
        : sql`true`
    }`
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM documentos d WHERE ${onde}`,
    )
    const linhas = await db.execute<LinhaDoDocumento>(sql`
      SELECT d.id, d.titulo, d.descricao, d.nome, d.tamanho, d.chave_arquivo, d.criado_em
      FROM documentos d WHERE ${onde}
      ORDER BY d.criado_em DESC, d.id DESC LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    return { itens: [...linhas].map((l) => this.paraDocumento(l)), total: total?.n ?? 0 }
  }

  /** Registra o download e devolve a URL de 60 segundos (sempre como arquivo). */
  async baixar(id: string): Promise<DownloadDoDocumento> {
    const db = this.ctx.db()
    const [l] = await db.execute<LinhaDoDocumento>(sql`
      SELECT d.id, d.titulo, d.descricao, d.nome, d.tamanho, d.chave_arquivo, d.criado_em
      FROM documentos d WHERE d.id = ${id} AND ${this.visivel}`)
    if (!l) throw naoEncontrado()
    const { acessoId, empresaId, contatoId, tenantId } = this.ctx.portal
    await db.execute(sql`
      INSERT INTO documento_acessos (id, tenant_id, documento_id, acesso_id, empresa_id)
      VALUES (${novoId()}, ${tenantId}, ${id}, ${acessoId}, ${empresaId})`)
    await auditarAtoDoPortal(db, {
      tenantId,
      acessoId,
      contatoId,
      entidade: 'documento',
      entidadeId: id,
      acao: 'baixar',
      ip: this.ctx.ip,
    })
    const url = await getSignedUrl(
      this.assinador as unknown as ClienteParaAssinar,
      new GetObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: l.chave_arquivo,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(l.nome)}`,
        ResponseContentType: 'application/octet-stream',
      }),
      { expiresIn: VALIDADE_DO_DOWNLOAD_SEGUNDOS },
    )
    return {
      url,
      expiraEm: new Date(Date.now() + VALIDADE_DO_DOWNLOAD_SEGUNDOS * 1000).toISOString(),
    }
  }
}

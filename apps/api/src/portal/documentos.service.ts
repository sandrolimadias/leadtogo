import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { novoId, sql } from '@leadtogo/db'
import {
  type ConsultaDeDocumentos,
  type CriarDocumentoEntrada,
  type Documento,
  type DownloadDoDocumento,
  type EditarDocumentoEntrada,
  type EnvioDeDocumento,
  type ItemDeDocumento,
  type ListaDeBaixas,
  type ListaDeDocumentos,
  TAMANHO_MAXIMO_DO_DOCUMENTO,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { nomeDoArquivo } from '../chamados/anexos.service.js'
import { agendarVarreduraDeDocumento } from '../chamados/evento-anexo.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { tagsDoAlcance, trocarTagsDoAlcance } from './audiencia.js'
import { ARMAZENAMENTO } from '../infra/infra.module.js'
import { criarClienteS3 } from '../infra/s3.js'

type ClienteParaAssinar = Parameters<typeof getSignedUrl>[0]

const VALIDADE_DO_ENVIO_S = 15 * 60
const VALIDADE_DO_DOWNLOAD_S = 5 * 60
const MAXIMO_DE_BAIXAS_LISTADAS = 200

type LinhaDoDocumento = {
  id: string
  titulo: string
  descricao: string | null
  alcance: 'todos' | 'empresas' | 'tags'
  visivel_no_portal: boolean
  chave_arquivo: string
  nome: string
  mime: string
  tamanho: number
  estado: 'pendente_varredura' | 'limpo' | 'infectado'
  enviado_em: string | Date | null
  total_downloads: number
  criado_em: string | Date
  atualizado_em: string | Date
}

const naoEncontrado = () =>
  new ErroApi('documento_nao_encontrado', 'Documento não encontrado.', 404)
const COLUNAS = sql`
  d.id, d.titulo, d.descricao, d.alcance::text AS alcance, d.visivel_no_portal, d.chave_arquivo, d.nome, d.mime,
  d.tamanho, d.estado::text AS estado, d.enviado_em, d.total_downloads, d.criado_em, d.atualizado_em`

/**
 * Documentos do portal pela EQUIPE (`portal.documentos`). O arquivo vai DIRETO ao Garage por URL pré-assinada,
 * a API confere o objeto e o worker o varre no ClamAV (o mesmo caminho dos anexos dos chamados). Só se baixa o
 * que estiver "limpo"; o cliente só enxerga o limpo, visível e do alcance dele.
 */
@Injectable()
export class DocumentosService {
  private readonly assinador: S3Client

  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
    @Inject(ARMAZENAMENTO) private readonly s3: S3Client,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {
    this.assinador = criarClienteS3({
      ...config,
      S3_ENDPOINT: config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT,
    })
  }

  private exigirConfigurado() {
    if (!this.config.CLAMAV_HOST) {
      throw new ErroApi(
        'anexos_indisponiveis',
        'O envio de arquivos ainda não está configurado (antivírus).',
        503,
      )
    }
  }

  private paraItem(l: LinhaDoDocumento): ItemDeDocumento {
    return {
      id: l.id,
      titulo: l.titulo,
      descricao: l.descricao,
      alcance: l.alcance,
      visivelNoPortal: l.visivel_no_portal,
      arquivo: {
        nome: l.nome,
        mime: l.mime,
        tamanho: Number(l.tamanho),
        estado: l.estado,
        enviado: l.enviado_em !== null,
      },
      totalDownloads: Number(l.total_downloads),
      criadoEm: new Date(l.criado_em).toISOString(),
      atualizadoEm: new Date(l.atualizado_em).toISOString(),
    }
  }

  async listar(c: ConsultaDeDocumentos): Promise<ListaDeDocumentos> {
    const db = this.ctx.db()
    const termo = c.busca ? `%${c.busca}%` : null
    const onde = sql`d.excluido_em IS NULL AND ${
      termo
        ? sql`(lower(f_unaccent(d.titulo)) LIKE lower(f_unaccent(${termo})) OR lower(f_unaccent(d.nome)) LIKE lower(f_unaccent(${termo})))`
        : sql`true`
    }`
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM documentos d WHERE ${onde}`,
    )
    const linhas = await db.execute<LinhaDoDocumento>(sql`
      SELECT ${COLUNAS} FROM documentos d WHERE ${onde}
      ORDER BY d.criado_em DESC, d.id DESC LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    return { itens: [...linhas].map((l) => this.paraItem(l)), total: total?.n ?? 0 }
  }

  private async linha(id: string): Promise<LinhaDoDocumento> {
    const [l] = await this.ctx
      .db()
      .execute<LinhaDoDocumento>(
        sql`SELECT ${COLUNAS} FROM documentos d WHERE d.id = ${id} AND d.excluido_em IS NULL`,
      )
    if (!l) throw naoEncontrado()
    return l
  }

  async obter(id: string): Promise<Documento> {
    const l = await this.linha(id)
    const empresas = await this.ctx.db().execute<{ id: string; nome: string }>(sql`
      SELECT e.id, e.razao_social AS nome FROM documento_empresas de
      JOIN empresas e ON e.id = de.empresa_id WHERE de.documento_id = ${id} ORDER BY lower(e.razao_social)`)
    return {
      ...this.paraItem(l),
      empresas: [...empresas],
      tags: await tagsDoAlcance(this.ctx.db(), 'documento', id),
    }
  }

  private async trocarEmpresas(
    id: string,
    alcance: 'todos' | 'empresas' | 'tags',
    empresaIds: string[],
    tagIds: string[] = [],
  ): Promise<void> {
    const db = this.ctx.db()
    await db.execute(sql`DELETE FROM documento_empresas WHERE documento_id = ${id}`)
    await trocarTagsDoAlcance(db, 'documento', {
      itemId: id,
      tenantId: this.ctx.tenantId,
      alcance,
      tagIds,
      membroId: this.ctx.membro.id,
    })
    if (alcance !== 'empresas') return
    const unicas = [...new Set(empresaIds)]
    const validas = await db.execute<{ id: string }>(sql`
      SELECT id FROM empresas WHERE id = ANY (${`{${unicas.join(',')}}`}::uuid[]) AND excluido_em IS NULL`)
    if (validas.length !== unicas.length) {
      throw new ErroApi('empresa_invalida', 'Alguma empresa escolhida não existe.', 422)
    }
    for (const empresaId of unicas) {
      await db.execute(sql`
        INSERT INTO documento_empresas (id, tenant_id, documento_id, empresa_id)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${id}, ${empresaId})`)
    }
  }

  /** Passo 1: cadastra o documento, reserva o arquivo e devolve a URL para o navegador enviá-lo ao Garage. */
  async criar(d: CriarDocumentoEntrada): Promise<EnvioDeDocumento> {
    this.exigirConfigurado()
    const id = novoId()
    const chave = `${this.ctx.tenantId}/documentos/${id}`
    const eu = this.ctx.membro.id
    await this.ctx.db().execute(sql`
      INSERT INTO documentos (id, tenant_id, titulo, descricao, alcance, chave_arquivo, nome, mime, tamanho,
        criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${d.titulo}, ${d.descricao}, ${d.alcance}::alcance_documento, ${chave},
        ${nomeDoArquivo(d.arquivo.nome)}, ${d.arquivo.mime}, ${d.arquivo.tamanho}, ${eu}, ${eu})`)
    await this.trocarEmpresas(id, d.alcance, d.empresaIds, d.tagIds)
    await this.auditoria.registrar({
      entidade: 'documento',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { titulo: d.titulo, alcance: d.alcance, nome: d.arquivo.nome },
    })
    const url = await getSignedUrl(
      this.assinador as unknown as ClienteParaAssinar,
      new PutObjectCommand({ Bucket: this.config.S3_BUCKET, Key: chave }),
      { expiresIn: VALIDADE_DO_ENVIO_S },
    )
    return {
      documento: await this.obter(id),
      envio: {
        url,
        cabecalhos: {},
        expiraEm: new Date(Date.now() + VALIDADE_DO_ENVIO_S * 1000).toISOString(),
      },
    }
  }

  /**
   * Passo 2 (rota sob demanda): o navegador terminou o PUT. Confere o objeto no Garage (existe e tem o tamanho
   * dito) e manda o worker varrer. Idempotente. Objeto fora do combinado é apagado e o documento descartado.
   */
  async confirmar(id: string): Promise<Documento> {
    this.exigirConfigurado()
    const a = await this.ctx.transacao(() => this.linha(id))
    if (a.enviado_em !== null) return this.ctx.transacao(() => this.obter(id))

    let tamanhoNoGarage: number | undefined
    try {
      const cabecalho = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.config.S3_BUCKET, Key: a.chave_arquivo }),
      )
      tamanhoNoGarage = cabecalho.ContentLength
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404 || (e as { name?: string }).name === 'NotFound') {
        throw new ErroApi('anexo_nao_enviado', 'O arquivo ainda não chegou ao armazenamento.', 409)
      }
      throw new ErroApi(
        'armazenamento_indisponivel',
        'Não foi possível conferir o arquivo agora. Tente de novo em instantes.',
        503,
      )
    }
    if (tamanhoNoGarage !== Number(a.tamanho) || tamanhoNoGarage > TAMANHO_MAXIMO_DO_DOCUMENTO) {
      await this.s3
        .send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: a.chave_arquivo }))
        .catch(() => undefined)
      await this.ctx.transacao(() =>
        this.ctx.db().execute(sql`
          UPDATE documentos SET excluido_em = now(), atualizado_em = now() WHERE id = ${id}`),
      )
      throw new ErroApi(
        'anexo_invalido',
        'O arquivo enviado não tem o tamanho informado: envie de novo.',
        400,
      )
    }
    return this.ctx.transacao(async () => {
      const db = this.ctx.db()
      const [atualizado] = await db.execute<{ id: string }>(sql`
        UPDATE documentos SET enviado_em = coalesce(enviado_em, now()), atualizado_em = now()
        WHERE id = ${id} AND enviado_em IS NULL RETURNING id`)
      if (atualizado) await agendarVarreduraDeDocumento(db, this.ctx.tenantId, id)
      return this.obter(id)
    })
  }

  async editar(id: string, d: EditarDocumentoEntrada): Promise<Documento> {
    const antes = await this.linha(id)
    const db = this.ctx.db()
    await db.execute(sql`
      UPDATE documentos SET
        titulo = ${d.titulo ?? antes.titulo},
        descricao = ${d.descricao === undefined ? antes.descricao : d.descricao || null},
        alcance = ${d.alcance ?? antes.alcance}::alcance_documento,
        visivel_no_portal = ${d.visivelNoPortal ?? antes.visivel_no_portal},
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    if (d.alcance !== undefined)
      await this.trocarEmpresas(id, d.alcance, d.empresaIds ?? [], d.tagIds ?? [])
    await this.auditoria.registrar({
      entidade: 'documento',
      entidadeId: id,
      acao: 'editar',
      alteracoes: {
        ...(d.titulo !== undefined ? { titulo: d.titulo } : {}),
        ...(d.alcance !== undefined ? { alcance: d.alcance } : {}),
        ...(d.visivelNoPortal !== undefined ? { visivelNoPortal: d.visivelNoPortal } : {}),
      },
    })
    return this.obter(id)
  }

  async excluir(id: string): Promise<void> {
    const feito = await this.ctx.db().execute(sql`
      UPDATE documentos SET excluido_em = now(), atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id} AND excluido_em IS NULL RETURNING id`)
    if (feito.length === 0) throw naoEncontrado()
    await this.auditoria.registrar({ entidade: 'documento', entidadeId: id, acao: 'excluir' })
  }

  /** Download pela equipe (5 minutos, sempre como arquivo). Só o "limpo". */
  async baixar(id: string): Promise<DownloadDoDocumento> {
    const l = await this.linha(id)
    if (l.estado === 'infectado') {
      throw new ErroApi('anexo_bloqueado', 'Este arquivo foi bloqueado pelo antivírus.', 409)
    }
    if (l.estado !== 'limpo') {
      throw new ErroApi(
        'anexo_em_verificacao',
        'Este arquivo ainda está sendo verificado pelo antivírus. Tente em instantes.',
        409,
      )
    }
    const url = await getSignedUrl(
      this.assinador as unknown as ClienteParaAssinar,
      new GetObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: l.chave_arquivo,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(l.nome)}`,
        ResponseContentType: 'application/octet-stream',
      }),
      { expiresIn: VALIDADE_DO_DOWNLOAD_S },
    )
    return { url, expiraEm: new Date(Date.now() + VALIDADE_DO_DOWNLOAD_S * 1000).toISOString() }
  }

  /** Quem baixou, de que empresa e quando (os mais recentes). */
  async baixas(id: string): Promise<ListaDeBaixas> {
    await this.linha(id)
    const db = this.ctx.db()
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM documento_acessos WHERE documento_id = ${id}`,
    )
    const linhas = await db.execute<{
      pessoa: string
      empresa: string
      baixado_em: string | Date
    }>(sql`
      SELECT c.nome AS pessoa, e.razao_social AS empresa, da.baixado_em
      FROM documento_acessos da
      JOIN portal_acessos pa ON pa.id = da.acesso_id
      JOIN contatos c ON c.id = pa.contato_id
      JOIN empresas e ON e.id = da.empresa_id
      WHERE da.documento_id = ${id}
      ORDER BY da.baixado_em DESC, da.id DESC LIMIT ${MAXIMO_DE_BAIXAS_LISTADAS}`)
    return {
      itens: [...linhas].map((l) => ({
        pessoa: l.pessoa,
        empresa: l.empresa,
        baixadoEm: new Date(l.baixado_em).toISOString(),
      })),
      total: total?.n ?? 0,
    }
  }
}

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
  type DownloadDeAnexo,
  type EnvioDeAnexo,
  type PedirEnvioDeAnexoEntrada,
  MAXIMO_DE_ANEXOS_POR_MENSAGEM,
  TAMANHO_MAXIMO_DO_ANEXO,
  VALIDADE_DO_DOWNLOAD_SEGUNDOS,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { nomeDoArquivo } from '../chamados/anexos.service.js'
import { agendarVarredura } from '../chamados/evento-anexo.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { ARMAZENAMENTO } from '../infra/infra.module.js'
import { criarClienteS3 } from '../infra/s3.js'

type ClienteParaAssinar = Parameters<typeof getSignedUrl>[0]

const VALIDADE_DO_ENVIO_S = 15 * 60
const MAXIMO_DE_SOLTOS = MAXIMO_DE_ANEXOS_POR_MENSAGEM * 2

const naoEncontrado = () => new ErroApi('anexo_nao_encontrado', 'Anexo não encontrado.', 404)

type LinhaDoAnexo = {
  id: string
  chave_arquivo: string
  nome: string
  tamanho: number
  estado: 'pendente_varredura' | 'limpo' | 'infectado'
  enviado_em: string | null
}

/**
 * Anexos pelo CLIENTE: o mesmo caminho da equipe (envio direto ao Garage por URL pré-assinada, varredura do
 * ClamAV, só baixa o que estiver "limpo"), mas o dono do arquivo é o contato da sessão e o download vale
 * por 60 segundos. O cliente só mexe nos próprios envios e só baixa anexos de chamados da própria empresa.
 */
@Injectable()
export class PortalAnexosService {
  private readonly assinador: S3Client

  constructor(
    private readonly ctx: ContextoTenantService,
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
      throw new ErroApi('anexos_indisponiveis', 'O envio de anexos ainda não está disponível.', 503)
    }
  }

  /** O chamado precisa ser da empresa do cliente, de origem portal e estar aberto para receber anexo. */
  private async chamadoAberto(chamadoId: string): Promise<void> {
    const [c] = await this.ctx.db().execute<{ status: string }>(sql`
      SELECT status::text AS status FROM chamados
      WHERE id = ${chamadoId} AND empresa_cliente_id = ${this.ctx.portal.empresaId} AND origem = 'portal'
        AND excluido_em IS NULL`)
    if (!c) throw new ErroApi('chamado_nao_encontrado', 'Chamado não encontrado.', 404)
    if (c.status === 'fechado' || c.status === 'resolvido') {
      throw new ErroApi('chamado_encerrado', 'Este chamado não recebe mais anexos.', 409)
    }
  }

  async pedirEnvio(chamadoId: string, dados: PedirEnvioDeAnexoEntrada): Promise<EnvioDeAnexo> {
    this.exigirConfigurado()
    await this.chamadoAberto(chamadoId)
    const db = this.ctx.db()
    const p = this.ctx.portal
    const [soltos] = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM chamado_anexos
      WHERE chamado_id = ${chamadoId} AND mensagem_id IS NULL AND enviado_por_contato_id = ${p.contatoId}
        AND excluido_em IS NULL AND criado_em > now() - interval '1 day'`)
    if ((soltos?.n ?? 0) >= MAXIMO_DE_SOLTOS) {
      throw new ErroApi(
        'anexos_demais',
        'Há anexos demais esperando uma mensagem: envie a mensagem ou aguarde.',
        409,
      )
    }
    const id = novoId()
    const chave = `${p.tenantId}/chamados/${chamadoId}/${id}`
    await db.execute(sql`
      INSERT INTO chamado_anexos (id, tenant_id, chamado_id, chave_arquivo, nome, mime, tamanho, enviado_por_contato_id)
      VALUES (${id}, ${p.tenantId}, ${chamadoId}, ${chave}, ${nomeDoArquivo(dados.nome)}, ${dados.mime},
        ${dados.tamanho}, ${p.contatoId})`)
    const url = await getSignedUrl(
      this.assinador as unknown as ClienteParaAssinar,
      new PutObjectCommand({ Bucket: this.config.S3_BUCKET, Key: chave }),
      { expiresIn: VALIDADE_DO_ENVIO_S },
    )
    return {
      anexoId: id,
      url,
      cabecalhos: {},
      expiraEm: new Date(Date.now() + VALIDADE_DO_ENVIO_S * 1000).toISOString(),
    }
  }

  /** Rota sob demanda: o Garage fica fora da transação (a espera não segura conexão do banco). */
  async confirmar(chamadoId: string, anexoId: string): Promise<{ id: string; estado: string }> {
    this.exigirConfigurado()
    const a = await this.ctx.transacao(async () => {
      await this.chamadoAberto(chamadoId)
      const [a] = await this.ctx.db().execute<LinhaDoAnexo>(sql`
        SELECT id, chave_arquivo, nome, tamanho, estado::text AS estado, enviado_em FROM chamado_anexos
        WHERE id = ${anexoId} AND chamado_id = ${chamadoId} AND excluido_em IS NULL
          AND enviado_por_contato_id = ${this.ctx.portal.contatoId}`)
      if (!a) throw naoEncontrado()
      return a
    })
    if (a.enviado_em !== null) return { id: a.id, estado: a.estado }

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
    if (tamanhoNoGarage !== Number(a.tamanho) || tamanhoNoGarage > TAMANHO_MAXIMO_DO_ANEXO) {
      await this.s3
        .send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: a.chave_arquivo }))
        .catch(() => undefined)
      await this.ctx.transacao(() =>
        this.ctx.db().execute(sql`
          UPDATE chamado_anexos SET excluido_em = now(), atualizado_em = now() WHERE id = ${anexoId}`),
      )
      throw new ErroApi(
        'anexo_invalido',
        'O arquivo enviado não tem o tamanho informado: envie de novo.',
        400,
      )
    }
    return this.ctx.transacao(async () => {
      const db = this.ctx.db()
      const [atualizado] = await db.execute<{ id: string; estado: string }>(sql`
        UPDATE chamado_anexos SET enviado_em = coalesce(enviado_em, now()), atualizado_em = now()
        WHERE id = ${anexoId} AND enviado_em IS NULL RETURNING id, estado::text AS estado`)
      if (!atualizado) return { id: a.id, estado: a.estado }
      await agendarVarredura(db, this.ctx.tenantId, anexoId)
      return atualizado
    })
  }

  /** Só baixa anexo já ligado a uma mensagem e "limpo", de chamado da própria empresa. */
  async baixar(chamadoId: string, anexoId: string): Promise<DownloadDeAnexo> {
    const db = this.ctx.db()
    const [a] = await db.execute<LinhaDoAnexo>(sql`
      SELECT a.id, a.chave_arquivo, a.nome, a.tamanho, a.estado::text AS estado, a.enviado_em
      FROM chamado_anexos a JOIN chamados c ON c.id = a.chamado_id
      WHERE a.id = ${anexoId} AND a.chamado_id = ${chamadoId} AND a.excluido_em IS NULL
        AND a.mensagem_id IS NOT NULL
        AND c.empresa_cliente_id = ${this.ctx.portal.empresaId} AND c.origem = 'portal'`)
    if (!a) throw naoEncontrado()
    if (a.estado === 'infectado') {
      throw new ErroApi('anexo_bloqueado', 'Este arquivo foi bloqueado pelo antivírus.', 409)
    }
    if (a.estado !== 'limpo') {
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
        Key: a.chave_arquivo,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
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

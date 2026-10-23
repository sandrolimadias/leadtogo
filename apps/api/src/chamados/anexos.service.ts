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
  type AnexoDoChamado,
  type DownloadDeAnexo,
  type EnvioDeAnexo,
  type PedirEnvioDeAnexoEntrada,
  MAXIMO_DE_ANEXOS_POR_MENSAGEM,
  TAMANHO_MAXIMO_DO_ANEXO,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { ARMAZENAMENTO } from '../infra/infra.module.js'
import { criarClienteS3 } from '../infra/s3.js'
import { AcessoDeChamados } from './acesso-chamados.js'
import { ChamadosService } from './chamados.service.js'
import { agendarVarredura } from './evento-anexo.js'

/**
 * O assinador e o cliente do Garage vêm de cópias diferentes dos tipos do Smithy (versões lado a lado no
 * pnpm); em tempo de execução são o mesmo contrato.
 */
type ClienteParaAssinar = Parameters<typeof getSignedUrl>[0]

/** Validade da URL de envio e da de download, em segundos. */
const VALIDADE_DO_ENVIO_S = 15 * 60
const VALIDADE_DO_DOWNLOAD_S = 5 * 60
/** Quantos anexos soltos (enviados mas ainda sem mensagem) cada pessoa pode ter por chamado. */
const MAXIMO_DE_SOLTOS = MAXIMO_DE_ANEXOS_POR_MENSAGEM * 2

type LinhaDoAnexo = {
  id: string
  chamado_id: string
  mensagem_id: string | null
  chave_arquivo: string
  nome: string
  mime: string
  tamanho: number
  estado: AnexoDoChamado['estado']
  enviado_em: string | null
  enviado_por_membro_id: string | null
  criado_em: string
}

const naoEncontrado = () => new ErroApi('anexo_nao_encontrado', 'Anexo não encontrado.', 404)

/** Nome seguro para exibir e para o download: sem caminho, sem controle, até 200 caracteres. */
export function nomeDoArquivo(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const limpo = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim()
  return (limpo || 'arquivo').slice(0, 200)
}

/**
 * Anexos dos chamados (Fase 2). O arquivo vai DIRETO ao Garage por URL pré-assinada (a API não carrega os
 * bytes), a API confere o objeto e o worker o varre no ClamAV. Só se baixa o que estiver "limpo"; o
 * "infectado" fica bloqueado para sempre. O bucket é privado: o download também é por URL assinada, curta e
 * como anexo (nunca abre dentro do navegador).
 */
@Injectable()
export class AnexosService {
  private readonly assinador: S3Client

  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly acesso: AcessoDeChamados,
    private readonly chamados: ChamadosService,
    @Inject(ARMAZENAMENTO) private readonly s3: S3Client,
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
  ) {
    // Só assina (nenhuma chamada de rede): o endereço é o que o navegador alcança
    this.assinador = criarClienteS3({
      ...config,
      S3_ENDPOINT: config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT,
    })
  }

  private exigirConfigurado() {
    if (!this.config.CLAMAV_HOST) {
      throw new ErroApi(
        'anexos_indisponiveis',
        'O envio de anexos ainda não está configurado (antivírus).',
        503,
      )
    }
  }

  private paraAnexo(a: LinhaDoAnexo): AnexoDoChamado {
    return {
      id: a.id,
      nome: a.nome,
      mime: a.mime,
      tamanho: Number(a.tamanho),
      estado: a.estado,
      criadoEm: new Date(a.criado_em).toISOString(),
    }
  }

  /** Passo 1: reserva o anexo e devolve a URL para o navegador enviar o arquivo ao Garage. */
  async pedirEnvio(chamadoId: string, dados: PedirEnvioDeAnexoEntrada): Promise<EnvioDeAnexo> {
    this.exigirConfigurado()
    const l = await this.chamados.linhaVisivel(chamadoId)
    if (!(await this.acesso.podeResponder(this.chamados.paraAcesso(l)))) {
      throw new ErroApi('acesso_negado', 'Você não pode anexar arquivos neste chamado.', 403)
    }
    const db = this.ctx.db()
    const eu = this.ctx.membro.id
    const [soltos] = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM chamado_anexos
      WHERE chamado_id = ${chamadoId} AND mensagem_id IS NULL AND enviado_por_membro_id = ${eu}
        AND excluido_em IS NULL AND criado_em > now() - interval '1 day'`)
    if ((soltos?.n ?? 0) >= MAXIMO_DE_SOLTOS) {
      throw new ErroApi(
        'anexos_demais',
        'Há anexos demais esperando uma mensagem: envie a mensagem ou aguarde.',
        409,
      )
    }
    const id = novoId()
    const chave = `${this.ctx.tenantId}/chamados/${chamadoId}/${id}`
    await db.execute(sql`
      INSERT INTO chamado_anexos (id, tenant_id, chamado_id, chave_arquivo, nome, mime, tamanho,
        enviado_por_membro_id, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${chamadoId}, ${chave}, ${nomeDoArquivo(dados.nome)}, ${dados.mime},
        ${dados.tamanho}, ${eu}, ${eu}, ${eu})`)
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

  /**
   * Passo 2: o navegador terminou o PUT. Confere o objeto no Garage (existe e tem o tamanho dito) e manda o
   * worker varrer. Idempotente. Objeto fora do combinado é apagado e o anexo descartado.
   */
  async confirmar(chamadoId: string, anexoId: string): Promise<AnexoDoChamado> {
    this.exigirConfigurado()
    const a = await this.ctx.transacao(async () => {
      const l = await this.chamados.linhaVisivel(chamadoId)
      if (!(await this.acesso.podeResponder(this.chamados.paraAcesso(l)))) {
        throw new ErroApi('acesso_negado', 'Você não pode anexar arquivos neste chamado.', 403)
      }
      const [a] = await this.ctx.db().execute<LinhaDoAnexo>(sql`
        SELECT id, chamado_id, mensagem_id, chave_arquivo, nome, mime, tamanho, estado, enviado_em,
          enviado_por_membro_id, criado_em
        FROM chamado_anexos
        WHERE id = ${anexoId} AND chamado_id = ${chamadoId} AND excluido_em IS NULL
          AND enviado_por_membro_id = ${this.ctx.membro.id}`)
      if (!a) throw naoEncontrado()
      return a
    })
    if (a.enviado_em !== null) return this.paraAnexo(a)

    // O Garage fica fora da transação: a espera não segura conexão do banco
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
      const [atualizado] = await db.execute<LinhaDoAnexo>(sql`
        UPDATE chamado_anexos SET enviado_em = coalesce(enviado_em, now()), atualizado_em = now()
        WHERE id = ${anexoId} AND enviado_em IS NULL
        RETURNING id, chamado_id, mensagem_id, chave_arquivo, nome, mime, tamanho, estado, enviado_em,
          enviado_por_membro_id, criado_em`)
      if (!atualizado) return this.paraAnexo(a)
      await agendarVarredura(db, this.ctx.tenantId, anexoId)
      return this.paraAnexo(atualizado)
    })
  }

  /** URL de download, só de anexo já ligado a uma mensagem e "limpo". */
  async baixar(chamadoId: string, anexoId: string): Promise<DownloadDeAnexo> {
    await this.chamados.linhaVisivel(chamadoId)
    const [a] = await this.ctx.db().execute<LinhaDoAnexo>(sql`
      SELECT id, chamado_id, mensagem_id, chave_arquivo, nome, mime, tamanho, estado, enviado_em,
        enviado_por_membro_id, criado_em
      FROM chamado_anexos
      WHERE id = ${anexoId} AND chamado_id = ${chamadoId} AND excluido_em IS NULL AND mensagem_id IS NOT NULL`)
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
        // Sempre como download, nunca dentro do navegador
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
        ResponseContentType: 'application/octet-stream',
      }),
      { expiresIn: VALIDADE_DO_DOWNLOAD_S },
    )
    return { url, expiraEm: new Date(Date.now() + VALIDADE_DO_DOWNLOAD_S * 1000).toISOString() }
  }
}

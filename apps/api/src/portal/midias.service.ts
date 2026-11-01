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
  type AdicionarImagemEntrada,
  type AdicionarVideoEntrada,
  type EnvioDeImagem,
  extrairVideo,
  MAXIMO_DE_MIDIAS_POR_PUBLICACAO,
  type MidiaDaPublicacao,
  type MidiaDoPortal,
  TAMANHO_MAXIMO_DA_IMAGEM,
} from '@leadtogo/shared'
import { Inject, Injectable } from '@nestjs/common'

import type { Transacao } from '../acesso/contexto-tenant.service.js'
import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { nomeDoArquivo } from '../chamados/anexos.service.js'
import { agendarVarreduraDeMidia } from '../chamados/evento-anexo.js'
import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { ErroApi } from '../http/erro-api.js'
import { ARMAZENAMENTO } from '../infra/infra.module.js'
import { criarClienteS3 } from '../infra/s3.js'

type ClienteParaAssinar = Parameters<typeof getSignedUrl>[0]
const VALIDADE_DO_ENVIO_S = 15 * 60
/** A imagem no feed vale 10 minutos (o portal busca de novo ao recarregar) */
const VALIDADE_DA_LEITURA_S = 10 * 60

type LinhaDaMidia = {
  id: string
  publicacao_id: string
  tipo: 'imagem' | 'video'
  ordem: number
  legenda: string | null
  texto_alternativo: string | null
  chave_arquivo: string | null
  nome: string | null
  mime: string | null
  tamanho: number | string | null
  estado: 'pendente_varredura' | 'limpo' | 'infectado'
  enviado_em: string | Date | null
  video_provedor: 'youtube' | 'vimeo' | null
  video_id: string | null
}

const COLUNAS = sql`
  m.id, m.publicacao_id, m.tipo::text AS tipo, m.ordem, m.legenda, m.texto_alternativo, m.chave_arquivo, m.nome,
  m.mime, m.tamanho, m.estado::text AS estado, m.enviado_em, m.video_provedor::text AS video_provedor, m.video_id`

const naoEncontrada = () => new ErroApi('nao_encontrada', 'Mídia não encontrada.', 404)

/**
 * Imagens e vídeo das publicações (Fase 4D, B-3). A imagem segue o caminho dos documentos: o navegador envia
 * direto ao Garage por URL pré-assinada, a API confere o objeto e o worker varre no ClamAV; só a "limpa" aparece
 * ao cliente. O vídeo guarda só o provedor e o ID (o portal monta o embed sem cookies).
 */
@Injectable()
export class MidiasService {
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

  private async urlDeLeitura(chave: string, mime: string | null): Promise<string> {
    return getSignedUrl(
      this.assinador as unknown as ClienteParaAssinar,
      new GetObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: chave,
        ResponseContentType: mime ?? 'application/octet-stream',
      }),
      { expiresIn: VALIDADE_DA_LEITURA_S },
    )
  }

  private async paraMidia(l: LinhaDaMidia): Promise<MidiaDaPublicacao> {
    const limpa = l.tipo === 'imagem' && l.estado === 'limpo' && l.enviado_em !== null
    return {
      id: l.id,
      tipo: l.tipo,
      ordem: l.ordem,
      legenda: l.legenda,
      textoAlternativo: l.texto_alternativo,
      imagem:
        l.tipo === 'imagem'
          ? {
              nome: l.nome ?? '',
              tamanho: Number(l.tamanho ?? 0),
              estado: l.estado,
              enviada: l.enviado_em !== null,
              url:
                limpa && l.chave_arquivo ? await this.urlDeLeitura(l.chave_arquivo, l.mime) : null,
            }
          : null,
      video:
        l.tipo === 'video' && l.video_provedor && l.video_id
          ? { provedor: l.video_provedor, id: l.video_id }
          : null,
    }
  }

  /** As mídias de uma publicação, como a equipe vê. */
  async daPublicacao(db: Transacao, publicacaoId: string): Promise<MidiaDaPublicacao[]> {
    const linhas = await db.execute<LinhaDaMidia>(sql`
      SELECT ${COLUNAS} FROM publicacao_midias m
      WHERE m.publicacao_id = ${publicacaoId} AND m.excluido_em IS NULL ORDER BY m.ordem, m.criado_em`)
    return Promise.all(linhas.map((l) => this.paraMidia(l)))
  }

  /**
   * As mídias de várias publicações para o CLIENTE: o banco já só entrega vídeo e imagem limpa de publicação que
   * ele enxerga.
   */
  async doPortal(db: Transacao, ids: string[]): Promise<Map<string, MidiaDoPortal[]>> {
    const mapa = new Map<string, MidiaDoPortal[]>()
    if (ids.length === 0) return mapa
    const linhas = await db.execute<LinhaDaMidia>(sql`
      SELECT ${COLUNAS} FROM publicacao_midias m
      WHERE m.publicacao_id = ANY (${`{${ids.join(',')}}`}::uuid[]) AND m.excluido_em IS NULL
      ORDER BY m.ordem, m.criado_em`)
    for (const l of linhas) {
      if (l.tipo === 'imagem' && (l.estado !== 'limpo' || !l.chave_arquivo)) continue
      const m: MidiaDoPortal = {
        id: l.id,
        tipo: l.tipo,
        legenda: l.legenda,
        textoAlternativo: l.texto_alternativo,
        imagemUrl:
          l.tipo === 'imagem' && l.chave_arquivo
            ? await this.urlDeLeitura(l.chave_arquivo, l.mime)
            : null,
        video:
          l.tipo === 'video' && l.video_provedor && l.video_id
            ? { provedor: l.video_provedor, id: l.video_id }
            : null,
      }
      mapa.set(l.publicacao_id, [...(mapa.get(l.publicacao_id) ?? []), m])
    }
    return mapa
  }

  private async proximaOrdem(publicacaoId: string): Promise<number> {
    const db = this.ctx.db()
    const [p] = await db.execute(sql`
      SELECT 1 FROM publicacoes WHERE id = ${publicacaoId} AND excluido_em IS NULL FOR UPDATE`)
    if (!p) throw new ErroApi('nao_encontrada', 'Publicação não encontrada.', 404)
    const [n] = await db.execute<{ total: number; maior: number | null }>(sql`
      SELECT count(*)::int AS total, max(ordem) AS maior FROM publicacao_midias
      WHERE publicacao_id = ${publicacaoId} AND excluido_em IS NULL`)
    if ((n?.total ?? 0) >= MAXIMO_DE_MIDIAS_POR_PUBLICACAO) {
      throw new ErroApi(
        'limite_de_midias',
        `Cada publicação tem no máximo ${MAXIMO_DE_MIDIAS_POR_PUBLICACAO} imagens e vídeos.`,
        409,
      )
    }
    return (n?.maior ?? -1) + 1
  }

  private async linha(publicacaoId: string, midiaId: string): Promise<LinhaDaMidia> {
    const [l] = await this.ctx.db().execute<LinhaDaMidia>(sql`
      SELECT ${COLUNAS} FROM publicacao_midias m
      WHERE m.id = ${midiaId} AND m.publicacao_id = ${publicacaoId} AND m.excluido_em IS NULL`)
    if (!l) throw naoEncontrada()
    return l
  }

  /** Vídeo do YouTube ou do Vimeo: guarda só o provedor e o ID. */
  async adicionarVideo(publicacaoId: string, d: AdicionarVideoEntrada): Promise<MidiaDaPublicacao> {
    const video = extrairVideo(d.url)
    if (!video) throw new ErroApi('video_invalido', 'Use um link do YouTube ou do Vimeo.', 422)
    const ordem = await this.proximaOrdem(publicacaoId)
    const id = novoId()
    const eu = this.ctx.membro.id
    await this.ctx.db().execute(sql`
      INSERT INTO publicacao_midias (id, tenant_id, publicacao_id, tipo, ordem, legenda, video_provedor, video_id,
        criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${publicacaoId}, 'video', ${ordem}, ${d.legenda},
        ${video.provedor}::provedor_video, ${video.id}, ${eu}, ${eu})`)
    await this.auditoria.registrar({
      entidade: 'publicacao',
      entidadeId: publicacaoId,
      acao: 'midia_adicionada',
      alteracoes: { tipo: 'video', provedor: video.provedor, videoId: video.id },
    })
    return this.paraMidia(await this.linha(publicacaoId, id))
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

  /** Passo 1 da imagem: reserva o arquivo e devolve a URL de envio direto ao Garage. */
  async adicionarImagem(publicacaoId: string, d: AdicionarImagemEntrada): Promise<EnvioDeImagem> {
    this.exigirConfigurado()
    const ordem = await this.proximaOrdem(publicacaoId)
    const id = novoId()
    const chave = `${this.ctx.tenantId}/publicacoes/${publicacaoId}/${id}`
    const eu = this.ctx.membro.id
    await this.ctx.db().execute(sql`
      INSERT INTO publicacao_midias (id, tenant_id, publicacao_id, tipo, ordem, legenda, texto_alternativo,
        chave_arquivo, nome, mime, tamanho, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${publicacaoId}, 'imagem', ${ordem}, ${d.legenda}, ${d.textoAlternativo},
        ${chave}, ${nomeDoArquivo(d.arquivo.nome)}, ${d.arquivo.mime}, ${d.arquivo.tamanho}, ${eu}, ${eu})`)
    const url = await getSignedUrl(
      this.assinador as unknown as ClienteParaAssinar,
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: chave,
        ContentType: d.arquivo.mime,
      }),
      { expiresIn: VALIDADE_DO_ENVIO_S },
    )
    return {
      midia: await this.paraMidia(await this.linha(publicacaoId, id)),
      envio: {
        url,
        cabecalhos: { 'Content-Type': d.arquivo.mime },
        expiraEm: new Date(Date.now() + VALIDADE_DO_ENVIO_S * 1000).toISOString(),
      },
    }
  }

  /**
   * Passo 2 (rota sob demanda): confere a imagem no Garage (existe e tem o tamanho dito) e manda o worker
   * varrer. Idempotente. Arquivo fora do combinado é apagado e a mídia descartada.
   */
  async confirmarImagem(publicacaoId: string, midiaId: string): Promise<MidiaDaPublicacao> {
    this.exigirConfigurado()
    const m = await this.ctx.transacao(() => this.linha(publicacaoId, midiaId))
    if (m.tipo !== 'imagem' || !m.chave_arquivo) throw naoEncontrada()
    if (m.enviado_em !== null) return this.ctx.transacao(async () => this.paraMidia(m))
    let tamanho: number | undefined
    try {
      const cabecalho = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.config.S3_BUCKET, Key: m.chave_arquivo }),
      )
      tamanho = cabecalho.ContentLength
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404 || (e as { name?: string }).name === 'NotFound') {
        throw new ErroApi('anexo_nao_enviado', 'A imagem ainda não chegou ao armazenamento.', 409)
      }
      throw new ErroApi(
        'armazenamento_indisponivel',
        'Não foi possível conferir a imagem agora. Tente de novo em instantes.',
        503,
      )
    }
    if (tamanho !== Number(m.tamanho) || tamanho > TAMANHO_MAXIMO_DA_IMAGEM) {
      await this.s3
        .send(new DeleteObjectCommand({ Bucket: this.config.S3_BUCKET, Key: m.chave_arquivo }))
        .catch(() => undefined)
      await this.ctx.transacao(() =>
        this.ctx.db().execute(sql`
          UPDATE publicacao_midias SET excluido_em = now(), atualizado_em = now() WHERE id = ${midiaId}`),
      )
      throw new ErroApi('anexo_invalido', 'A imagem enviada não tem o tamanho informado.', 400)
    }
    return this.ctx.transacao(async () => {
      const db = this.ctx.db()
      const [atualizada] = await db.execute<{ id: string }>(sql`
        UPDATE publicacao_midias SET enviado_em = coalesce(enviado_em, now()), atualizado_em = now()
        WHERE id = ${midiaId} AND enviado_em IS NULL RETURNING id`)
      if (atualizada) await agendarVarreduraDeMidia(db, this.ctx.tenantId, midiaId)
      return this.paraMidia(await this.linha(publicacaoId, midiaId))
    })
  }

  /** Tira a mídia da publicação (exclusão lógica). */
  async remover(publicacaoId: string, midiaId: string): Promise<void> {
    const l = await this.linha(publicacaoId, midiaId)
    await this.ctx.db().execute(sql`
      UPDATE publicacao_midias SET excluido_em = now(), atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${midiaId}`)
    await this.auditoria.registrar({
      entidade: 'publicacao',
      entidadeId: publicacaoId,
      acao: 'midia_removida',
      alteracoes: { tipo: l.tipo, midiaId },
    })
  }

  /** Duplicar a publicação leva as mídias (a imagem é a mesma: não se copia o arquivo). */
  async copiar(de: string, para: string): Promise<void> {
    const eu = this.ctx.membro.id
    const linhas = await this.ctx.db().execute<{ id: string }>(sql`
      SELECT id FROM publicacao_midias WHERE publicacao_id = ${de} AND excluido_em IS NULL ORDER BY ordem`)
    for (const { id } of linhas) {
      await this.ctx.db().execute(sql`
        INSERT INTO publicacao_midias (id, tenant_id, publicacao_id, tipo, ordem, legenda, texto_alternativo,
          chave_arquivo, nome, mime, tamanho, estado, enviado_em, varrido_em, assinatura, tentativas_varredura,
          video_provedor, video_id, criado_por, atualizado_por)
        SELECT ${novoId()}, tenant_id, ${para}, tipo, ordem, legenda, texto_alternativo, chave_arquivo, nome, mime,
          tamanho, estado, enviado_em, varrido_em, assinatura, tentativas_varredura, video_provedor, video_id,
          ${eu}, ${eu}
        FROM publicacao_midias WHERE id = ${id}`)
    }
  }
}

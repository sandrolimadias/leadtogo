import { novoId, sql } from '@leadtogo/db'
import {
  type ComentarioDoPortal,
  type ComentarNoPortalEntrada,
  type ConsultaDoFeed,
  type DenunciarNoPortalEntrada,
  type FeedDoPortal,
  type ListaDeComentariosDoPortal,
  type PublicacaoDoPortal,
  type ReacoesDaPublicacao,
  type TipoDeReacao,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'

type LinhaDoFeed = {
  id: string
  titulo: string
  corpo: string
  publicada_em: string | Date
  fixada: boolean
  comentarios_bloqueados: boolean
  total_curtir: number
  total_apoiar: number
  total_parabens: number
  comentarios: number
  minhas: TipoDeReacao[]
  comentarios_ligados: boolean
}

const naoEncontrada = () =>
  new ErroApi('publicacao_nao_encontrada', 'Publicação não encontrada.', 404)

/** "Maria da Silva Souza" vira "Maria S.": o cliente nunca mostra o nome completo a outro cliente. */
export function nomeReduzido(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const primeiro = partes[0]
  if (!primeiro) return 'Cliente'
  const ultimo = partes.length > 1 ? partes[partes.length - 1] : undefined
  const inicial = ultimo?.[0]
  return inicial ? `${primeiro} ${inicial.toLocaleUpperCase('pt-BR')}.` : primeiro
}

/**
 * Publicações vistas e usadas pelo CLIENTE (Fase 3B). O banco só mostra publicação publicada e do alcance da
 * empresa da sessão (políticas restritivas); as consultas repetem a condição de propósito. O cliente vê só o total
 * das reações e o nome reduzido de quem comentou, nunca a empresa nem quem reagiu.
 */
@Injectable()
export class PortalPublicacoesService {
  constructor(private readonly ctx: ContextoTenantService) {}

  private paraPublicacao(l: LinhaDoFeed): PublicacaoDoPortal {
    return {
      id: l.id,
      titulo: l.titulo,
      corpo: l.corpo,
      publicadaEm: new Date(l.publicada_em).toISOString(),
      fixada: l.fixada,
      reacoes: { curtir: l.total_curtir, apoiar: l.total_apoiar, parabens: l.total_parabens },
      minhasReacoes: l.minhas,
      comentarios: l.comentarios,
      comentariosAbertos: l.comentarios_ligados && !l.comentarios_bloqueados,
    }
  }

  private get colunas() {
    return sql`
      p.id, p.titulo, p.corpo, p.publicada_em, p.fixada, p.comentarios_bloqueados, p.total_curtir,
      p.total_apoiar, p.total_parabens,
      (SELECT count(*)::int FROM publicacao_comentarios c WHERE c.publicacao_id = p.id AND c.situacao = 'visivel') AS comentarios,
      ARRAY(SELECT r.tipo::text FROM publicacao_reacoes r
            WHERE r.publicacao_id = p.id AND r.acesso_id = ${this.ctx.portal.acessoId} ORDER BY r.tipo) AS minhas,
      coalesce((SELECT tc.portal_comentarios_ativos FROM tenant_configuracoes tc), true) AS comentarios_ligados`
  }

  private visivel(alias = sql`p`) {
    return sql`${alias}.situacao = 'publicada' AND ${alias}.excluido_em IS NULL`
  }

  async feed(c: ConsultaDoFeed): Promise<FeedDoPortal> {
    const db = this.ctx.db()
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM publicacoes p WHERE ${this.visivel()}`,
    )
    const linhas = await db.execute<LinhaDoFeed>(sql`
      SELECT ${this.colunas} FROM publicacoes p WHERE ${this.visivel()}
      ORDER BY p.fixada DESC, p.publicada_em DESC, p.id DESC
      LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    return { itens: [...linhas].map((l) => this.paraPublicacao(l)), total: total?.n ?? 0 }
  }

  private async carregar(id: string): Promise<LinhaDoFeed> {
    const [l] = await this.ctx
      .db()
      .execute<LinhaDoFeed>(
        sql`SELECT ${this.colunas} FROM publicacoes p WHERE p.id = ${id} AND ${this.visivel()}`,
      )
    if (!l) throw naoEncontrada()
    return l
  }

  async obter(id: string): Promise<PublicacaoDoPortal> {
    return this.paraPublicacao(await this.carregar(id))
  }

  /** Marca como lidas (uma vez por pessoa) as publicações que o cliente de fato enxerga. */
  async marcarLeituras(ids: string[]): Promise<{ marcadas: number }> {
    const { acessoId, empresaId } = this.ctx.portal
    const db = this.ctx.db()
    const visiveis = await db.execute<{ id: string }>(sql`
      SELECT p.id FROM publicacoes p
      WHERE p.id = ANY (${`{${ids.join(',')}}`}::uuid[]) AND ${this.visivel()}`)
    let marcadas = 0
    for (const { id } of visiveis) {
      const nova = await db.execute(sql`
        INSERT INTO publicacao_leituras (id, tenant_id, publicacao_id, acesso_id, empresa_id)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${id}, ${acessoId}, ${empresaId})
        ON CONFLICT (publicacao_id, acesso_id) DO NOTHING RETURNING id`)
      marcadas += nova.length
    }
    return { marcadas }
  }

  // ------------------------------------------------------------------------------------ reações

  private async estadoDasReacoes(id: string): Promise<ReacoesDaPublicacao> {
    const l = await this.carregar(id)
    const p = this.paraPublicacao(l)
    return { reacoes: p.reacoes, minhasReacoes: p.minhasReacoes }
  }

  /** Clicar na reação a liga; clicar de novo a desliga (uma de cada tipo por pessoa). */
  async alternarReacao(id: string, tipo: TipoDeReacao): Promise<ReacoesDaPublicacao> {
    await this.carregar(id)
    const db = this.ctx.db()
    const { acessoId, empresaId } = this.ctx.portal
    const apagada = await db.execute(sql`
      DELETE FROM publicacao_reacoes
      WHERE publicacao_id = ${id} AND acesso_id = ${acessoId} AND tipo = ${tipo}::tipo_reacao_publicacao
      RETURNING id`)
    if (apagada.length === 0) {
      await db.execute(sql`
        INSERT INTO publicacao_reacoes (id, tenant_id, publicacao_id, acesso_id, empresa_id, tipo)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${id}, ${acessoId}, ${empresaId}, ${tipo}::tipo_reacao_publicacao)
        ON CONFLICT (publicacao_id, acesso_id, tipo) DO NOTHING`)
    }
    return this.estadoDasReacoes(id)
  }

  // --------------------------------------------------------------------------------- comentários

  private paraComentario(l: {
    id: string
    autor_nome: string
    corpo: string
    criado_em: string | Date
    situacao: 'visivel' | 'oculto'
    oculto_motivo: string | null
    acesso_id: string
    denunciado: boolean
  }): ComentarioDoPortal {
    const meu = l.acesso_id === this.ctx.portal.acessoId
    return {
      id: l.id,
      autorNome: l.autor_nome,
      corpo: l.corpo,
      criadoEm: new Date(l.criado_em).toISOString(),
      meu,
      oculto: l.situacao === 'oculto',
      ocultoMotivo: meu ? l.oculto_motivo : null,
      denunciado: l.denunciado,
    }
  }

  private selecionarComentarios(onde: ReturnType<typeof sql>) {
    return this.ctx.db().execute<{
      id: string
      autor_nome: string
      corpo: string
      criado_em: string | Date
      situacao: 'visivel' | 'oculto'
      oculto_motivo: string | null
      acesso_id: string
      denunciado: boolean
    }>(sql`
      SELECT c.id, c.autor_nome, c.corpo, c.criado_em, c.situacao::text AS situacao, c.oculto_motivo, c.acesso_id,
             EXISTS (SELECT 1 FROM publicacao_denuncias d
                     WHERE d.comentario_id = c.id AND d.acesso_id = ${this.ctx.portal.acessoId}) AS denunciado
      FROM publicacao_comentarios c
      WHERE ${onde} AND (c.situacao = 'visivel' OR c.acesso_id = ${this.ctx.portal.acessoId})
      ORDER BY c.criado_em, c.id`)
  }

  async comentarios(id: string): Promise<ListaDeComentariosDoPortal> {
    const l = await this.carregar(id)
    const linhas = await this.selecionarComentarios(sql`c.publicacao_id = ${id}`)
    return {
      itens: [...linhas].map((c) => this.paraComentario(c)),
      comentariosAbertos: l.comentarios_ligados && !l.comentarios_bloqueados,
    }
  }

  async comentar(id: string, d: ComentarNoPortalEntrada): Promise<ComentarioDoPortal> {
    const l = await this.carregar(id)
    if (!l.comentarios_ligados || l.comentarios_bloqueados) {
      throw new ErroApi(
        'comentarios_fechados',
        'Os comentários estão fechados nesta publicação.',
        409,
      )
    }
    const { acessoId, empresaId, contatoId, nome, tenantId } = this.ctx.portal
    const comentarioId = novoId()
    await this.ctx.db().execute(sql`
      INSERT INTO publicacao_comentarios (id, tenant_id, publicacao_id, acesso_id, empresa_id, autor_nome, corpo)
      VALUES (${comentarioId}, ${tenantId}, ${id}, ${acessoId}, ${empresaId}, ${nomeReduzido(nome)}, ${d.corpo})`)
    await auditarAtoDoPortal(this.ctx.db(), {
      tenantId,
      acessoId,
      contatoId,
      entidade: 'publicacao_comentario',
      entidadeId: comentarioId,
      acao: 'comentar',
      alteracoes: { publicacaoId: id },
      ip: this.ctx.ip,
    })
    const [c] = await this.selecionarComentarios(sql`c.id = ${comentarioId}`)
    return this.paraComentario(c as NonNullable<typeof c>)
  }

  async denunciar(comentarioId: string, d: DenunciarNoPortalEntrada): Promise<void> {
    const [c] = await this.selecionarComentarios(sql`c.id = ${comentarioId}`)
    if (!c) throw new ErroApi('comentario_nao_encontrado', 'Comentário não encontrado.', 404)
    const { acessoId, contatoId, tenantId } = this.ctx.portal
    if (c.acesso_id === acessoId) {
      throw new ErroApi(
        'denuncia_propria',
        'Você não pode denunciar o seu próprio comentário.',
        422,
      )
    }
    const nova = await this.ctx.db().execute(sql`
      INSERT INTO publicacao_denuncias (id, tenant_id, comentario_id, acesso_id, motivo)
      VALUES (${novoId()}, ${tenantId}, ${comentarioId}, ${acessoId}, ${d.motivo}::motivo_denuncia_publicacao)
      ON CONFLICT (comentario_id, acesso_id) DO NOTHING RETURNING id`)
    if (nova.length > 0) {
      await auditarAtoDoPortal(this.ctx.db(), {
        tenantId,
        acessoId,
        contatoId,
        entidade: 'publicacao_comentario',
        entidadeId: comentarioId,
        acao: 'denunciar',
        alteracoes: { motivo: d.motivo },
        ip: this.ctx.ip,
      })
    }
  }
}

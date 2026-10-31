import { novoId, sql } from '@leadtogo/db'
import {
  type ComentarioParaModeracao,
  type ConsultaDePublicacoes,
  type ItemDePublicacao,
  type ListaDeComentariosParaModeracao,
  type ListaDePublicacoes,
  type MetricasDaPublicacao,
  type ModerarComentarioEntrada,
  type MotivoDeDenuncia,
  type Publicacao,
  type SalvarPublicacaoEntrada,
  type SituacaoDaPublicacao,
  type AlcanceDaPublicacao,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { ErroApi } from '../http/erro-api.js'

type LinhaDaPublicacao = {
  id: string
  titulo: string
  corpo: string
  situacao: SituacaoDaPublicacao
  alcance: AlcanceDaPublicacao
  fixada: boolean
  agendada_para: string | Date | null
  publicada_em: string | Date | null
  comentarios_bloqueados: boolean
  total_curtir: number
  total_apoiar: number
  total_parabens: number
  criado_em: string | Date
  atualizado_em: string | Date
  autor_nome: string | null
}

const iso = (v: string | Date | null): string | null =>
  v === null ? null : new Date(v).toISOString()
const naoEncontrada = () =>
  new ErroApi('publicacao_nao_encontrada', 'Publicação não encontrada.', 404)

const COLUNAS = sql`
  p.id, p.titulo, p.corpo, p.situacao::text AS situacao, p.alcance::text AS alcance, p.fixada,
  p.agendada_para, p.publicada_em, p.comentarios_bloqueados, p.total_curtir, p.total_apoiar,
  p.total_parabens, p.criado_em, p.atualizado_em, m.nome AS autor_nome`
const JUNCOES = sql`FROM publicacoes p LEFT JOIN membros m ON m.id = p.criado_por`
const NAO_EXCLUIDA = sql`p.excluido_em IS NULL`

/** Gestão das publicações do portal pela EQUIPE (`portal.publicar` e `portal.moderar`). */
@Injectable()
export class PublicacoesService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly auditoria: AuditoriaService,
  ) {}

  // ------------------------------------------------------------------------------------ leitura

  /** Métricas de várias publicações de uma vez (alcance, reações, comentários e denúncias). */
  private async metricas(linhas: LinhaDaPublicacao[]): Promise<Map<string, MetricasDaPublicacao>> {
    const resultado = new Map<string, MetricasDaPublicacao>()
    if (linhas.length === 0) return resultado
    const ids = `{${linhas.map((l) => l.id).join(',')}}`
    const db = this.ctx.db()
    // Alcance = pessoas distintas que leram ÷ pessoas que podem ler, sobre o MESMO conjunto: acessos ativos
    // dentro do alcance da publicação. Leitura de acesso revogado, excluído ou fora do alcance não conta,
    // então o indicador nunca passa de 100% (docs/plano_portal_formularios_e_eventos.md, B-7).
    const alcance = await db.execute<{
      id: string
      alvo: number
      leitores: number
      empresas: number
    }>(sql`
      WITH pode_ler AS (
        SELECT p.id AS publicacao_id, a.id AS acesso_id
        FROM publicacoes p
        JOIN portal_acessos a ON a.situacao = 'ativo' AND a.excluido_em IS NULL
          AND (p.alcance = 'todos' OR EXISTS (
            SELECT 1 FROM publicacao_empresas pe WHERE pe.publicacao_id = p.id AND pe.empresa_id = a.empresa_id))
        WHERE p.id = ANY (${ids}::uuid[])
      )
      SELECT p.id,
             (SELECT count(*)::int FROM pode_ler pl WHERE pl.publicacao_id = p.id) AS alvo,
             (SELECT count(DISTINCT l.acesso_id)::int FROM publicacao_leituras l
               JOIN pode_ler pl ON pl.publicacao_id = l.publicacao_id AND pl.acesso_id = l.acesso_id
               WHERE l.publicacao_id = p.id) AS leitores,
             (SELECT count(DISTINCT l.empresa_id)::int FROM publicacao_leituras l
               JOIN pode_ler pl ON pl.publicacao_id = l.publicacao_id AND pl.acesso_id = l.acesso_id
               WHERE l.publicacao_id = p.id) AS empresas
      FROM publicacoes p WHERE p.id = ANY (${ids}::uuid[])`)
    const comentarios = await db.execute<{
      publicacao_id: string
      total: number
      ocultos: number
    }>(sql`
      SELECT publicacao_id, count(*) FILTER (WHERE situacao = 'visivel')::int AS total,
             count(*) FILTER (WHERE situacao = 'oculto')::int AS ocultos
      FROM publicacao_comentarios WHERE publicacao_id = ANY (${ids}::uuid[]) GROUP BY publicacao_id`)
    const denuncias = await db.execute<{ publicacao_id: string; abertas: number }>(sql`
      SELECT c.publicacao_id, count(DISTINCT c.id)::int AS abertas
      FROM publicacao_denuncias d JOIN publicacao_comentarios c ON c.id = d.comentario_id
      WHERE d.tratada_em IS NULL AND c.publicacao_id = ANY (${ids}::uuid[]) GROUP BY c.publicacao_id`)
    const por = <T extends { publicacao_id: string }>(l: Iterable<T>) =>
      new Map([...l].map((x) => [x.publicacao_id, x]))
    const mapaComentarios = por(comentarios)
    const mapaDenuncias = por(denuncias)
    const mapaAlcance = new Map([...alcance].map((a) => [a.id, a]))
    for (const l of linhas) {
      resultado.set(l.id, {
        leitores: mapaAlcance.get(l.id)?.leitores ?? 0,
        alvo: mapaAlcance.get(l.id)?.alvo ?? 0,
        empresasAlcancadas: mapaAlcance.get(l.id)?.empresas ?? 0,
        reacoes: { curtir: l.total_curtir, parabens: l.total_parabens },
        comentarios: mapaComentarios.get(l.id)?.total ?? 0,
        comentariosOcultos: mapaComentarios.get(l.id)?.ocultos ?? 0,
        denunciasAbertas: mapaDenuncias.get(l.id)?.abertas ?? 0,
      })
    }
    return resultado
  }

  private paraItem(l: LinhaDaPublicacao, m: MetricasDaPublicacao): ItemDePublicacao {
    return {
      id: l.id,
      titulo: l.titulo,
      situacao: l.situacao,
      alcance: l.alcance,
      fixada: l.fixada,
      agendadaPara: iso(l.agendada_para),
      publicadaEm: iso(l.publicada_em),
      atualizadoEm: new Date(l.atualizado_em).toISOString(),
      comentariosBloqueados: l.comentarios_bloqueados,
      metricas: m,
    }
  }

  async listar(c: ConsultaDePublicacoes): Promise<ListaDePublicacoes> {
    const db = this.ctx.db()
    const porAba = {
      todas: sql`true`,
      publicadas: sql`p.situacao = 'publicada'`,
      agendadas: sql`p.situacao = 'agendada'`,
      rascunhos: sql`p.situacao = 'rascunho'`,
    }
    const onde = sql`${NAO_EXCLUIDA} AND ${porAba[c.aba]}`
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM publicacoes p WHERE ${onde}`,
    )
    const linhas = [
      ...(await db.execute<LinhaDaPublicacao>(sql`
        SELECT ${COLUNAS} ${JUNCOES} WHERE ${onde}
        -- Da mais recente para a mais antiga (B-5); a fixada leva o selo na lista, mas não pula a ordem
        ORDER BY coalesce(p.publicada_em, p.agendada_para, p.criado_em) DESC, p.id DESC
        LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)),
    ]
    const metricas = await this.metricas(linhas)
    const [abas] = await db.execute<{
      todas: number
      publicadas: number
      agendadas: number
      rascunhos: number
      denuncias: number
    }>(sql`
      SELECT count(*)::int AS todas,
             count(*) FILTER (WHERE situacao = 'publicada')::int AS publicadas,
             count(*) FILTER (WHERE situacao = 'agendada')::int AS agendadas,
             count(*) FILTER (WHERE situacao = 'rascunho')::int AS rascunhos,
             (SELECT count(DISTINCT d.comentario_id)::int FROM publicacao_denuncias d WHERE d.tratada_em IS NULL) AS denuncias
      FROM publicacoes p WHERE ${NAO_EXCLUIDA}`)
    return {
      itens: linhas.map((l) => this.paraItem(l, metricas.get(l.id) as MetricasDaPublicacao)),
      total: total?.n ?? 0,
      abas: {
        todas: abas?.todas ?? 0,
        publicadas: abas?.publicadas ?? 0,
        agendadas: abas?.agendadas ?? 0,
        rascunhos: abas?.rascunhos ?? 0,
      },
      denunciasAbertas: abas?.denuncias ?? 0,
    }
  }

  async detalhe(id: string): Promise<Publicacao> {
    const db = this.ctx.db()
    const [l] = await db.execute<LinhaDaPublicacao>(
      sql`SELECT ${COLUNAS} ${JUNCOES} WHERE p.id = ${id} AND ${NAO_EXCLUIDA}`,
    )
    if (!l) throw naoEncontrada()
    const metricas = await this.metricas([l])
    const empresas = await db.execute<{ id: string; nome: string }>(sql`
      SELECT e.id, e.razao_social AS nome FROM publicacao_empresas pe
      JOIN empresas e ON e.id = pe.empresa_id WHERE pe.publicacao_id = ${id} ORDER BY lower(e.razao_social)`)
    return {
      ...this.paraItem(l, metricas.get(l.id) as MetricasDaPublicacao),
      corpo: l.corpo,
      autorNome: l.autor_nome,
      criadoEm: new Date(l.criado_em).toISOString(),
      empresas: [...empresas],
    }
  }

  // ----------------------------------------------------------------------------------- escrita

  private conferirAgenda(d: SalvarPublicacaoEntrada): void {
    if (d.situacao === 'agendada' && new Date(d.agendadaPara as string).getTime() <= Date.now()) {
      throw new ErroApi('agenda_no_passado', 'Escolha um horário no futuro para agendar.', 422)
    }
  }

  private async trocarEmpresas(id: string, d: SalvarPublicacaoEntrada): Promise<void> {
    const db = this.ctx.db()
    await db.execute(sql`DELETE FROM publicacao_empresas WHERE publicacao_id = ${id}`)
    if (d.alcance !== 'empresas') return
    const unicas = [...new Set(d.empresaIds)]
    const validas = await db.execute<{ id: string }>(sql`
      SELECT id FROM empresas WHERE id = ANY (${`{${unicas.join(',')}}`}::uuid[]) AND excluido_em IS NULL`)
    if (validas.length !== unicas.length) {
      throw new ErroApi('empresa_invalida', 'Alguma empresa escolhida não existe.', 422)
    }
    for (const empresaId of unicas) {
      await db.execute(sql`
        INSERT INTO publicacao_empresas (id, tenant_id, publicacao_id, empresa_id)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${id}, ${empresaId})`)
    }
  }

  async criar(d: SalvarPublicacaoEntrada): Promise<Publicacao> {
    this.conferirAgenda(d)
    const id = novoId()
    await this.ctx.db().execute(sql`
      INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao, alcance, agendada_para, publicada_em,
                               criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${d.titulo}, ${d.corpo}, ${d.situacao}::situacao_publicacao,
              ${d.alcance}::alcance_publicacao, ${d.agendadaPara},
              ${d.situacao === 'publicada' ? sql`now()` : null}, ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    await this.trocarEmpresas(id, d)
    await this.auditoria.registrar({
      entidade: 'publicacao',
      entidadeId: id,
      acao: 'criar',
      alteracoes: { titulo: d.titulo, situacao: d.situacao, alcance: d.alcance },
    })
    return this.detalhe(id)
  }

  async atualizar(id: string, d: SalvarPublicacaoEntrada): Promise<Publicacao> {
    const db = this.ctx.db()
    const [antes] = await db.execute<{ situacao: SituacaoDaPublicacao; fixada: boolean }>(
      sql`SELECT situacao::text AS situacao, fixada FROM publicacoes p WHERE p.id = ${id} AND ${NAO_EXCLUIDA} FOR UPDATE`,
    )
    if (!antes) throw naoEncontrada()
    if (antes.situacao === 'publicada' && d.situacao !== 'publicada') {
      throw new ErroApi(
        'publicacao_ja_publicada',
        'Uma publicação já publicada não volta a rascunho nem agenda: exclua-a ou edite o texto.',
        409,
      )
    }
    this.conferirAgenda(d)
    const publicando = antes.situacao !== 'publicada' && d.situacao === 'publicada'
    await db.execute(sql`
      UPDATE publicacoes SET titulo = ${d.titulo}, corpo = ${d.corpo}, situacao = ${d.situacao}::situacao_publicacao,
        alcance = ${d.alcance}::alcance_publicacao, agendada_para = ${d.agendadaPara},
        publicada_em = ${publicando ? sql`now()` : sql`publicada_em`},
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.trocarEmpresas(id, d)
    await this.auditoria.registrar({
      entidade: 'publicacao',
      entidadeId: id,
      acao: 'editar',
      alteracoes: { situacaoAnterior: antes.situacao, situacao: d.situacao, alcance: d.alcance },
    })
    return this.detalhe(id)
  }

  /**
   * Duplica uma publicação (B-4): copia título ("Cópia de …"), corpo e alcance (com as empresas). A cópia nasce
   * rascunho, sem fixar, sem agenda e sem reações, comentários nem leituras.
   */
  async duplicar(id: string): Promise<Publicacao> {
    const db = this.ctx.db()
    const [o] = await db.execute<{ titulo: string }>(
      sql`SELECT p.titulo FROM publicacoes p WHERE p.id = ${id} AND ${NAO_EXCLUIDA}`,
    )
    if (!o) throw naoEncontrada()
    const novo = novoId()
    const titulo = `Cópia de ${o.titulo}`.slice(0, 160)
    await db.execute(sql`
      INSERT INTO publicacoes (id, tenant_id, titulo, corpo, situacao, alcance, comentarios_bloqueados,
                               criado_por, atualizado_por)
      SELECT ${novo}, tenant_id, ${titulo}, corpo, 'rascunho', alcance, comentarios_bloqueados,
             ${this.ctx.membro.id}, ${this.ctx.membro.id}
      FROM publicacoes WHERE id = ${id}`)
    const empresas = await db.execute<{ empresa_id: string }>(
      sql`SELECT empresa_id FROM publicacao_empresas WHERE publicacao_id = ${id}`,
    )
    for (const { empresa_id: empresaId } of empresas) {
      await db.execute(sql`
        INSERT INTO publicacao_empresas (id, tenant_id, publicacao_id, empresa_id)
        VALUES (${novoId()}, ${this.ctx.tenantId}, ${novo}, ${empresaId})`)
    }
    await this.auditoria.registrar({
      entidade: 'publicacao',
      entidadeId: novo,
      acao: 'criar',
      alteracoes: { duplicadaDe: id, titulo },
    })
    return this.detalhe(novo)
  }

  async excluir(id: string): Promise<void> {
    const apagadas = await this.ctx.db().execute(sql`
      UPDATE publicacoes SET excluido_em = now(), fixada = false, atualizado_em = now(),
        atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id} AND excluido_em IS NULL RETURNING id`)
    if (apagadas.length === 0) throw naoEncontrada()
    await this.auditoria.registrar({ entidade: 'publicacao', entidadeId: id, acao: 'excluir' })
  }

  async fixar(id: string, fixada: boolean): Promise<Publicacao> {
    const db = this.ctx.db()
    const [p] = await db.execute<{ situacao: SituacaoDaPublicacao }>(
      sql`SELECT situacao::text AS situacao FROM publicacoes p WHERE p.id = ${id} AND ${NAO_EXCLUIDA} FOR UPDATE`,
    )
    if (!p) throw naoEncontrada()
    if (fixada && p.situacao !== 'publicada') {
      throw new ErroApi('so_publicada_fixa', 'Só uma publicação já publicada pode ser fixada.', 409)
    }
    if (fixada) {
      await db.execute(sql`
        UPDATE publicacoes SET fixada = false, atualizado_em = now()
        WHERE fixada AND id <> ${id} AND excluido_em IS NULL`)
    }
    await db.execute(sql`
      UPDATE publicacoes SET fixada = ${fixada}, atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.auditoria.registrar({
      entidade: 'publicacao',
      entidadeId: id,
      acao: fixada ? 'fixar' : 'desafixar',
    })
    return this.detalhe(id)
  }

  async bloquearComentarios(id: string, bloqueados: boolean): Promise<Publicacao> {
    const feito = await this.ctx.db().execute(sql`
      UPDATE publicacoes SET comentarios_bloqueados = ${bloqueados}, atualizado_em = now(),
        atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id} AND excluido_em IS NULL RETURNING id`)
    if (feito.length === 0) throw naoEncontrada()
    await this.auditoria.registrar({
      entidade: 'publicacao',
      entidadeId: id,
      acao: bloqueados ? 'bloquear_comentarios' : 'liberar_comentarios',
    })
    return this.detalhe(id)
  }

  // --------------------------------------------------------------------------------- moderação

  async comentarios(publicacaoId: string): Promise<ListaDeComentariosParaModeracao> {
    const db = this.ctx.db()
    const [existe] = await db.execute(
      sql`SELECT 1 FROM publicacoes p WHERE p.id = ${publicacaoId} AND ${NAO_EXCLUIDA}`,
    )
    if (!existe) throw naoEncontrada()
    const linhas = await db.execute<{
      id: string
      autor_nome: string
      empresa_nome: string
      corpo: string
      criado_em: string | Date
      situacao: 'visivel' | 'oculto'
      oculto_motivo: string | null
      oculto_por_nome: string | null
      abertas: number
      motivo_top: MotivoDeDenuncia | null
    }>(sql`
      SELECT c.id, c.autor_nome, e.razao_social AS empresa_nome, c.corpo, c.criado_em, c.situacao::text AS situacao,
             c.oculto_motivo, mo.nome AS oculto_por_nome,
             (SELECT count(*)::int FROM publicacao_denuncias d WHERE d.comentario_id = c.id AND d.tratada_em IS NULL) AS abertas,
             (SELECT d.motivo::text FROM publicacao_denuncias d WHERE d.comentario_id = c.id AND d.tratada_em IS NULL
              GROUP BY d.motivo ORDER BY count(*) DESC, d.motivo LIMIT 1) AS motivo_top
      FROM publicacao_comentarios c
      JOIN empresas e ON e.id = c.empresa_id
      LEFT JOIN membros mo ON mo.id = c.oculto_por
      WHERE c.publicacao_id = ${publicacaoId}
      ORDER BY c.criado_em, c.id`)
    return {
      itens: [...linhas].map((l): ComentarioParaModeracao => ({
        id: l.id,
        autorNome: l.autor_nome,
        empresaNome: l.empresa_nome,
        corpo: l.corpo,
        criadoEm: new Date(l.criado_em).toISOString(),
        oculto: l.situacao === 'oculto',
        ocultoMotivo: l.oculto_motivo,
        ocultoPorNome: l.oculto_por_nome,
        denunciasAbertas: l.abertas,
        motivoDaDenuncia: l.motivo_top,
      })),
    }
  }

  async moderar(
    publicacaoId: string,
    comentarioId: string,
    d: ModerarComentarioEntrada,
  ): Promise<ListaDeComentariosParaModeracao> {
    const db = this.ctx.db()
    const [c] = await db.execute<{ situacao: string }>(sql`
      SELECT situacao::text AS situacao FROM publicacao_comentarios
      WHERE id = ${comentarioId} AND publicacao_id = ${publicacaoId} FOR UPDATE`)
    if (!c) throw new ErroApi('comentario_nao_encontrado', 'Comentário não encontrado.', 404)
    const membro = this.ctx.membro.id
    if (d.acao === 'ocultar') {
      await db.execute(sql`
        UPDATE publicacao_comentarios SET situacao = 'oculto', oculto_motivo = ${d.motivo ?? null},
          oculto_por = ${membro}, oculto_em = now(), atualizado_em = now()
        WHERE id = ${comentarioId}`)
    } else if (d.acao === 'reexibir') {
      await db.execute(sql`
        UPDATE publicacao_comentarios SET situacao = 'visivel', oculto_motivo = NULL, oculto_por = NULL,
          oculto_em = NULL, atualizado_em = now()
        WHERE id = ${comentarioId}`)
    }
    // Manter e Ocultar encerram as denúncias abertas (a equipe já decidiu)
    if (d.acao !== 'reexibir') {
      await db.execute(sql`
        UPDATE publicacao_denuncias SET tratada_em = now(), tratada_por = ${membro}, atualizado_em = now()
        WHERE comentario_id = ${comentarioId} AND tratada_em IS NULL`)
    }
    await this.auditoria.registrar({
      entidade: 'publicacao_comentario',
      entidadeId: comentarioId,
      acao: `moderar_${d.acao}`,
      alteracoes: { publicacaoId, ...(d.motivo ? { motivo: d.motivo } : {}) },
    })
    return this.comentarios(publicacaoId)
  }
}

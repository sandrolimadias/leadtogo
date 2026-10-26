import { novoId, sql } from '@leadtogo/db'
import {
  type ConsultaDeEventosDoPortal,
  type EventoDoPortal,
  type ListaDeEventosDoPortal,
  type MinhaSituacaoNoEvento,
  type MotivoDeBloqueioDoEvento,
  type ProximosEventosDoPortal,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { auditarAtoDoPortal } from './portal-auditoria.js'
import { agendarNotificacaoDeEvento } from './notificar-evento.js'
import { gerarIcs } from './ics.js'

type LinhaDoEvento = {
  id: string
  titulo: string
  descricao: string | null
  local: string | null
  link_online: string | null
  inicio_em: string | Date
  fim_em: string | Date
  atualizado_em: string | Date
  prazo_confirmacao: string | Date | null
  situacao: 'publicado' | 'cancelado'
  vagas_totais: number | null
  vagas_por_empresa: number | null
  total_confirmados: number
  iniciado: boolean
  prazo_vencido: boolean
  da_empresa: number
  minha: MinhaSituacaoNoEvento
}

/** Mensagem do erro lançado pelas funções do banco → erro da API. */
const ERROS_DA_AGENDA: Record<string, ErroApi> = {
  evento_nao_encontrado: new ErroApi('evento_nao_encontrado', 'Evento não encontrado.', 404),
  evento_cancelado: new ErroApi('evento_cancelado', 'Este evento foi cancelado.', 409),
  evento_encerrado: new ErroApi('evento_encerrado', 'Este evento já começou.', 409),
  prazo_encerrado: new ErroApi(
    'prazo_encerrado',
    'O prazo para confirmar presença neste evento terminou.',
    409,
  ),
  sem_presenca: new ErroApi('sem_presenca', 'Você não tem presença neste evento.', 409),
}

/**
 * Erro de negócio das funções (`RAISE EXCEPTION 'codigo'`) vira o erro da API. O driver embrulha o erro do banco
 * (o original fica em `cause`), então procura a mensagem na cadeia; o que não for conhecido sobe como está.
 */
function traduzir(e: unknown): never {
  for (let atual: unknown = e; atual; atual = (atual as { cause?: unknown }).cause) {
    const mensagem = (atual as { message?: string }).message ?? ''
    const conhecido = ERROS_DA_AGENDA[mensagem]
    if (conhecido) throw new ErroApi(conhecido.codigo, conhecido.message, conhecido.getStatus())
  }
  throw e
}

/**
 * Agenda vista e usada pelo CLIENTE (Fase 3D). O banco só mostra evento publicado ou cancelado do alcance da empresa
 * da sessão. Confirmar e cancelar passam por funções do banco que travam a linha do evento: ninguém passa do limite
 * de vagas (total ou da empresa), nem com confirmações simultâneas. O cliente vê quantas vagas restam e as da
 * empresa dele, nunca quem são os outros participantes.
 */
@Injectable()
export class PortalEventosService {
  constructor(private readonly ctx: ContextoTenantService) {}

  private colunas() {
    const { acessoId, empresaId } = this.ctx.portal
    return sql`
      e.id, e.titulo, e.descricao, e.local, e.link_online, e.inicio_em, e.fim_em, e.atualizado_em,
      e.prazo_confirmacao, e.situacao::text AS situacao, e.vagas_totais, e.vagas_por_empresa, e.total_confirmados,
      (e.inicio_em <= now()) AS iniciado,
      (e.prazo_confirmacao IS NOT NULL AND e.prazo_confirmacao <= now()) AS prazo_vencido,
      (SELECT count(*)::int FROM evento_confirmacoes c
        WHERE c.evento_id = e.id AND c.empresa_id = ${empresaId} AND c.situacao = 'confirmado') AS da_empresa,
      coalesce((SELECT c.situacao::text FROM evento_confirmacoes c
        WHERE c.evento_id = e.id AND c.acesso_id = ${acessoId} AND c.situacao <> 'cancelado'), 'nenhuma') AS minha`
  }

  private paraEvento(l: LinhaDoEvento): EventoDoPortal {
    const cancelado = l.situacao === 'cancelado'
    const restantes =
      l.vagas_totais === null ? null : Math.max(l.vagas_totais - l.total_confirmados, 0)
    let motivo: MotivoDeBloqueioDoEvento | null = null
    if (cancelado) motivo = 'evento_cancelado'
    else if (l.iniciado) motivo = 'evento_encerrado'
    else if (l.prazo_vencido && l.minha === 'nenhuma') motivo = 'prazo_encerrado'
    return {
      id: l.id,
      titulo: l.titulo,
      descricao: l.descricao,
      local: l.local,
      linkOnline: l.link_online,
      inicioEm: new Date(l.inicio_em).toISOString(),
      fimEm: new Date(l.fim_em).toISOString(),
      prazoConfirmacao:
        l.prazo_confirmacao === null ? null : new Date(l.prazo_confirmacao).toISOString(),
      cancelado,
      vagasRestantes: restantes,
      lotado: restantes === 0,
      vagasDaEmpresa: { limite: l.vagas_por_empresa, confirmados: l.da_empresa },
      minhaSituacao: l.minha,
      podeConfirmar: motivo === null && l.minha === 'nenhuma',
      podeCancelar: !cancelado && !l.iniciado && l.minha !== 'nenhuma',
      motivoDoBloqueio: motivo,
    }
  }

  async listar(c: ConsultaDeEventosDoPortal): Promise<ListaDeEventosDoPortal> {
    const db = this.ctx.db()
    const onde =
      c.aba === 'proximos'
        ? sql`e.situacao IN ('publicado', 'cancelado') AND e.excluido_em IS NULL AND e.fim_em > now()`
        : sql`e.situacao IN ('publicado', 'cancelado') AND e.excluido_em IS NULL AND e.fim_em <= now()`
    const ordem =
      c.aba === 'proximos' ? sql`e.inicio_em ASC, e.id` : sql`e.inicio_em DESC, e.id DESC`
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM eventos e WHERE ${onde}`,
    )
    const linhas = await db.execute<LinhaDoEvento>(sql`
      SELECT ${this.colunas()} FROM eventos e WHERE ${onde}
      ORDER BY ${ordem} LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    return { itens: [...linhas].map((l) => this.paraEvento(l)), total: total?.n ?? 0 }
  }

  /** Os próximos eventos (sem os cancelados) para o Início do portal. */
  async proximos(limite = 3): Promise<ProximosEventosDoPortal> {
    const linhas = await this.ctx.db().execute<LinhaDoEvento>(sql`
      SELECT ${this.colunas()} FROM eventos e
      WHERE e.situacao = 'publicado' AND e.excluido_em IS NULL AND e.fim_em > now()
      ORDER BY e.inicio_em ASC, e.id LIMIT ${limite}`)
    return { itens: [...linhas].map((l) => this.paraEvento(l)) }
  }

  private async linha(id: string): Promise<LinhaDoEvento> {
    const [l] = await this.ctx.db().execute<LinhaDoEvento>(sql`
      SELECT ${this.colunas()} FROM eventos e
      WHERE e.id = ${id} AND e.situacao IN ('publicado', 'cancelado') AND e.excluido_em IS NULL`)
    if (!l) throw ERROS_DA_AGENDA['evento_nao_encontrado'] as ErroApi
    return l
  }

  async obter(id: string): Promise<EventoDoPortal> {
    return this.paraEvento(await this.linha(id))
  }

  /** Confirma a presença (ou entra na lista de espera, se lotado) e devolve o evento já atualizado. */
  async confirmar(id: string): Promise<EventoDoPortal> {
    await this.linha(id)
    const db = this.ctx.db()
    let situacao: string
    try {
      const [r] = await db.execute<{ s: string }>(
        sql`SELECT app_evento_confirmar(${id}, ${novoId()}) AS s`,
      )
      situacao = r?.s ?? ''
    } catch (e) {
      traduzir(e)
    }
    const p = this.ctx.portal
    await auditarAtoDoPortal(db, {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'evento',
      entidadeId: id,
      acao: situacao === 'lista_espera' ? 'entrar_na_lista_de_espera' : 'confirmar_presenca',
      ip: this.ctx.ip,
    })
    return this.obter(id)
  }

  /** Cancela a própria presença (ou a posição na fila); quem esperava é promovido e avisado. */
  async cancelar(id: string): Promise<EventoDoPortal> {
    await this.linha(id)
    const db = this.ctx.db()
    let promovidas: { id: string }[]
    try {
      promovidas = [
        ...(await db.execute<{ id: string }>(
          sql`SELECT app_evento_cancelar_presenca(${id}) AS id`,
        )),
      ]
    } catch (e) {
      traduzir(e)
    }
    for (const { id: confirmacaoId } of promovidas) {
      await agendarNotificacaoDeEvento(db, this.ctx.tenantId, { tipo: 'vaga', confirmacaoId })
    }
    const p = this.ctx.portal
    await auditarAtoDoPortal(db, {
      tenantId: p.tenantId,
      acessoId: p.acessoId,
      contatoId: p.contatoId,
      entidade: 'evento',
      entidadeId: id,
      acao: 'cancelar_presenca',
      ip: this.ctx.ip,
    })
    return this.obter(id)
  }

  /** O arquivo .ics do evento (qualquer evento que o cliente enxerga). */
  async ics(id: string): Promise<{ nome: string; conteudo: string }> {
    const l = await this.linha(id)
    return {
      nome: `evento-${l.id}.ics`,
      conteudo: gerarIcs({
        id: l.id,
        titulo: l.titulo,
        descricao: l.descricao,
        local: l.local,
        linkOnline: l.link_online,
        inicioEm: new Date(l.inicio_em),
        fimEm: new Date(l.fim_em),
        cancelado: l.situacao === 'cancelado',
        atualizadoEm: new Date(l.atualizado_em),
      }),
    }
  }
}

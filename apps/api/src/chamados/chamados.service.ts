import { novoId, type SQL, sql } from '@leadtogo/db'
import {
  type AbrirChamadoEntrada,
  type AcoesDoChamado,
  type AlterarChamadoEntrada,
  type AtribuirChamadoEntrada,
  type Chamado,
  type ConsultaDeChamados,
  codigoDoChamado,
  type EventoDoChamado,
  type ItemDeChamado,
  type ListaDeChamados,
  type MensagemDoChamado,
  type MudancaDeEstado,
  type NotaInterna,
  type PrazoDoChamado,
  type PrioridadeDoChamado,
  PRAZO_DE_REABERTURA_DIAS,
  type StatusDoChamado,
  TRANSICOES_DO_CHAMADO,
  type TriarChamadoEntrada,
  calcularPrazo,
  podeReabrir,
  transicaoPermitida,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService, type Transacao } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { AcessoDeChamados, type ChamadoParaAcesso } from './acesso-chamados.js'
import { ExpedienteService } from './expediente.service.js'
import { TriagemService } from './triagem.service.js'

type LinhaDoChamado = {
  id: string
  numero: number
  assunto: string
  descricao: string | null
  status: StatusDoChamado
  prioridade: PrioridadeDoChamado
  origem: 'interna' | 'portal'
  area_id: string | null
  area_nome: string | null
  meta_resposta_min: number | null
  meta_resolucao_min: number | null
  responsavel_id: string | null
  responsavel_nome: string | null
  solicitante_membro_id: string | null
  contato_id: string | null
  solicitante_nome: string | null
  empresa_cliente_id: string | null
  empresa_nome: string | null
  criado_em: string
  atualizado_em: string
  status_alterado_em: string
  primeira_resposta_em: string | null
  resolvido_em: string | null
  fechado_em: string | null
  reaberturas: number
}

const COLUNAS = sql`
  c.id, c.numero, c.assunto, c.descricao, c.status, c.prioridade, c.origem,
  c.area_id, a.nome AS area_nome, a.meta_resposta_min, a.meta_resolucao_min,
  c.responsavel_id, r.nome AS responsavel_nome,
  c.solicitante_membro_id, c.contato_id, coalesce(sm.nome, sc.nome) AS solicitante_nome,
  c.empresa_cliente_id, coalesce(e.nome_fantasia, e.razao_social) AS empresa_nome,
  c.criado_em, c.atualizado_em, c.status_alterado_em, c.primeira_resposta_em, c.resolvido_em,
  c.fechado_em, c.reaberturas`
const JUNCOES = sql`
  FROM chamados c
  LEFT JOIN areas_atendimento a ON a.id = c.area_id
  LEFT JOIN membros r ON r.id = c.responsavel_id
  LEFT JOIN membros sm ON sm.id = c.solicitante_membro_id
  LEFT JOIN contatos sc ON sc.id = c.contato_id
  LEFT JOIN empresas e ON e.id = c.empresa_cliente_id`

const naoEncontrado = () => new ErroApi('chamado_nao_encontrado', 'Chamado não encontrado.', 404)
const semPermissao = (m = 'Seu perfil de acesso não permite esta ação neste chamado.') =>
  new ErroApi('acesso_negado', m, 403)
const iso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString())

const PESO_DA_PRIORIDADE = sql`CASE c.prioridade WHEN 'urgente' THEN 4 WHEN 'alta' THEN 3 WHEN 'normal' THEN 2 ELSE 1 END`

interface DadosDoEvento {
  tipo: string
  statusDe?: StatusDoChamado | null
  statusPara?: StatusDoChamado | null
  areaDeId?: string | null
  areaParaId?: string | null
  responsavelDeId?: string | null
  responsavelParaId?: string | null
  prioridadeDe?: PrioridadeDoChamado | null
  prioridadePara?: PrioridadeDoChamado | null
  dados?: Record<string, unknown>
}

/**
 * Chamados (Fase 2): abrir, listar, detalhar, triar, atribuir, assumir, mudar o estado e reabrir. Toda mudança
 * grava um evento em `chamado_eventos`, a linha do tempo e a base única das métricas.
 */
@Injectable()
export class ChamadosService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly acesso: AcessoDeChamados,
    private readonly triagem: TriagemService,
    private readonly expediente: ExpedienteService,
  ) {}

  // ---- Eventos ----

  /** Acrescenta um evento do membro da requisição à linha do tempo do chamado. */
  async registrarEvento(
    chamadoId: string,
    e: DadosDoEvento,
    db: Transacao = this.ctx.db(),
  ): Promise<void> {
    await db.execute(sql`
      INSERT INTO chamado_eventos (id, tenant_id, chamado_id, tipo, ator_tipo, ator_membro_id, status_de, status_para,
        area_de_id, area_para_id, responsavel_de_id, responsavel_para_id, prioridade_de, prioridade_para, dados)
      VALUES (${novoId()}, ${this.ctx.tenantId}, ${chamadoId}, ${e.tipo}::tipo_evento_chamado, 'membro', ${this.ctx.membro.id},
        ${e.statusDe ?? null}::status_chamado, ${e.statusPara ?? null}::status_chamado,
        ${e.areaDeId ?? null}::uuid, ${e.areaParaId ?? null}::uuid,
        ${e.responsavelDeId ?? null}::uuid, ${e.responsavelParaId ?? null}::uuid,
        ${e.prioridadeDe ?? null}::prioridade_chamado, ${e.prioridadePara ?? null}::prioridade_chamado,
        ${JSON.stringify(e.dados ?? {})}::jsonb)`)
  }

  // ---- Leitura ----

  private paraAcesso(l: LinhaDoChamado): ChamadoParaAcesso {
    return {
      id: l.id,
      status: l.status,
      areaId: l.area_id,
      responsavelId: l.responsavel_id,
      solicitanteMembroId: l.solicitante_membro_id,
      resolvidoEm: l.resolvido_em,
    }
  }

  /**
   * O chamado, se a pessoa o vê; senão 404 (não revela que existe). `jaAutorizada`: logo depois de uma ação que
   * a própria pessoa acabou de fazer (ela pode ter tirado o chamado do alcance dela, como na triagem).
   */
  async linhaVisivel(id: string, jaAutorizada = false): Promise<LinhaDoChamado> {
    const visiveis = jaAutorizada ? sql`c.excluido_em IS NULL` : await this.acesso.visiveis()
    const [l] = await this.ctx.db().execute<LinhaDoChamado>(sql`
      SELECT ${COLUNAS} ${JUNCOES} WHERE c.id = ${id} AND ${visiveis}`)
    if (!l) throw naoEncontrado()
    return l
  }

  /** Muda de estado/dados do chamado e devolve a linha atualizada. */
  async obterAcesso(id: string): Promise<ChamadoParaAcesso & { numero: number }> {
    const l = await this.linhaVisivel(id)
    return { ...this.paraAcesso(l), numero: l.numero }
  }

  private async mudancasDe(ids: string[]): Promise<Map<string, MudancaDeEstado[]>> {
    const mapa = new Map<string, MudancaDeEstado[]>()
    if (ids.length === 0) return mapa
    const linhas = await this.ctx.db().execute<{
      chamado_id: string
      em: string
      status_para: StatusDoChamado
    }>(sql`
      SELECT chamado_id, em, status_para FROM chamado_eventos
      WHERE chamado_id = ANY (${`{${ids.join(',')}}`}::uuid[]) AND status_para IS NOT NULL
      ORDER BY em, id`)
    for (const l of linhas) {
      const lista = mapa.get(l.chamado_id) ?? []
      lista.push({ em: new Date(l.em), statusPara: l.status_para })
      mapa.set(l.chamado_id, lista)
    }
    return mapa
  }

  private prazoDe(
    l: LinhaDoChamado,
    tipo: 'resposta' | 'resolucao',
    mudancas: MudancaDeEstado[],
    calendario: Awaited<ReturnType<ExpedienteService['calendario']>>,
    agora: Date,
  ): PrazoDoChamado | null {
    const cumpridoEm =
      tipo === 'resposta'
        ? l.primeira_resposta_em
        : l.status === 'resolvido' || l.status === 'fechado'
          ? l.resolvido_em
          : null
    const r = calcularPrazo({
      metaMin: tipo === 'resposta' ? l.meta_resposta_min : l.meta_resolucao_min,
      mudancas,
      statusAtual: l.status,
      cumpridoEm: cumpridoEm ? new Date(cumpridoEm) : null,
      agora,
      calendario,
    })
    return r
      ? {
          metaMin: r.metaMin,
          consumidoMin: r.consumidoMin,
          venceEm: iso(r.venceEm),
          atrasado: r.atrasado,
          cumpridoEm: iso(r.cumpridoEm),
          pausado: r.pausado,
        }
      : null
  }

  private async paraItens(linhas: LinhaDoChamado[]): Promise<ItemDeChamado[]> {
    const mudancas = await this.mudancasDe(linhas.map((l) => l.id))
    const calendario = await this.expediente.calendario()
    const agora = new Date()
    return linhas.map((l) => ({
      id: l.id,
      numero: l.numero,
      codigo: codigoDoChamado(l.numero),
      assunto: l.assunto,
      status: l.status,
      prioridade: l.prioridade,
      area: l.area_id ? { id: l.area_id, nome: l.area_nome ?? '' } : null,
      responsavel: l.responsavel_id
        ? { id: l.responsavel_id, nome: l.responsavel_nome ?? '' }
        : null,
      solicitante: {
        tipo: l.origem === 'portal' ? 'contato' : 'membro',
        nome: l.solicitante_nome ?? '',
      },
      empresaCliente: l.empresa_cliente_id
        ? { id: l.empresa_cliente_id, nome: l.empresa_nome ?? '' }
        : null,
      origem: l.origem,
      criadoEm: iso(l.criado_em) as string,
      atualizadoEm: iso(l.atualizado_em) as string,
      statusAlteradoEm: iso(l.status_alterado_em) as string,
      primeiraRespostaEm: iso(l.primeira_resposta_em),
      resolvidoEm: iso(l.resolvido_em),
      prazoResposta: this.prazoDe(l, 'resposta', mudancas.get(l.id) ?? [], calendario, agora),
      prazoResolucao: this.prazoDe(l, 'resolucao', mudancas.get(l.id) ?? [], calendario, agora),
    }))
  }

  async listar(c: ConsultaDeChamados): Promise<ListaDeChamados> {
    const db = this.ctx.db()
    const visiveis = await this.acesso.visiveis()
    const eu = this.ctx.membro.id
    const aba = (nome: ConsultaDeChamados['aba']): SQL => {
      if (nome === 'triagem') return sql`c.status = 'aguardando_triagem'`
      if (nome === 'pendentes') return sql`c.status = 'pendente'`
      if (nome === 'meus') {
        return sql`(c.responsavel_id = ${eu} OR c.solicitante_membro_id = ${eu})
          AND c.status NOT IN ('resolvido', 'fechado')`
      }
      return sql`true`
    }
    const filtros: SQL[] = [sql`${visiveis}`, aba(c.aba)]
    if (c.status) filtros.push(sql`c.status = ${c.status}::status_chamado`)
    if (c.areaId) filtros.push(sql`c.area_id = ${c.areaId}`)
    if (c.prioridade) filtros.push(sql`c.prioridade = ${c.prioridade}::prioridade_chamado`)
    if (c.responsavelId) filtros.push(sql`c.responsavel_id = ${c.responsavelId}`)
    if (c.empresaClienteId) filtros.push(sql`c.empresa_cliente_id = ${c.empresaClienteId}`)
    if (c.de) filtros.push(sql`c.criado_em >= ${c.de}::date`)
    if (c.ate) filtros.push(sql`c.criado_em < (${c.ate}::date + 1)`)
    if (c.busca) {
      const numero = /^(?:ch-?)?0*(\d{1,9})$/i.exec(c.busca)?.[1]
      filtros.push(
        numero
          ? sql`(c.numero = ${Number(numero)} OR lower(f_unaccent(c.assunto)) LIKE lower(f_unaccent(${`%${c.busca}%`})))`
          : sql`lower(f_unaccent(c.assunto)) LIKE lower(f_unaccent(${`%${c.busca}%`}))`,
      )
    }
    const onde = sql.join(filtros, sql` AND `)
    const ordem =
      c.aba === 'triagem' || c.aba === 'pendentes'
        ? sql`${PESO_DA_PRIORIDADE} DESC, c.criado_em ASC`
        : sql`c.atualizado_em DESC`
    const [total] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM chamados c WHERE ${onde}`,
    )
    const linhas = await db.execute<LinhaDoChamado>(sql`
      SELECT ${COLUNAS} ${JUNCOES} WHERE ${onde}
      ORDER BY ${ordem}, c.numero DESC LIMIT ${c.porPagina} OFFSET ${(c.pagina - 1) * c.porPagina}`)
    const [abas] = await db.execute<{
      triagem: number
      pendentes: number
      meus: number
      todos: number
    }>(sql`
      SELECT
        count(*) FILTER (WHERE ${aba('triagem')})::int AS triagem,
        count(*) FILTER (WHERE ${aba('pendentes')})::int AS pendentes,
        count(*) FILTER (WHERE ${aba('meus')})::int AS meus,
        count(*)::int AS todos
      FROM chamados c WHERE ${visiveis}`)
    return {
      itens: await this.paraItens(linhas),
      total: total?.n ?? 0,
      abas: abas ?? { triagem: 0, pendentes: 0, meus: 0, todos: 0 },
    }
  }

  async acoesDe(l: LinhaDoChamado): Promise<AcoesDoChamado> {
    const a = this.paraAcesso(l)
    const atende = await this.acesso.podeAtender(a)
    const statusPossiveis = atende ? [...TRANSICOES_DO_CHAMADO[l.status]] : []
    // Resolver/fechar só com a pessoa atendendo; "Aguardando triagem" muda só pela triagem
    return {
      responder: await this.acesso.podeResponder(a),
      notaInterna: this.acesso.podeAnotar(),
      triar: l.status === 'aguardando_triagem' && (await this.acesso.euTrio()),
      atribuir: await this.acesso.podeAtribuir(a),
      assumir: await this.acesso.podeAssumir(a),
      alterarStatus: statusPossiveis.length > 0,
      reabrir: (await this.acesso.podeReabrir(a)) && podeReabrir(l.status, l.resolvido_em),
      statusPossiveis,
    }
  }

  async obter(id: string, aposAcao = false): Promise<Chamado> {
    const l = await this.linhaVisivel(id, aposAcao)
    const db = this.ctx.db()
    const [item] = await this.paraItens([l])
    if (!item) throw naoEncontrado()
    const mensagens = await db.execute<{
      id: string
      autor_tipo: 'membro' | 'contato'
      autor_id: string
      autor_nome: string
      corpo: string
      criado_em: string
    }>(sql`
      SELECT m.id, m.autor_tipo, coalesce(m.autor_membro_id, m.autor_contato_id) AS autor_id,
        coalesce(mm.nome, cc.nome) AS autor_nome, m.corpo, m.criado_em
      FROM chamado_mensagens m
      LEFT JOIN membros mm ON mm.id = m.autor_membro_id
      LEFT JOIN contatos cc ON cc.id = m.autor_contato_id
      WHERE m.chamado_id = ${id} AND m.excluido_em IS NULL ORDER BY m.criado_em, m.id`)
    const anexos = await db.execute<{
      id: string
      mensagem_id: string | null
      nome: string
      mime: string
      tamanho: number
      estado: 'pendente_varredura' | 'limpo' | 'infectado'
      criado_em: string
    }>(sql`
      SELECT id, mensagem_id, nome, mime, tamanho, estado, criado_em FROM chamado_anexos
      WHERE chamado_id = ${id} AND mensagem_id IS NOT NULL AND excluido_em IS NULL ORDER BY criado_em, id`)
    // A nota interna só é lida por quem atende: a consulta nem roda para os demais
    const notas = this.acesso.podeAnotar()
      ? await db.execute<{
          id: string
          autor_id: string
          autor_nome: string
          corpo: string
          criado_em: string
        }>(sql`
          SELECT n.id, n.autor_membro_id AS autor_id, m.nome AS autor_nome, n.corpo, n.criado_em
          FROM chamado_notas_internas n JOIN membros m ON m.id = n.autor_membro_id
          WHERE n.chamado_id = ${id} AND n.excluido_em IS NULL ORDER BY n.criado_em, n.id`)
      : []
    const eventos = await db.execute<{
      id: string
      tipo: EventoDoChamado['tipo']
      ator_tipo: 'membro' | 'contato' | 'sistema'
      ator_nome: string | null
      status_de: StatusDoChamado | null
      status_para: StatusDoChamado | null
      area_de: string | null
      area_para: string | null
      responsavel_de: string | null
      responsavel_para: string | null
      prioridade_de: PrioridadeDoChamado | null
      prioridade_para: PrioridadeDoChamado | null
      em: string
    }>(sql`
      SELECT ev.id, ev.tipo, ev.ator_tipo, coalesce(am.nome, ac.nome) AS ator_nome, ev.status_de, ev.status_para,
        ad.nome AS area_de, ap.nome AS area_para, rd.nome AS responsavel_de, rp.nome AS responsavel_para,
        ev.prioridade_de, ev.prioridade_para, ev.em
      FROM chamado_eventos ev
      LEFT JOIN membros am ON am.id = ev.ator_membro_id
      LEFT JOIN contatos ac ON ac.id = ev.ator_contato_id
      LEFT JOIN areas_atendimento ad ON ad.id = ev.area_de_id
      LEFT JOIN areas_atendimento ap ON ap.id = ev.area_para_id
      LEFT JOIN membros rd ON rd.id = ev.responsavel_de_id
      LEFT JOIN membros rp ON rp.id = ev.responsavel_para_id
      WHERE ev.chamado_id = ${id}
        AND (ev.tipo <> 'nota_interna' OR ${this.acesso.podeAnotar()})
      ORDER BY ev.em, ev.id`)
    return {
      ...item,
      descricao: l.descricao,
      fechadoEm: iso(l.fechado_em),
      reaberturas: l.reaberturas,
      mensagens: mensagens.map((m): MensagemDoChamado => ({
        id: m.id,
        autor: { tipo: m.autor_tipo, id: m.autor_id, nome: m.autor_nome },
        corpo: m.corpo,
        anexos: anexos
          .filter((a) => a.mensagem_id === m.id)
          .map((a) => ({
            id: a.id,
            nome: a.nome,
            mime: a.mime,
            tamanho: Number(a.tamanho),
            estado: a.estado,
            criadoEm: iso(a.criado_em) as string,
          })),
        criadoEm: iso(m.criado_em) as string,
      })),
      notasInternas: notas.map((n): NotaInterna => ({
        id: n.id,
        autor: { id: n.autor_id, nome: n.autor_nome },
        corpo: n.corpo,
        criadoEm: iso(n.criado_em) as string,
      })),
      eventos: eventos.map((e): EventoDoChamado => ({
        id: e.id,
        tipo: e.tipo,
        ator: { tipo: e.ator_tipo, nome: e.ator_nome },
        statusDe: e.status_de,
        statusPara: e.status_para,
        areaDe: e.area_de,
        areaPara: e.area_para,
        responsavelDe: e.responsavel_de,
        responsavelPara: e.responsavel_para,
        prioridadeDe: e.prioridade_de,
        prioridadePara: e.prioridade_para,
        em: iso(e.em) as string,
      })),
      acoes: await this.acoesDe(l),
    }
  }

  // ---- Abrir ----

  async abrir(dados: AbrirChamadoEntrada): Promise<Chamado> {
    const db = this.ctx.db()
    this.acesso.permissao.exigir('chamados.criar')
    const areaId = dados.areaId ?? null
    let pulaTriagem = false
    if (areaId !== null) {
      const [a] = await db.execute<{ pula: boolean }>(sql`
        SELECT pula_triagem AS pula FROM areas_atendimento WHERE id = ${areaId} AND ativa AND excluido_em IS NULL`)
      if (!a) throw new ErroApi('area_invalida', 'A área não existe ou está inativa.', 400)
      pulaTriagem = a.pula
    }
    if (dados.empresaClienteId) {
      const [e] = await db.execute<{ vendedor_id: string }>(sql`
        SELECT vendedor_id FROM empresas WHERE id = ${dados.empresaClienteId} AND excluido_em IS NULL`)
      if (!e || !(await this.acesso.permissao.alcanca('empresas.ver', e.vendedor_id))) {
        throw new ErroApi('empresa_invalida', 'A empresa não existe na sua carteira.', 400)
      }
    }
    // Área desconhecida: sempre triagem. Área conhecida: triagem só se estiver ligada e a área não a pular
    const comTriagem = await this.triagem.ativa()
    const status: StatusDoChamado =
      areaId === null || (comTriagem && !pulaTriagem) ? 'aguardando_triagem' : 'pendente'
    const [n] = await db.execute<{ numero: number }>(sql`
      UPDATE tenant_configuracoes SET chamado_ultimo_numero = chamado_ultimo_numero + 1
      WHERE tenant_id = ${this.ctx.tenantId} RETURNING chamado_ultimo_numero AS numero`)
    if (!n) throw new Error('empresa sem configuração')
    const id = novoId()
    await db.execute(sql`
      INSERT INTO chamados (id, tenant_id, numero, assunto, descricao, area_id, status, prioridade, origem,
        solicitante_membro_id, empresa_cliente_id, criado_por, atualizado_por)
      VALUES (${id}, ${this.ctx.tenantId}, ${n.numero}, ${dados.assunto}, ${dados.descricao ?? null}, ${areaId},
        ${status}::status_chamado, ${dados.prioridade}::prioridade_chamado, 'interna', ${this.ctx.membro.id},
        ${dados.empresaClienteId ?? null}, ${this.ctx.membro.id}, ${this.ctx.membro.id})`)
    await this.registrarEvento(id, {
      tipo: 'aberto',
      statusPara: status,
      areaParaId: areaId,
      prioridadePara: dados.prioridade,
    })
    return this.obter(id, true)
  }

  // ---- Mudanças ----

  private exigirAberto(l: LinhaDoChamado) {
    if (l.status === 'fechado') {
      throw new ErroApi('chamado_fechado', 'O chamado está fechado.', 409)
    }
  }

  async triar(id: string, dados: TriarChamadoEntrada): Promise<Chamado> {
    const l = await this.linhaVisivel(id)
    if (l.status !== 'aguardando_triagem') {
      throw new ErroApi('fora_da_triagem', 'O chamado não está aguardando triagem.', 409)
    }
    if (!(await this.acesso.euTrio())) throw semPermissao('Você não faz a triagem dos chamados.')
    const db = this.ctx.db()
    const [area] = await db.execute<{ id: string }>(sql`
      SELECT id FROM areas_atendimento WHERE id = ${dados.areaId} AND ativa AND excluido_em IS NULL`)
    if (!area) throw new ErroApi('area_invalida', 'A área não existe ou está inativa.', 400)
    const responsavelId = dados.responsavelId ?? null
    if (responsavelId && !(await this.acesso.membroPodeReceber(responsavelId, dados.areaId))) {
      throw new ErroApi(
        'responsavel_invalido',
        'Esta pessoa não pode atender chamados desta área.',
        400,
      )
    }
    const prioridade = dados.prioridade ?? l.prioridade
    await db.execute(sql`
      UPDATE chamados SET area_id = ${dados.areaId}, status = 'pendente', prioridade = ${prioridade}::prioridade_chamado,
        responsavel_id = ${responsavelId}, status_alterado_em = now(), atualizado_em = now(),
        atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.registrarEvento(id, {
      tipo: 'triado',
      statusDe: 'aguardando_triagem',
      statusPara: 'pendente',
      areaDeId: l.area_id,
      areaParaId: dados.areaId,
      responsavelDeId: l.responsavel_id,
      responsavelParaId: responsavelId,
      prioridadeDe: l.prioridade,
      prioridadePara: prioridade,
    })
    return this.obter(id, true)
  }

  async atribuir(id: string, dados: AtribuirChamadoEntrada): Promise<Chamado> {
    const l = await this.linhaVisivel(id)
    this.exigirAberto(l)
    if (!(await this.acesso.podeAtribuir(this.paraAcesso(l)))) {
      throw semPermissao(
        'Só quem faz a triagem, o gestor da área ou quem atende tudo atribui o chamado.',
      )
    }
    if (
      dados.responsavelId &&
      !(await this.acesso.membroPodeReceber(dados.responsavelId, l.area_id))
    ) {
      throw new ErroApi(
        'responsavel_invalido',
        'Esta pessoa não pode atender chamados desta área.',
        400,
      )
    }
    if (dados.responsavelId === l.responsavel_id) return this.obter(id, true)
    await this.ctx.db().execute(sql`
      UPDATE chamados SET responsavel_id = ${dados.responsavelId}, atualizado_em = now(),
        atualizado_por = ${this.ctx.membro.id} WHERE id = ${id}`)
    await this.registrarEvento(id, {
      tipo: 'atribuido',
      responsavelDeId: l.responsavel_id,
      responsavelParaId: dados.responsavelId,
    })
    return this.obter(id, true)
  }

  async assumir(id: string): Promise<Chamado> {
    const l = await this.linhaVisivel(id)
    this.exigirAberto(l)
    if (l.responsavel_id !== null) {
      throw new ErroApi('ja_atribuido', 'Este chamado já tem um responsável.', 409)
    }
    if (!(await this.acesso.podeAssumir(this.paraAcesso(l)))) throw semPermissao()
    const novoStatus: StatusDoChamado = l.status === 'pendente' ? 'em_atendimento' : l.status
    await this.ctx.db().execute(sql`
      UPDATE chamados SET responsavel_id = ${this.ctx.membro.id}, status = ${novoStatus}::status_chamado,
        status_alterado_em = CASE WHEN ${novoStatus} <> status::text THEN now() ELSE status_alterado_em END,
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.registrarEvento(id, {
      tipo: 'assumido',
      statusDe: l.status,
      statusPara: novoStatus === l.status ? null : novoStatus,
      responsavelDeId: null,
      responsavelParaId: this.ctx.membro.id,
    })
    return this.obter(id, true)
  }

  async alterarStatus(id: string, para: StatusDoChamado): Promise<Chamado> {
    const l = await this.linhaVisivel(id)
    this.exigirAberto(l)
    if (!(await this.acesso.podeAtender(this.paraAcesso(l)))) throw semPermissao()
    if (!transicaoPermitida(l.status, para)) {
      throw new ErroApi(
        'transicao_invalida',
        `Não é possível passar de "${l.status}" para "${para}".`,
        409,
      )
    }
    const resolve = para === 'resolvido'
    const fecha = para === 'fechado'
    await this.ctx.db().execute(sql`
      UPDATE chamados SET status = ${para}::status_chamado, status_alterado_em = now(),
        resolvido_em = CASE WHEN ${resolve} THEN now() ELSE resolvido_em END,
        fechado_em = CASE WHEN ${fecha} THEN now() ELSE fechado_em END,
        atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.registrarEvento(id, {
      tipo: resolve ? 'resolvido' : fecha ? 'fechado' : 'status_alterado',
      statusDe: l.status,
      statusPara: para,
    })
    return this.obter(id, true)
  }

  async alterar(id: string, dados: AlterarChamadoEntrada): Promise<Chamado> {
    const l = await this.linhaVisivel(id)
    this.exigirAberto(l)
    const a = this.paraAcesso(l)
    const db = this.ctx.db()
    if (dados.prioridade !== undefined && dados.prioridade !== l.prioridade) {
      const pode = (await this.acesso.podeAtender(a)) || (await this.acesso.euTrio())
      if (!pode) throw semPermissao()
      await db.execute(sql`
        UPDATE chamados SET prioridade = ${dados.prioridade}::prioridade_chamado, atualizado_em = now(),
          atualizado_por = ${this.ctx.membro.id} WHERE id = ${id}`)
      await this.registrarEvento(id, {
        tipo: 'prioridade_alterada',
        prioridadeDe: l.prioridade,
        prioridadePara: dados.prioridade,
      })
    }
    if (dados.areaId !== undefined && dados.areaId !== l.area_id) {
      if (!(await this.acesso.podeMudarDeArea(a))) throw semPermissao()
      const [area] = await db.execute<{ id: string }>(sql`
        SELECT id FROM areas_atendimento WHERE id = ${dados.areaId} AND ativa AND excluido_em IS NULL`)
      if (!area) throw new ErroApi('area_invalida', 'A área não existe ou está inativa.', 400)
      // O responsável que não atende a área nova perde o chamado
      const mantem =
        l.responsavel_id !== null &&
        (await this.acesso.membroPodeReceber(l.responsavel_id, dados.areaId))
      await db.execute(sql`
        UPDATE chamados SET area_id = ${dados.areaId}, responsavel_id = ${mantem ? l.responsavel_id : null},
          atualizado_em = now(), atualizado_por = ${this.ctx.membro.id} WHERE id = ${id}`)
      await this.registrarEvento(id, {
        tipo: 'area_alterada',
        areaDeId: l.area_id,
        areaParaId: dados.areaId,
        responsavelDeId: l.responsavel_id,
        responsavelParaId: mantem ? l.responsavel_id : null,
      })
    }
    return this.obter(id, true)
  }

  async reabrir(id: string): Promise<Chamado> {
    const l = await this.linhaVisivel(id)
    if (l.status !== 'resolvido') {
      throw new ErroApi('nao_resolvido', 'Só um chamado resolvido pode ser reaberto.', 409)
    }
    if (!(await this.acesso.podeReabrir(this.paraAcesso(l)))) throw semPermissao()
    if (!podeReabrir(l.status, l.resolvido_em)) {
      throw new ErroApi(
        'prazo_de_reabertura_vencido',
        `O prazo de ${PRAZO_DE_REABERTURA_DIAS} dias para reabrir já passou: abra um novo chamado.`,
        409,
      )
    }
    await this.ctx.db().execute(sql`
      UPDATE chamados SET status = 'em_atendimento', resolvido_em = NULL, reaberturas = reaberturas + 1,
        status_alterado_em = now(), atualizado_em = now(), atualizado_por = ${this.ctx.membro.id}
      WHERE id = ${id}`)
    await this.registrarEvento(id, {
      tipo: 'reaberto',
      statusDe: 'resolvido',
      statusPara: 'em_atendimento',
    })
    return this.obter(id, true)
  }
}

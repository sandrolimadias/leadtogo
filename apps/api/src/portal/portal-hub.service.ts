import { novoId, sql } from '@leadtogo/db'
import {
  type ConsultaDoHub,
  type CriarTarefaDoChamadoEntrada,
  type IndicadoresDoHub,
  type MudancaDeEstado,
  type TarefaDoChamado,
  codigoDoChamado,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { AuditoriaService } from '../auditoria/auditoria.service.js'
import { AtividadesService } from '../carteira/atividades.service.js'
import { ChamadosService } from '../chamados/chamados.service.js'
import { ExpedienteService } from '../chamados/expediente.service.js'
import { medir, type LinhaParaMedir } from '../chamados/metricas-calculo.js'
import { ErroApi } from '../http/erro-api.js'

type LinhaDoHub = LinhaParaMedir & { id: string } & Record<string, unknown>

/** Limite de chamados analisados por consulta (o mesmo espírito do limite das métricas). */
const LIMITE = 5000

/**
 * Hub do portal no CRM (aba Chamados): indicadores dos chamados abertos pelos clientes e as tarefas ligadas
 * ao chamado. Quem tem `portal.ver` vê o conjunto de TODOS os chamados do portal (é a visão do gestor do
 * portal, não a carteira de cada vendedor).
 */
@Injectable()
export class PortalHubService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly chamados: ChamadosService,
    private readonly expediente: ExpedienteService,
    private readonly atividades: AtividadesService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private get permissao() {
    return new PermissaoService(this.ctx)
  }

  async indicadores(c: ConsultaDoHub): Promise<IndicadoresDoHub> {
    const db = this.ctx.db()
    const linhas = await db.execute<LinhaDoHub>(sql`
      SELECT c.id, c.status::text AS status, c.area_id, a.nome AS area_nome, a.meta_resposta_min,
        a.meta_resolucao_min, c.responsavel_id, r.nome AS responsavel_nome, c.criado_em,
        c.primeira_resposta_em, c.resolvido_em
      FROM chamados c
      LEFT JOIN areas_atendimento a ON a.id = c.area_id
      LEFT JOIN membros r ON r.id = c.responsavel_id
      WHERE c.origem = 'portal' AND c.excluido_em IS NULL
        AND (c.status NOT IN ('resolvido', 'fechado') OR c.criado_em >= now() - ${`${c.dias} days`}::interval)
      ORDER BY c.criado_em DESC LIMIT ${LIMITE}`)
    const ids = linhas.map((l) => l.id)
    const mudancas = new Map<string, MudancaDeEstado[]>()
    for (let i = 0; i < ids.length; i += 1000) {
      for (const [id, lista] of await this.chamados.mudancasDe(ids.slice(i, i + 1000))) {
        mudancas.set(id, lista)
      }
    }
    const calendario = await this.expediente.calendario()
    const agora = new Date()
    const medidas = linhas.map((l) => ({
      l,
      m: medir(l, mudancas.get(l.id) ?? [], calendario, agora),
    }))
    const abertos = medidas.filter(({ m }) => m.aberto)
    // "Prazo estourando": aberto cuja primeira resposta ainda não saiu e já passou da meta, ou que passou da meta de resolução
    const estourando = abertos.filter(
      ({ m }) =>
        (m.respostaMin === null && m.respostaNoPrazo === false) || m.resolucaoNoPrazo === false,
    )
    const noPeriodo = medidas.filter(
      ({ l }) => new Date(l.criado_em).getTime() >= agora.getTime() - c.dias * 86_400_000,
    )
    const resp = noPeriodo.map(({ m }) => m.respostaNoPrazo).filter((v): v is boolean => v !== null)

    const [av] = await db.execute<{ media: string | null; total: number }>(sql`
      SELECT avg(v.nota)::numeric(4,2)::text AS media, count(*)::int AS total
      FROM chamado_avaliacoes v
      WHERE v.criado_em >= now() - ${`${c.dias} days`}::interval`)
    const [acessos] = await db.execute<{ ativos: number; pedidos: number }>(sql`
      SELECT (SELECT count(*)::int FROM portal_acessos WHERE situacao = 'ativo' AND excluido_em IS NULL) AS ativos,
             (SELECT count(*)::int FROM portal_pedidos_acesso WHERE situacao = 'pendente') AS pedidos`)
    return {
      periodoDias: c.dias,
      emAberto: abertos.length,
      prazoEstourando: estourando.length,
      primeiraRespostaNoPrazo:
        resp.length === 0
          ? null
          : Math.round((resp.filter(Boolean).length / resp.length) * 1000) / 10,
      notaMedia: av?.media == null ? null : Number(av.media),
      avaliacoes: av?.total ?? 0,
      acessosAtivos: acessos?.ativos ?? 0,
      pedidosPendentes: acessos?.pedidos ?? 0,
    }
  }

  // ------------------------------------------------------------------------------------ tarefas

  async tarefas(chamadoId: string): Promise<{ itens: TarefaDoChamado[] }> {
    await this.chamados.linhaVisivel(chamadoId)
    const linhas = await this.ctx.db().execute<{
      id: string
      titulo: string
      situacao: string
      responsavel_id: string | null
      responsavel_nome: string | null
      data_inicio: string | Date
    }>(sql`
      SELECT a.id, a.titulo, a.situacao::text AS situacao, a.responsavel_id, m.nome AS responsavel_nome, a.data_inicio
      FROM chamado_atividades ca
      JOIN atividades a ON a.id = ca.atividade_id AND a.excluido_em IS NULL
      LEFT JOIN membros m ON m.id = a.responsavel_id
      WHERE ca.chamado_id = ${chamadoId} AND ca.excluido_em IS NULL
      ORDER BY a.data_inicio, a.id`)
    return {
      itens: [...linhas].map((l) => ({
        id: l.id,
        titulo: l.titulo,
        situacao: l.situacao,
        responsavel: l.responsavel_id
          ? { id: l.responsavel_id, nome: l.responsavel_nome ?? '' }
          : null,
        dataInicio: new Date(l.data_inicio).toISOString(),
      })),
    }
  }

  /**
   * "Criar tarefa": cria uma Atividade do tipo Tarefa (pendente) ligada ao chamado e à empresa-cliente. Vale
   * as regras de quem cria atividades (`atividades.criar`; escolher outro responsável exige
   * `atividades.atribuir_responsavel`).
   */
  async criarTarefa(
    chamadoId: string,
    dados: CriarTarefaDoChamadoEntrada,
  ): Promise<{ itens: TarefaDoChamado[] }> {
    const l = await this.chamados.linhaVisivel(chamadoId)
    this.permissao.exigir('atividades.criar', 'Seu perfil não registra atividades.')
    const db = this.ctx.db()
    const [tipo] = await db.execute<{ id: string }>(sql`
      SELECT id FROM tipos_atividade WHERE chave_sistema = 'tarefa' AND ativo AND excluido_em IS NULL`)
    if (!tipo) {
      throw new ErroApi(
        'tipo_tarefa_ausente',
        'O tipo de atividade "Tarefa" não está disponível.',
        409,
      )
    }
    // A empresa só entra na tarefa se a pessoa pode editar a carteira dela (senão a tarefa fica avulsa)
    let empresaId: string | null = null
    if (l.empresa_cliente_id) {
      const [e] = await db.execute<{ vendedor_id: string | null }>(sql`
        SELECT vendedor_id FROM empresas WHERE id = ${l.empresa_cliente_id} AND excluido_em IS NULL`)
      if (e && (await this.permissao.alcanca('empresas.editar', e.vendedor_id)))
        empresaId = l.empresa_cliente_id
    }
    const criada = await this.atividades.criar({
      tipoAtividadeId: tipo.id,
      titulo: dados.titulo,
      empresaId,
      ...(dados.responsavelId ? { responsavelId: dados.responsavelId } : {}),
      dataInicio: dados.prazo ?? new Date(Date.now() + 86_400_000).toISOString(),
      diaInteiro: false,
      situacao: 'pendente',
      importante: false,
      urgente: false,
      observacoes: `Chamado ${codigoDoChamado(l.numero)} — ${l.assunto}`,
    })
    await db.execute(sql`
      INSERT INTO chamado_atividades (id, tenant_id, chamado_id, atividade_id, criado_por)
      VALUES (${novoId()}, ${this.ctx.tenantId}, ${chamadoId}, ${criada.id}, ${this.ctx.membro.id})`)
    await this.auditoria.registrar({
      entidade: 'chamado',
      entidadeId: chamadoId,
      acao: 'criar_tarefa',
      alteracoes: { atividadeId: criada.id, titulo: dados.titulo },
    })
    return this.tarefas(chamadoId)
  }
}

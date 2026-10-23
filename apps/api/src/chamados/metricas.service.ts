import { type SQL, sql } from '@leadtogo/db'
import {
  type ConsultaDeChamados,
  type ConsultaDeMetricas,
  type MetricasDeChamados,
  type MudancaDeEstado,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_STATUS_DO_CHAMADO,
  STATUS_DO_CHAMADO,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { ErroApi } from '../http/erro-api.js'
import { celulaDeCsv } from '../importacao/relatorio.service.js'
import { ChamadosService } from './chamados.service.js'
import { ExpedienteService } from './expediente.service.js'
import { agregar, type LinhaParaMedir, type Medida, medir } from './metricas-calculo.js'

/** Linhas analisadas por consulta de métricas e por exportação. */
export const LIMITE_DAS_METRICAS = 5000
export const LIMITE_DA_EXPORTACAO = 10_000

type LinhaMetrica = LinhaParaMedir & { id: string } & Record<string, unknown>

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const diasAtras = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toLocaleDateString('sv-SE', {
    timeZone: 'America/Sao_Paulo',
  })

/**
 * Métricas dos chamados e exportação em CSV (Fase 2). Tudo sai da tabela de chamados e da linha do tempo
 * (`chamado_eventos`), em horas úteis do expediente da empresa; "% dentro do prazo" só conta os chamados cuja
 * área tem meta. As métricas valem sobre o alcance de `chamados.ver_metricas` (própria, equipe ou todas)
 * aplicado ao RESPONSÁVEL do chamado; a exportação vale sobre o que a pessoa vê (`chamados.exportar`).
 */
@Injectable()
export class MetricasService {
  constructor(
    private readonly ctx: ContextoTenantService,
    private readonly chamados: ChamadosService,
    private readonly expediente: ExpedienteService,
  ) {}

  private get permissao() {
    return new PermissaoService(this.ctx)
  }

  async metricas(c: ConsultaDeMetricas): Promise<MetricasDeChamados> {
    const alcance = this.permissao.alcance('chamados.ver_metricas')
    if (!alcance)
      throw new ErroApi('acesso_negado', 'Seu perfil não vê as métricas dos chamados.', 403)
    const de = c.de ?? diasAtras(30)
    const ate = c.ate ?? hoje()
    if (de > ate) throw new ErroApi('periodo_invalido', 'A data inicial é depois da final.', 400)
    const filtros: SQL[] = [
      sql`c.excluido_em IS NULL`,
      sql`c.criado_em >= (${de}::date AT TIME ZONE ${(await this.expediente.calendario()).fusoHorario})`,
      sql`c.criado_em < ((${ate}::date + 1) AT TIME ZONE ${(await this.expediente.calendario()).fusoHorario})`,
    ]
    const escopo = await this.permissao.condicao('chamados.ver_metricas', sql`c.responsavel_id`)
    if (escopo) filtros.push(escopo)
    if (c.areaId) filtros.push(sql`c.area_id = ${c.areaId}`)
    if (c.responsavelId) filtros.push(sql`c.responsavel_id = ${c.responsavelId}`)
    const linhas = await this.ctx.db().execute<LinhaMetrica>(sql`
      SELECT c.id, c.status, c.area_id, a.nome AS area_nome, a.meta_resposta_min, a.meta_resolucao_min,
        c.responsavel_id, r.nome AS responsavel_nome, c.criado_em, c.primeira_resposta_em, c.resolvido_em
      FROM chamados c
      LEFT JOIN areas_atendimento a ON a.id = c.area_id
      LEFT JOIN membros r ON r.id = c.responsavel_id
      WHERE ${sql.join(filtros, sql` AND `)}
      ORDER BY c.criado_em DESC LIMIT ${LIMITE_DAS_METRICAS + 1}`)
    const truncado = linhas.length > LIMITE_DAS_METRICAS
    const analisadas = linhas.slice(0, LIMITE_DAS_METRICAS)
    const mudancas = await this.mudancasEmLotes(analisadas.map((l) => l.id))
    const calendario = await this.expediente.calendario()
    const agora = new Date()
    const medidas: Medida[] = analisadas.map((l) =>
      medir(l, mudancas.get(l.id) ?? [], calendario, agora),
    )

    const porArea = new Map<string, Medida[]>()
    const porResponsavel = new Map<string, Medida[]>()
    for (const m of medidas) {
      if (m.areaId) porArea.set(m.areaId, [...(porArea.get(m.areaId) ?? []), m])
      const chave = m.responsavelId ?? 'sem'
      porResponsavel.set(chave, [...(porResponsavel.get(chave) ?? []), m])
    }
    const maisChamados = <T extends { total: number }>(a: T, b: T) => b.total - a.total
    return {
      de,
      ate,
      alcance,
      geral: agregar(medidas),
      porArea: [...porArea.entries()]
        .map(([id, ms]) => ({ ...agregar(ms), area: { id, nome: ms[0]?.areaNome ?? '' } }))
        .sort(maisChamados),
      porResponsavel: [...porResponsavel.entries()]
        .map(([id, ms]) => ({
          ...agregar(ms),
          responsavel: id === 'sem' ? null : { id, nome: ms[0]?.responsavelNome ?? '' },
        }))
        .sort(maisChamados),
      porStatus: STATUS_DO_CHAMADO.map((status) => ({
        status,
        total: medidas.filter((m) => m.status === status).length,
      })),
      truncado,
    }
  }

  private async mudancasEmLotes(ids: string[]): Promise<Map<string, MudancaDeEstado[]>> {
    const tudo = new Map<string, MudancaDeEstado[]>()
    for (let i = 0; i < ids.length; i += 1000) {
      for (const [id, lista] of await this.chamados.mudancasDe(ids.slice(i, i + 1000)))
        tudo.set(id, lista)
    }
    return tudo
  }

  /** CSV (`;`, UTF-8 com BOM) dos chamados que a pessoa vê, com os mesmos filtros da lista. */
  async csv(consulta: ConsultaDeChamados): Promise<string> {
    this.permissao.exigir('chamados.exportar')
    const itens = await this.chamados.paraExportar(consulta, LIMITE_DA_EXPORTACAO)
    const cabecalho = [
      'Número',
      'Assunto',
      'Área',
      'Estado',
      'Prioridade',
      'Responsável',
      'Solicitante',
      'Empresa',
      'Aberto em',
      'Primeira resposta em',
      'Resolvido em',
      'Meta de resposta (min úteis)',
      'Resposta: consumido (min úteis)',
      'Resposta: situação',
      'Meta de resolução (min úteis)',
      'Resolução: consumido (min úteis)',
      'Resolução: situação',
    ]
    const situacao = (
      p: { atrasado: boolean; pausado: boolean; cumpridoEm: string | null } | null,
    ) =>
      p === null
        ? 'Sem meta'
        : p.pausado
          ? 'Pausado'
          : p.atrasado
            ? 'Atrasado'
            : p.cumpridoEm
              ? 'Cumprido no prazo'
              : 'No prazo'
    const data = (v: string | null) =>
      v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''
    const corpo = itens.map((i) => [
      i.codigo,
      i.assunto,
      i.area?.nome ?? '',
      ROTULO_DO_STATUS_DO_CHAMADO[i.status],
      ROTULO_DA_PRIORIDADE[i.prioridade],
      i.responsavel?.nome ?? '',
      i.solicitante.nome,
      i.empresaCliente?.nome ?? '',
      data(i.criadoEm),
      data(i.primeiraRespostaEm),
      data(i.resolvidoEm),
      i.prazoResposta ? String(i.prazoResposta.metaMin) : '',
      i.prazoResposta ? String(Math.round(i.prazoResposta.consumidoMin)) : '',
      situacao(i.prazoResposta),
      i.prazoResolucao ? String(i.prazoResolucao.metaMin) : '',
      i.prazoResolucao ? String(Math.round(i.prazoResolucao.consumidoMin)) : '',
      situacao(i.prazoResolucao),
    ])
    return `\uFEFF${[cabecalho, ...corpo].map((l) => l.map(celulaDeCsv).join(';')).join('\r\n')}\r\n`
  }
}

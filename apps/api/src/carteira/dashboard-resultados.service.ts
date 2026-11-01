import { and, eq, isNull, schema, type SQL, sql } from '@leadtogo/db'
import {
  type AssociadosDoDashboard,
  type ConsultaDeAssociados,
  type ConsultaDeResultados,
  type ConsultaDoMapaDoDashboard,
  type ContornosDaUf,
  diaNoFuso,
  inicioDoDiaNoFuso,
  instantesDoIntervalo,
  type MapaDoDashboard,
  mesesDoPeriodo,
  type PeriodoCalculado,
  periodoDoDashboard,
  type ResultadosDoDashboard,
  taxaDeConversao,
  variacaoPercentual,
  type VisaoDoDashboard,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { PermissaoService } from '../acesso/permissao.service.js'
import { ErroApi } from '../http/erro-api.js'
import { condicaoDeVisibilidadeDaAtividade, fusoDaEmpresa } from './atividades-leitura.js'
import {
  condicaoDeResponsaveis,
  type EscopoDaCarteira,
  escopoDaCarteira,
  type Responsaveis,
} from './regras-de-carteira.js'

const { funis } = schema

type Linha = Record<string, unknown>
type Cor = ResultadosDoDashboard['funil']['fases'][number]['cor']
const n = (v: unknown): number => Number(v ?? 0)
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`
const dia = (d: string) => sql`${d}::date`
const linhas = (r: unknown): Linha[] => r as Linha[]
/** Condição sobre a coluna do responsável; sem restrição, `true`. */
const naLista = (r: Responsaveis, coluna: SQL): SQL =>
  condicaoDeResponsaveis(r, coluna) ?? sql`true`

/** O que todos os blocos da aba Resultados calculam antes: o período, a visão e de quem são os números. */
interface Base {
  fuso: string
  agora: Date
  periodo: PeriodoCalculado
  de: Date
  ate: Date
  anterior: { de: Date; ate: Date }
  visao: VisaoDoDashboard
  visoes: VisaoDoDashboard[]
  /** Os responsáveis da visão (`null` = todos) */
  quem: Responsaveis
  escopo: EscopoDaCarteira
}

/**
 * A aba Resultados do Dashboard (docs/plano_dashboard_v2.md): números do período, na visão escolhida
 * (Minha, Equipe ou Empresa, limitada pelo alcance de `empresas.ver`), calculados no banco no fuso da empresa.
 * "Associado" é a empresa com o Status de chave `cliente` (pelo histórico de Status, nunca pelo nome da tag).
 */
@Injectable()
export class DashboardResultadosService {
  constructor(private readonly ctx: ContextoTenantService) {}

  // ---------------------------------------------------------------------------------------------------
  // Período e visão
  // ---------------------------------------------------------------------------------------------------

  private async base(consulta: ConsultaDoMapaDoDashboard): Promise<Base> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const fuso = await fusoDaEmpresa(db, this.ctx.tenantId)
    const agora = new Date()
    const anoAtual = Number(diaNoFuso(agora, fuso).slice(0, 4))
    if (consulta.periodo === 'ano_anterior' && (consulta.ano ?? anoAtual) >= anoAtual) {
      throw new ErroApi('periodo_invalido', 'Escolha um ano anterior ao atual.', 400)
    }
    const periodo = periodoDoDashboard(consulta.periodo, agora, fuso, consulta)
    const { de, ate } = instantesDoIntervalo(periodo, fuso)

    const permissao = new PermissaoService(this.ctx)
    const alcance = permissao.alcance('empresas.ver')
    const visoes: VisaoDoDashboard[] =
      alcance === 'todas'
        ? ['minha', 'equipe', 'empresa']
        : alcance === 'equipe'
          ? ['minha', 'equipe']
          : ['minha']
    if (!visoes.includes(consulta.visao)) {
      throw new ErroApi(
        'acesso_negado',
        'Seu perfil de acesso não permite ver os números desta visão.',
        403,
      )
    }
    const quem: Responsaveis =
      consulta.visao === 'empresa'
        ? null
        : consulta.visao === 'equipe'
          ? await permissao.equipe()
          : [escopo.membroId]
    return {
      fuso,
      agora,
      periodo,
      de,
      ate,
      anterior: instantesDoIntervalo(periodo.anterior, fuso),
      visao: consulta.visao,
      visoes,
      quem,
      escopo,
    }
  }

  /** Empresas da visão e do alcance (alias `e`), não excluídas. */
  private empresasDaVisao(b: Base): SQL {
    return sql`e.excluido_em IS NULL AND ${naLista(b.quem, sql`e.vendedor_id`)}
      AND ${naLista(b.escopo.empresas.ver, sql`e.vendedor_id`)}`
  }

  /** A tag de Status Cliente da empresa (pela chave do sistema). */
  private async tagCliente(): Promise<{ id: string; nome: string; cor: Cor } | null> {
    const [t] = linhas(
      await this.ctx.db().execute(sql`
        SELECT id, nome, cor FROM tags
        WHERE chave_sistema = 'cliente' AND excluido_em IS NULL ORDER BY criado_em LIMIT 1`),
    )
    return t ? { id: t['id'] as string, nome: t['nome'] as string, cor: t['cor'] as Cor } : null
  }

  /** "Era associada no instante": a última linha da tag Cliente antes do instante é `adicionada`. */
  private associadaEm(tagId: string, instante: Date): SQL {
    return sql`coalesce((
      SELECT h.acao = 'adicionada' FROM empresa_tags_historico h
      WHERE h.empresa_id = e.id AND h.tag_id = ${tagId} AND h.em < ${ts(instante)}
      ORDER BY h.em DESC, h.id DESC LIMIT 1), false)`
  }

  private periodoDaResposta(p: PeriodoCalculado) {
    return {
      chave: p.chave,
      rotulo: p.rotulo,
      inicio: p.inicio,
      fim: p.fim,
      anterior: { inicio: p.anterior.inicio, fim: p.anterior.fim },
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // GET /v1/carteira/dashboard/resultados
  // ---------------------------------------------------------------------------------------------------

  async resultados(consulta: ConsultaDeResultados): Promise<ResultadosDoDashboard> {
    const b = await this.base(consulta)
    const db = this.ctx.db()
    const { periodo, de, ate, anterior, fuso } = b

    const minhasOportunidades = sql`o.excluido_em IS NULL AND ${this.empresasDaVisao({
      ...b,
      quem: null,
    })} AND ${naLista(b.quem, sql`o.responsavel_id`)}`
    const noPeriodo = (de_: Date, ate_: Date) =>
      sql`o.data_fechamento >= ${ts(de_)} AND o.data_fechamento < ${ts(ate_)}`

    // ---- oportunidades fechadas no período (e as vendas e o MRR do anterior) ----
    const [o = {}] = linhas(
      await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE o.status = 'conquistado' AND ${noPeriodo(de, ate)}) AS conq_qtd,
          coalesce(sum(o.valor_total) FILTER (WHERE o.status = 'conquistado' AND ${noPeriodo(de, ate)}), 0) AS conq_total,
          coalesce(sum(o.valor_mensal) FILTER (WHERE o.status = 'conquistado' AND ${noPeriodo(de, ate)}), 0) AS conq_mensal,
          count(*) FILTER (WHERE o.status = 'perdido' AND ${noPeriodo(de, ate)}) AS perd_qtd,
          coalesce(sum(o.valor_total) FILTER (WHERE o.status = 'perdido' AND ${noPeriodo(de, ate)}), 0) AS perd_total,
          count(*) FILTER (WHERE o.status = 'cancelado' AND ${noPeriodo(de, ate)}) AS canc_qtd,
          coalesce(sum(o.valor_total) FILTER (WHERE o.status = 'cancelado' AND ${noPeriodo(de, ate)}), 0) AS canc_total,
          coalesce(sum(o.valor_total) FILTER (WHERE o.status = 'conquistado'
            AND ${noPeriodo(anterior.de, anterior.ate)}), 0) AS vendas_anterior,
          coalesce(sum(o.valor_mensal) FILTER (WHERE o.status = 'conquistado'
            AND ${noPeriodo(anterior.de, anterior.ate)}), 0) AS mrr_anterior
        FROM oportunidades o JOIN empresas e ON e.id = o.empresa_id
        WHERE ${minhasOportunidades}`),
    )

    // ---- previsão: as ativas na última fase ativa de cada funil ativo ----
    const porFunil = linhas(
      await db.execute(sql`
        WITH finais AS (
          SELECT DISTINCT ON (f.funil_id) f.id, f.funil_id, f.nome
          FROM funil_fases f
          JOIN funis fu ON fu.id = f.funil_id AND fu.excluido_em IS NULL AND fu.ativo
          WHERE f.excluido_em IS NULL AND f.ativo
          ORDER BY f.funil_id, f.ordem DESC, f.nome DESC
        )
        SELECT fi.funil_id, fu.nome AS funil, fi.id AS fase_id, fi.nome AS fase, fu.ordem,
          coalesce(sum(o.valor_total) FILTER (WHERE o.data_prevista_fechamento
            BETWEEN ${dia(periodo.inicio)} AND ${dia(periodo.fim)}), 0) AS valor,
          coalesce(sum(o.valor_ponderado) FILTER (WHERE o.data_prevista_fechamento
            BETWEEN ${dia(periodo.inicio)} AND ${dia(periodo.fim)}), 0) AS ponderado,
          count(o.id) FILTER (WHERE o.data_prevista_fechamento
            BETWEEN ${dia(periodo.inicio)} AND ${dia(periodo.fim)}) AS quantidade,
          count(o.id) FILTER (WHERE o.data_prevista_fechamento IS NULL) AS sem_previsao
        FROM finais fi
        JOIN funis fu ON fu.id = fi.funil_id
        LEFT JOIN (
          SELECT o.* FROM oportunidades o JOIN empresas e ON e.id = o.empresa_id
          WHERE ${minhasOportunidades} AND o.status = 'ativo'
        ) o ON o.fase_id = fi.id
        GROUP BY fi.funil_id, fu.nome, fi.id, fi.nome, fu.ordem
        ORDER BY fu.ordem ASC, fu.nome ASC`),
    )

    // ---- MRR conquistado mês a mês ----
    const meses = mesesDoPeriodo(periodo, diaNoFuso(b.agora, fuso))
    const primeiro = meses[0] as (typeof meses)[number]
    const ultimo = meses[meses.length - 1] as (typeof meses)[number]
    const doMeses = linhas(
      await db.execute(sql`
        SELECT to_char(date_trunc('month', o.data_fechamento AT TIME ZONE ${fuso}), 'YYYY-MM') AS mes,
               coalesce(sum(o.valor_mensal), 0) AS valor, count(*) AS quantidade
        FROM oportunidades o JOIN empresas e ON e.id = o.empresa_id
        WHERE ${minhasOportunidades} AND o.status = 'conquistado'
          AND o.data_fechamento >= ${ts(inicioDoDiaNoFuso(primeiro.inicio, fuso))}
          AND o.data_fechamento < ${ts(inicioDoDiaNoFuso(ultimo.fimExclusivo, fuso))}
        GROUP BY 1`),
    )
    const serie = meses.map((m) => {
      const l = doMeses.find((x) => x['mes'] === m.mes)
      return { ...m, valor: n(l?.['valor']), quantidade: n(l?.['quantidade']) }
    })

    // ---- principais motivos de perda ----
    const motivos = linhas(
      await db.execute(sql`
        SELECT m.id, m.nome, count(*) AS quantidade, coalesce(sum(o.valor_total), 0) AS total
        FROM oportunidades o JOIN empresas e ON e.id = o.empresa_id JOIN motivos m ON m.id = o.motivo_id
        WHERE ${minhasOportunidades} AND o.status IN ('perdido', 'cancelado') AND ${noPeriodo(de, ate)}
        GROUP BY m.id, m.nome ORDER BY count(*) DESC, m.nome ASC LIMIT 5`),
    )

    // ---- funil por fase (as ativas de hoje) ----
    const [funil] = await db
      .select()
      .from(funis)
      .where(
        and(
          isNull(funis.excluidoEm),
          consulta.funilId ? eq(funis.id, consulta.funilId) : eq(funis.padrao, true),
        ),
      )
    if (!funil) throw new ErroApi('funil_nao_encontrado', 'Funil não encontrado.', 404)
    const doFunil = linhas(
      await db.execute(sql`
        SELECT f.id, f.nome, f.cor, count(o.id) AS quantidade, coalesce(sum(o.valor_total), 0) AS total
        FROM funil_fases f
        LEFT JOIN (
          SELECT o.* FROM oportunidades o JOIN empresas e ON e.id = o.empresa_id
          WHERE ${minhasOportunidades} AND o.status = 'ativo'
        ) o ON o.fase_id = f.id
        WHERE f.funil_id = ${funil.id} AND f.excluido_em IS NULL AND f.ativo
        GROUP BY f.id, f.nome, f.cor, f.ordem ORDER BY f.ordem ASC, f.nome ASC`),
    )

    // ---- associados e churn (pelo histórico de Status) ----
    const tag = await this.tagCliente()
    let associados: ResultadosDoDashboard['associados'] = {
      tag,
      atual: 0,
      inicio: 0,
      novos: 0,
      desassociados: 0,
      churn: null,
      historicoDesde: null,
    }
    if (tag) {
      const [a = {}] = linhas(
        await db.execute(sql`
          WITH estado AS (
            SELECT ${this.associadaEm(tag.id, de)} AS no_inicio, ${this.associadaEm(tag.id, ate)} AS no_fim
            FROM empresas e WHERE ${this.empresasDaVisao(b)}
          )
          SELECT count(*) FILTER (WHERE no_fim) AS atual,
                 count(*) FILTER (WHERE no_inicio) AS inicio,
                 count(*) FILTER (WHERE no_fim AND NOT no_inicio) AS novos,
                 count(*) FILTER (WHERE no_inicio AND NOT no_fim) AS desassociados,
                 (SELECT min(em) FROM empresa_tags_historico WHERE tag_id = ${tag.id}) AS desde
          FROM estado`),
      )
      const inicio = n(a['inicio'])
      const desassociados = n(a['desassociados'])
      associados = {
        tag,
        atual: n(a['atual']),
        inicio,
        novos: n(a['novos']),
        desassociados,
        churn: inicio === 0 ? null : Math.round((desassociados / inicio) * 1000) / 10,
        historicoDesde: a['desde'] ? new Date(a['desde'] as string).toISOString() : null,
      }
    }

    // ---- visitas e outras atividades realizadas ----
    const realizadaNo = (de_: Date, ate_: Date) =>
      sql`atividades.realizada_em >= ${ts(de_)} AND atividades.realizada_em < ${ts(ate_)}`
    const [r = {}] = linhas(
      await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE t.chave_sistema = 'visita' AND ${realizadaNo(de, ate)}) AS visitas,
          count(*) FILTER (WHERE t.chave_sistema = 'visita' AND ${realizadaNo(anterior.de, anterior.ate)}) AS visitas_ant,
          count(*) FILTER (WHERE t.chave_sistema IS DISTINCT FROM 'visita' AND ${realizadaNo(de, ate)}) AS outras,
          count(*) FILTER (WHERE t.chave_sistema IS DISTINCT FROM 'visita'
            AND ${realizadaNo(anterior.de, anterior.ate)}) AS outras_ant
        FROM atividades
        JOIN tipos_atividade t ON t.id = atividades.tipo_atividade_id
        LEFT JOIN empresas ON empresas.id = atividades.empresa_id
        WHERE atividades.excluido_em IS NULL AND atividades.situacao = 'realizada'
          AND ${naLista(b.quem, sql`atividades.responsavel_id`)}
          AND ${condicaoDeVisibilidadeDaAtividade(b.escopo) ?? sql`true`}
          AND atividades.realizada_em >= ${ts(anterior.de < de ? anterior.de : de)}
          AND atividades.realizada_em < ${ts(ate)}`),
    )

    const conquistadas = n(o['conq_qtd'])
    const perdidas = n(o['perd_qtd'])
    const mrr = n(o['conq_mensal'])
    const vendas = n(o['conq_total'])
    const finais = porFunil.map((f) => ({
      funilId: f['funil_id'] as string,
      funil: f['funil'] as string,
      faseId: f['fase_id'] as string,
      fase: f['fase'] as string,
      valor: n(f['valor']),
      ponderado: n(f['ponderado']),
      quantidade: n(f['quantidade']),
      semPrevisao: n(f['sem_previsao']),
    }))
    return {
      periodo: this.periodoDaResposta(periodo),
      visao: b.visao,
      visoes: b.visoes,
      previsao: {
        valor: soma(finais.map((f) => f.valor)),
        ponderado: soma(finais.map((f) => f.ponderado)),
        quantidade: finais.reduce((s, f) => s + f.quantidade, 0),
        semPrevisao: finais.reduce((s, f) => s + f.semPrevisao, 0),
        porFunil: finais.map(({ ponderado: _p, semPrevisao: _s, ...f }) => f),
      },
      vendas: {
        total: vendas,
        quantidade: conquistadas,
        anterior: n(o['vendas_anterior']),
        variacao: variacaoPercentual(vendas, n(o['vendas_anterior'])),
      },
      mrr: {
        valor: mrr,
        quantidade: conquistadas,
        anterior: n(o['mrr_anterior']),
        variacao: variacaoPercentual(mrr, n(o['mrr_anterior'])),
        serie,
      },
      conversao: { taxa: taxaDeConversao(conquistadas, perdidas), conquistadas, perdidas },
      resultado: {
        conquistadas: { quantidade: conquistadas, total: vendas, mensal: mrr },
        perdidasECanceladas: {
          quantidade: perdidas + n(o['canc_qtd']),
          total: soma([n(o['perd_total']), n(o['canc_total'])]),
          perdidas,
          canceladas: n(o['canc_qtd']),
        },
      },
      motivosDePerda: motivos.map((m) => ({
        id: m['id'] as string,
        nome: m['nome'] as string,
        quantidade: n(m['quantidade']),
        total: n(m['total']),
      })),
      funil: {
        id: funil.id,
        nome: funil.nome,
        fases: doFunil.map((f) => ({
          id: f['id'] as string,
          nome: f['nome'] as string,
          cor: f['cor'] as Cor,
          quantidade: n(f['quantidade']),
          total: n(f['total']),
        })),
      },
      associados,
      visitas: {
        realizadas: n(r['visitas']),
        anterior: n(r['visitas_ant']),
        variacao: variacaoPercentual(n(r['visitas']), n(r['visitas_ant'])),
      },
      atividadesRealizadas: {
        realizadas: n(r['outras']),
        anterior: n(r['outras_ant']),
        variacao: variacaoPercentual(n(r['outras']), n(r['outras_ant'])),
      },
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // GET /v1/carteira/dashboard/associados
  // ---------------------------------------------------------------------------------------------------

  async associados(consulta: ConsultaDeAssociados): Promise<AssociadosDoDashboard> {
    const b = await this.base(consulta)
    const db = this.ctx.db()
    const resposta = {
      tipo: consulta.tipo,
      periodo: this.periodoDaResposta(b.periodo),
      pagina: consulta.pagina,
      porPagina: consulta.porPagina,
    }
    const tag = await this.tagCliente()
    if (!tag) return { ...resposta, total: 0, itens: [] }

    const novos = consulta.tipo === 'novos'
    const filtro = novos ? sql`no_fim AND NOT no_inicio` : sql`no_inicio AND NOT no_fim`
    const acao = novos ? 'adicionada' : 'removida'
    const estado = sql`
      SELECT e.*, ${this.associadaEm(tag.id, b.de)} AS no_inicio, ${this.associadaEm(tag.id, b.ate)} AS no_fim
      FROM empresas e WHERE ${this.empresasDaVisao(b)}`
    const [contagem = {}] = linhas(
      await db.execute(sql`SELECT count(*) AS total FROM (${estado}) e WHERE ${filtro}`),
    )
    const itens = linhas(
      await db.execute(sql`
        SELECT e.id, coalesce(e.nome_fantasia, e.razao_social) AS nome, mu.nome AS cidade, mu.uf,
               h.em, h.por, quem.nome AS por_nome, e.vendedor_id, v.nome AS vendedor_nome,
               st.id AS status_id, st.nome AS status_nome, st.cor AS status_cor,
               (SELECT sum(o.valor_mensal) FROM oportunidades o
                WHERE o.empresa_id = e.id AND o.excluido_em IS NULL AND o.status = 'conquistado'
                  AND o.data_fechamento >= ${ts(b.de)} AND o.data_fechamento < ${ts(b.ate)}) AS mrr
        FROM (${estado}) e
        LEFT JOIN LATERAL (
          SELECT h.em, h.por FROM empresa_tags_historico h
          WHERE h.empresa_id = e.id AND h.tag_id = ${tag.id} AND h.acao = ${acao}
            AND h.em >= ${ts(b.de)} AND h.em < ${ts(b.ate)}
          ORDER BY h.em DESC, h.id DESC LIMIT 1
        ) h ON true
        LEFT JOIN municipios mu ON mu.codigo_ibge = e.municipio_codigo
        LEFT JOIN membros v ON v.id = e.vendedor_id
        LEFT JOIN membros quem ON quem.id = h.por
        LEFT JOIN LATERAL (
          SELECT t.id, t.nome, t.cor FROM empresa_tags et
          JOIN tags t ON t.id = et.tag_id
          JOIN tag_grupos g ON g.id = t.tag_grupo_id AND g.chave_sistema = 'status'
          WHERE et.empresa_id = e.id LIMIT 1
        ) st ON true
        WHERE ${filtro}
        ORDER BY h.em DESC NULLS LAST, e.id ASC
        LIMIT ${consulta.porPagina} OFFSET ${(consulta.pagina - 1) * consulta.porPagina}`),
    )
    return {
      ...resposta,
      total: n(contagem['total']),
      itens: itens.map((l) => ({
        id: l['id'] as string,
        nome: l['nome'] as string,
        cidade: l['cidade'] ? { nome: l['cidade'] as string, uf: l['uf'] as string } : null,
        // sem a linha no período (histórico incompleto), o início do período
        em: new Date((l['em'] as string | null) ?? b.de.toISOString()).toISOString(),
        vendedor: l['vendedor_nome']
          ? { id: l['vendedor_id'] as string, nome: l['vendedor_nome'] as string }
          : null,
        por: l['por'] ? { id: l['por'] as string, nome: (l['por_nome'] as string) ?? '' } : null,
        mrr: novos && l['mrr'] !== null ? n(l['mrr']) : null,
        statusAtual:
          !novos && l['status_id']
            ? {
                id: l['status_id'] as string,
                nome: l['status_nome'] as string,
                cor: l['status_cor'] as Cor,
              }
            : null,
      })),
    }
  }

  // ---------------------------------------------------------------------------------------------------
  // GET /v1/carteira/dashboard/mapa e /contornos
  // ---------------------------------------------------------------------------------------------------

  async mapa(consulta: ConsultaDoMapaDoDashboard): Promise<MapaDoDashboard> {
    const b = await this.base(consulta)
    const db = this.ctx.db()
    const [t] = linhas(
      await db.execute(sql`
        SELECT m.uf FROM tenants t JOIN municipios m ON m.codigo_ibge = t.municipio_codigo
        WHERE t.id = ${this.ctx.tenantId}`),
    )
    const uf = (t?.['uf'] as string | undefined) ?? null
    const tag = await this.tagCliente()
    const associada = tag ? this.associadaEm(tag.id, b.ate) : sql`false`
    const grupos = linhas(
      await db.execute(sql`
        SELECT e.municipio_codigo AS codigo, mu.nome, mu.uf,
               count(*) AS empresas, count(*) FILTER (WHERE e.associada) AS associados
        FROM (
          SELECT e.municipio_codigo, ${associada} AS associada FROM empresas e
          WHERE ${this.empresasDaVisao(b)} AND e.criado_em < ${ts(b.ate)}
        ) e
        LEFT JOIN municipios mu ON mu.codigo_ibge = e.municipio_codigo
        GROUP BY 1, 2, 3`),
    )
    const zero = () => ({ associados: 0, empresas: 0 })
    const total = zero()
    const foraDaUf = zero()
    const semCidade = zero()
    const municipios: MapaDoDashboard['municipios'] = []
    for (const g of grupos) {
      const valores = { associados: n(g['associados']), empresas: n(g['empresas']) }
      total.associados += valores.associados
      total.empresas += valores.empresas
      const destino = g['codigo'] === null ? semCidade : g['uf'] !== uf ? foraDaUf : null
      if (destino) {
        destino.associados += valores.associados
        destino.empresas += valores.empresas
      } else {
        municipios.push({ codigo: n(g['codigo']), nome: g['nome'] as string, ...valores })
      }
    }
    municipios.sort((x, y) => y.empresas - x.empresas || x.nome.localeCompare(y.nome, 'pt-BR'))
    return {
      uf,
      periodo: this.periodoDaResposta(b.periodo),
      municipios,
      total,
      foraDaUf,
      semCidade,
    }
  }

  /** Os contornos (simplificados) dos municípios da UF, para desenhar o mapa. Iguais para toda empresa. */
  async contornos(uf: string): Promise<ContornosDaUf> {
    const linhasDaUf = linhas(
      await this.ctx.db().execute(sql`
        SELECT c.municipio_codigo AS codigo, m.nome, c.fonte,
               (ST_AsGeoJSON(c.contorno, 4)::json -> 'coordinates')::text AS poligonos
        FROM municipio_contornos c JOIN municipios m ON m.codigo_ibge = c.municipio_codigo
        WHERE c.uf = ${uf} ORDER BY m.nome`),
    )
    return {
      uf,
      fonte: (linhasDaUf[0]?.['fonte'] as string | undefined) ?? null,
      municipios: linhasDaUf.map((l) => ({
        codigo: n(l['codigo']),
        nome: l['nome'] as string,
        poligonos: JSON.parse(
          l['poligonos'] as string,
        ) as ContornosDaUf['municipios'][number]['poligonos'],
      })),
    }
  }
}

/** Soma em centavos (evita 0,1 + 0,2 = 0,30000000000000004). */
function soma(valores: number[]): number {
  return valores.reduce((s, v) => s + Math.round(v * 100), 0) / 100
}

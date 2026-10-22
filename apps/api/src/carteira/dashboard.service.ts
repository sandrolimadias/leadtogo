import { and, eq, isNull, schema, sql } from '@leadtogo/db'
import {
  type ConsultaDoDashboard,
  type Dashboard,
  inicioDoDiaNoFuso,
  instantesDoIntervalo,
  periodoDoDashboard,
  taxaDeConversao,
  ultimosMeses,
  variacaoPercentual,
} from '@leadtogo/shared'
import { Injectable } from '@nestjs/common'

import { ContextoTenantService } from '../acesso/contexto-tenant.service.js'
import { ErroApi } from '../http/erro-api.js'
import { atrasada, hoje, proximos7 } from './atividades-janelas.js'
import { condicaoDeVisibilidadeDaAtividade, fusoDaEmpresa } from './atividades-leitura.js'
import { condicaoDeResponsaveis, escopoDaCarteira } from './regras-de-carteira.js'

const { atividades, funis, membros, tenantConfiguracoes } = schema

type Linha = Record<string, unknown>
const n = (v: unknown): number => Number(v ?? 0)
/** Instante como texto ISO com tipo: o driver não serializa `Date` em SQL cru. */
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`
const dia = (d: string) => sql`${d}::date`
const linhas = (r: unknown): Linha[] => r as Linha[]

/**
 * O Dashboard do usuário ("Minha visão"): os números do período, calculados no banco, no fuso da empresa.
 * "Minha" = as oportunidades e atividades de que ele é o responsável e as empresas da carteira dele.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly ctx: ContextoTenantService) {}

  async dashboard(consulta: ConsultaDoDashboard): Promise<Dashboard> {
    const db = this.ctx.db()
    const escopo = await escopoDaCarteira(this.ctx)
    const fuso = await fusoDaEmpresa(db, this.ctx.tenantId)
    const agora = new Date()
    const eu = escopo.membroId

    const [euMesmo] = await db
      .select({ nome: membros.nome })
      .from(membros)
      .where(eq(membros.id, eu))

    const periodo = periodoDoDashboard(consulta.periodo, agora, fuso)
    const { de, ate } = instantesDoIntervalo(periodo, fuso)
    const anterior = instantesDoIntervalo(periodo.anterior, fuso)

    // ---- oportunidades: previsão, resultado do período e MRR do período anterior (uma leitura só) ----
    const minhasOportunidades = and(
      sql`o.excluido_em IS NULL AND e.excluido_em IS NULL AND o.responsavel_id = ${eu}`,
      condicaoDeVisibilidadeNaConsulta(escopo),
    )
    const noPeriodo = (de_: Date, ate_: Date) =>
      sql`o.data_fechamento >= ${ts(de_)} AND o.data_fechamento < ${ts(ate_)}`
    const [o = {}] = linhas(
      await db.execute(sql`
        SELECT
          coalesce(sum(o.valor_ponderado) FILTER (WHERE o.status = 'ativo'
            AND o.data_prevista_fechamento BETWEEN ${dia(periodo.inicio)} AND ${dia(periodo.fim)}), 0) AS previsao_valor,
          count(*) FILTER (WHERE o.status = 'ativo'
            AND o.data_prevista_fechamento BETWEEN ${dia(periodo.inicio)} AND ${dia(periodo.fim)}) AS previsao_qtd,
          count(*) FILTER (WHERE o.status = 'ativo' AND o.data_prevista_fechamento IS NULL) AS sem_previsao,
          count(*) FILTER (WHERE o.status = 'conquistado' AND ${noPeriodo(de, ate)}) AS conq_qtd,
          coalesce(sum(o.valor_total) FILTER (WHERE o.status = 'conquistado' AND ${noPeriodo(de, ate)}), 0) AS conq_total,
          coalesce(sum(o.valor_mensal) FILTER (WHERE o.status = 'conquistado' AND ${noPeriodo(de, ate)}), 0) AS conq_mensal,
          count(*) FILTER (WHERE o.status = 'perdido' AND ${noPeriodo(de, ate)}) AS perd_qtd,
          coalesce(sum(o.valor_total) FILTER (WHERE o.status = 'perdido' AND ${noPeriodo(de, ate)}), 0) AS perd_total,
          count(*) FILTER (WHERE o.status = 'cancelado' AND ${noPeriodo(de, ate)}) AS canc_qtd,
          coalesce(sum(o.valor_total) FILTER (WHERE o.status = 'cancelado' AND ${noPeriodo(de, ate)}), 0) AS canc_total,
          coalesce(sum(o.valor_mensal) FILTER (WHERE o.status = 'conquistado'
            AND ${noPeriodo(anterior.de, anterior.ate)}), 0) AS mrr_anterior
        FROM oportunidades o JOIN empresas e ON e.id = o.empresa_id
        WHERE ${minhasOportunidades}`),
    )

    // ---- MRR conquistado nos últimos 6 meses (o período termina no último) ----
    const meses = ultimosMeses(clamp(periodo.fim, agora, fuso), 6)
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

    // ---- principais motivos de perda (perdidas e canceladas no período) ----
    const motivos = linhas(
      await db.execute(sql`
        SELECT m.id, m.nome, count(*) AS quantidade, coalesce(sum(o.valor_total), 0) AS total
        FROM oportunidades o JOIN empresas e ON e.id = o.empresa_id JOIN motivos m ON m.id = o.motivo_id
        WHERE ${minhasOportunidades} AND o.status IN ('perdido', 'cancelado') AND ${noPeriodo(de, ate)}
        GROUP BY m.id, m.nome ORDER BY count(*) DESC, m.nome ASC LIMIT 5`),
    )

    // ---- funil por fase (as oportunidades ativas de hoje, não do período) ----
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
          SELECT o2.* FROM oportunidades o2 JOIN empresas e ON e.id = o2.empresa_id
          WHERE ${and(
            sql`o2.excluido_em IS NULL AND e.excluido_em IS NULL AND o2.responsavel_id = ${eu} AND o2.status = 'ativo'`,
            condicaoDeVisibilidadeNaConsulta(escopo),
          )}
        ) o ON o.fase_id = f.id
        WHERE f.funil_id = ${funil.id} AND f.excluido_em IS NULL AND f.ativo
        GROUP BY f.id, f.nome, f.cor, f.ordem ORDER BY f.ordem ASC, f.nome ASC`),
    )

    // ---- carteira: por Status (pela chave do sistema do grupo), novas no período e sem contato ----
    const [config] = await db
      .select({ dias: tenantConfiguracoes.diasSemContatoAlerta })
      .from(tenantConfiguracoes)
      .where(eq(tenantConfiguracoes.tenantId, this.ctx.tenantId))
    const diasSemContato = config?.dias ?? 60

    const porStatus = linhas(
      await db.execute(sql`
        SELECT t.id, t.nome, t.cor, t.chave_sistema,
               count(e.id) FILTER (WHERE e.id IS NOT NULL) AS quantidade
        FROM tags t
        JOIN tag_grupos g ON g.id = t.tag_grupo_id AND g.chave_sistema = 'status' AND g.excluido_em IS NULL
        LEFT JOIN empresa_tags et ON et.tag_id = t.id
        LEFT JOIN empresas e ON e.id = et.empresa_id AND e.excluido_em IS NULL AND e.vendedor_id = ${eu}
        WHERE t.excluido_em IS NULL AND t.ativo
        GROUP BY t.id, t.nome, t.cor, t.chave_sistema, t.ordem ORDER BY t.ordem ASC, t.nome ASC`),
    )
    const [totais = {}] = linhas(
      await db.execute(sql`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE criado_em >= ${ts(de)} AND criado_em < ${ts(ate)}) AS novas
        FROM empresas WHERE excluido_em IS NULL AND vendedor_id = ${eu}`),
    )
    const regraSemContato = sql`e.excluido_em IS NULL AND e.vendedor_id = ${eu}
      AND EXISTS (SELECT 1 FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
                  WHERE et.empresa_id = e.id AND t.chave_sistema IN ('cliente', 'prospect'))
      AND (e.ultimo_contato_em IS NULL OR e.ultimo_contato_em <= now() - ${`${diasSemContato} days`}::interval)`
    const [contagemSemContato = {}] = linhas(
      await db.execute(sql`SELECT count(*) AS total FROM empresas e WHERE ${regraSemContato}`),
    )
    const listaSemContato = linhas(
      await db.execute(sql`
        SELECT e.id, coalesce(e.nome_fantasia, e.razao_social) AS nome, m.nome AS cidade, m.uf,
               st.nome AS status_nome, st.cor AS status_cor,
               CASE WHEN e.ultimo_contato_em IS NULL THEN NULL
                    ELSE floor(extract(epoch FROM (now() - e.ultimo_contato_em)) / 86400)::int END AS dias
        FROM empresas e
        LEFT JOIN municipios m ON m.codigo_ibge = e.municipio_codigo
        LEFT JOIN LATERAL (
          SELECT t.nome, t.cor FROM empresa_tags et JOIN tags t ON t.id = et.tag_id
          WHERE et.empresa_id = e.id AND t.chave_sistema IN ('cliente', 'prospect') LIMIT 1
        ) st ON true
        WHERE ${regraSemContato}
        ORDER BY (e.ultimo_contato_em IS NOT NULL) ASC, e.ultimo_contato_em ASC, e.id ASC
        LIMIT 8`),
    )

    // ---- atividades (as janelas da tela Atividades, só as minhas) ----
    const minhasAtividades = and(
      isNull(atividades.excluidoEm),
      eq(atividades.responsavelId, eu),
      condicaoDeVisibilidadeDaAtividade(escopo),
    )
    const [contagemAtividades = {}] = linhas(
      await db.execute(sql`
        SELECT count(*) FILTER (WHERE ${hoje(fuso)}) AS hoje,
               count(*) FILTER (WHERE ${atrasada(fuso)}) AS atrasadas,
               count(*) FILTER (WHERE ${proximos7(fuso)}) AS proximos7
        FROM atividades
        LEFT JOIN empresas ON empresas.id = atividades.empresa_id
        WHERE ${minhasAtividades}`),
    )

    const conquistadas = n(o['conq_qtd'])
    const perdidas = n(o['perd_qtd'])
    const mrr = n(o['conq_mensal'])
    return {
      membro: { id: eu, nome: euMesmo?.nome ?? '' },
      periodo: {
        chave: periodo.chave,
        rotulo: periodo.rotulo,
        inicio: periodo.inicio,
        fim: periodo.fim,
      },
      previsao: {
        valor: n(o['previsao_valor']),
        quantidade: n(o['previsao_qtd']),
        semPrevisao: n(o['sem_previsao']),
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
        conquistadas: { quantidade: conquistadas, total: n(o['conq_total']), mensal: mrr },
        perdidasECanceladas: {
          quantidade: perdidas + n(o['canc_qtd']),
          total: n(o['perd_total']) + n(o['canc_total']),
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
          cor: f['cor'] as Dashboard['funil']['fases'][number]['cor'],
          quantidade: n(f['quantidade']),
          total: n(f['total']),
        })),
      },
      carteira: {
        total: n(totais['total']),
        porStatus: porStatus.map((s) => ({
          id: s['id'] as string,
          nome: s['nome'] as string,
          cor: s['cor'] as Dashboard['carteira']['porStatus'][number]['cor'],
          chaveSistema: (s['chave_sistema'] as string | null) ?? null,
          quantidade: n(s['quantidade']),
        })),
        novas: n(totais['novas']),
      },
      semContato: {
        dias: diasSemContato,
        total: n(contagemSemContato['total']),
        itens: listaSemContato.map((e) => ({
          id: e['id'] as string,
          nome: e['nome'] as string,
          cidade: e['cidade'] ? { nome: e['cidade'] as string, uf: e['uf'] as string } : null,
          status: e['status_nome']
            ? {
                nome: e['status_nome'] as string,
                cor: e['status_cor'] as Dashboard['carteira']['porStatus'][number]['cor'],
              }
            : null,
          diasSemContato: e['dias'] === null ? null : n(e['dias']),
        })),
      },
      atividades: {
        hoje: n(contagemAtividades['hoje']),
        atrasadas: n(contagemAtividades['atrasadas']),
        proximos7: n(contagemAtividades['proximos7']),
      },
    }
  }
}

/** A visibilidade da carteira numa consulta em SQL cru (alias `e` para empresas). */
function condicaoDeVisibilidadeNaConsulta(escopo: Awaited<ReturnType<typeof escopoDaCarteira>>) {
  return condicaoDeResponsaveis(escopo.empresas.ver, sql`e.vendedor_id`) ?? sql`true`
}

/** O último dia a considerar na série: o fim do período, mas nunca depois de hoje (no fuso). */
function clamp(fimDoPeriodo: string, agora: Date, fuso: string): string {
  const hojeLocal = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora)
  return fimDoPeriodo > hojeLocal ? hojeLocal : fimDoPeriodo
}

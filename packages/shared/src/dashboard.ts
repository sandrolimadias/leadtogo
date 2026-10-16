import { z } from 'zod'

import { corDeTagSchema } from './cadastros.js'
import { diaNoFuso, FUSO_PADRAO, inicioDoDiaNoFuso } from './atividades.js'

// Dashboard (Módulo 7), visão "Minha": o período, as contas de data e a resposta de GET /v1/carteira/dashboard.
// Todos os dias e meses valem no fuso da empresa (nunca em UTC). Especificação: docs/escopo_mvp.md (Módulo 7).

export const PERIODOS_DO_DASHBOARD = ['mes', 'mes_anterior', 'trimestre'] as const
export const periodoDoDashboardSchema = z.enum(PERIODOS_DO_DASHBOARD)
export type PeriodoDoDashboard = z.infer<typeof periodoDoDashboardSchema>

export const ROTULO_DO_PERIODO: Record<PeriodoDoDashboard, string> = {
  mes: 'Mês atual',
  mes_anterior: 'Mês anterior',
  trimestre: 'Trimestre',
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]
const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]

/** Um intervalo de dias: `inicio` e `fim` valem os dois; `fimExclusivo` é o dia seguinte ao fim. */
export interface IntervaloDeDias {
  inicio: string
  fim: string
  fimExclusivo: string
}

export interface PeriodoCalculado extends IntervaloDeDias {
  chave: PeriodoDoDashboard
  rotulo: string
  /** O período anterior do mesmo tipo (mês → mês anterior; trimestre → trimestre anterior) */
  anterior: IntervaloDeDias
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')
const texto = (ano: number, mes: number, dia: number) =>
  `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`

/** Soma meses ao par (ano, mês de 1 a 12). */
function somarMeses(ano: number, mes: number, n: number): { ano: number; mes: number } {
  const indice = ano * 12 + (mes - 1) + n
  return { ano: Math.floor(indice / 12), mes: (indice % 12) + 1 }
}

/** `quantos` meses seguidos a partir de (ano, mês): do primeiro dia ao último. */
function intervaloDeMeses(ano: number, mes: number, quantos: number): IntervaloDeDias {
  const fimEx = somarMeses(ano, mes, quantos)
  const ultimo = new Date(Date.UTC(fimEx.ano, fimEx.mes - 1, 0)).getUTCDate()
  const fim = somarMeses(ano, mes, quantos - 1)
  return {
    inicio: texto(ano, mes, 1),
    fim: texto(fim.ano, fim.mes, ultimo),
    fimExclusivo: texto(fimEx.ano, fimEx.mes, 1),
  }
}

/**
 * O período do Dashboard no fuso da empresa. Mês atual e Mês anterior são meses do calendário; Trimestre é o
 * trimestre do calendário (jan–mar, abr–jun, jul–set, out–dez) em que "hoje" cai. O anterior é sempre o
 * período do mesmo tipo logo antes (inteiro, mesmo que o atual ainda esteja no meio).
 */
export function periodoDoDashboard(
  chave: PeriodoDoDashboard,
  agora: Date,
  fuso: string = FUSO_PADRAO,
): PeriodoCalculado {
  const [ano, mes] = diaNoFuso(agora, fuso).split('-').map(Number) as [number, number]
  if (chave === 'trimestre') {
    const primeiroMes = Math.floor((mes - 1) / 3) * 3 + 1
    const anterior = somarMeses(ano, primeiroMes, -3)
    return {
      chave,
      ...intervaloDeMeses(ano, primeiroMes, 3),
      rotulo: `${Math.floor((mes - 1) / 3) + 1}º trimestre de ${ano}`,
      anterior: intervaloDeMeses(anterior.ano, anterior.mes, 3),
    }
  }
  const base = chave === 'mes' ? { ano, mes } : somarMeses(ano, mes, -1)
  const anterior = somarMeses(base.ano, base.mes, -1)
  return {
    chave,
    ...intervaloDeMeses(base.ano, base.mes, 1),
    rotulo: `${MESES[base.mes - 1]} de ${base.ano}`,
    anterior: intervaloDeMeses(anterior.ano, anterior.mes, 1),
  }
}

/** Os instantes (UTC) em que o intervalo começa e termina (exclusivo), na meia-noite do fuso da empresa. */
export function instantesDoIntervalo(
  i: IntervaloDeDias,
  fuso: string = FUSO_PADRAO,
): { de: Date; ate: Date } {
  return { de: inicioDoDiaNoFuso(i.inicio, fuso), ate: inicioDoDiaNoFuso(i.fimExclusivo, fuso) }
}

export interface MesDaSerie {
  /** AAAA-MM */
  mes: string
  rotulo: string
  inicio: string
  fimExclusivo: string
}

/** Os últimos `quantos` meses terminando no mês do dia dado (inclusive): do mais antigo ao mais novo. */
export function ultimosMeses(ateODia: string, quantos = 6): MesDaSerie[] {
  const [ano, mes] = ateODia.split('-').map(Number) as [number, number]
  return Array.from({ length: quantos }, (_, i) => {
    const m = somarMeses(ano, mes, i - (quantos - 1))
    const intervalo = intervaloDeMeses(m.ano, m.mes, 1)
    return {
      mes: `${m.ano}-${doisDigitos(m.mes)}`,
      rotulo: `${MESES_CURTOS[m.mes - 1]}/${String(m.ano).slice(2)}`,
      inicio: intervalo.inicio,
      fimExclusivo: intervalo.fimExclusivo,
    }
  })
}

/** Variação percentual de `atual` sobre `anterior`; `null` quando não há base (anterior zero). */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return Math.round(((atual - anterior) / anterior) * 1000) / 10
}

/** Taxa de conversão = conquistadas ÷ (conquistadas + perdidas), em %; as canceladas ficam fora. `null` sem fechamentos. */
export function taxaDeConversao(conquistadas: number, perdidas: number): number | null {
  const total = conquistadas + perdidas
  if (total === 0) return null
  return Math.round((conquistadas / total) * 1000) / 10
}

export const consultaDoDashboardSchema = z
  .object({
    periodo: periodoDoDashboardSchema.default('mes'),
    /** Funil do bloco "Funil e previsão"; sem ele, o funil padrão */
    funilId: z.uuid().optional(),
  })
  .strict()
export type ConsultaDoDashboard = z.output<typeof consultaDoDashboardSchema>
export type ConsultaDoDashboardEntrada = z.input<typeof consultaDoDashboardSchema>

const dinheiroEQtd = z.object({ quantidade: z.number().int(), total: z.number() })

export const dashboardSchema = z
  .object({
    membro: z.object({ id: z.uuid(), nome: z.string() }),
    periodo: z.object({
      chave: periodoDoDashboardSchema,
      rotulo: z.string(),
      inicio: z.string(),
      fim: z.string(),
    }),
    /** Oportunidades ativas com data prevista dentro do período (valor ponderado); as sem data ficam de fora */
    previsao: z.object({
      valor: z.number(),
      quantidade: z.number().int(),
      semPrevisao: z.number().int(),
    }),
    /** MRR conquistado: soma do valor mensal das conquistadas no período, pela data de fechamento */
    mrr: z.object({
      valor: z.number(),
      quantidade: z.number().int(),
      anterior: z.number(),
      /** Em %; nulo quando o período anterior não teve MRR */
      variacao: z.number().nullable(),
      /** Os últimos 6 meses (o período termina no último deles) */
      serie: z.array(
        z.object({
          mes: z.string(),
          rotulo: z.string(),
          inicio: z.string(),
          fimExclusivo: z.string(),
          valor: z.number(),
          quantidade: z.number().int(),
        }),
      ),
    }),
    conversao: z.object({
      /** Em %; nulo sem conquistadas nem perdidas no período */
      taxa: z.number().nullable(),
      conquistadas: z.number().int(),
      perdidas: z.number().int(),
    }),
    resultado: z.object({
      conquistadas: dinheiroEQtd.extend({ mensal: z.number() }),
      perdidasECanceladas: dinheiroEQtd.extend({
        perdidas: z.number().int(),
        canceladas: z.number().int(),
      }),
    }),
    motivosDePerda: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        quantidade: z.number().int(),
        total: z.number(),
      }),
    ),
    funil: z.object({
      id: z.uuid(),
      nome: z.string(),
      fases: z.array(
        z.object({
          id: z.uuid(),
          nome: z.string(),
          cor: corDeTagSchema,
          quantidade: z.number().int(),
          total: z.number(),
        }),
      ),
    }),
    carteira: z.object({
      total: z.number().int(),
      porStatus: z.array(
        z.object({
          id: z.uuid(),
          nome: z.string(),
          cor: corDeTagSchema,
          chaveSistema: z.string().nullable(),
          quantidade: z.number().int(),
        }),
      ),
      /** Empresas cadastradas ou importadas dentro do período */
      novas: z.number().int(),
    }),
    semContato: z.object({
      /** O prazo configurado na empresa (padrão 60) */
      dias: z.number().int(),
      total: z.number().int(),
      itens: z.array(
        z.object({
          id: z.uuid(),
          nome: z.string(),
          cidade: z.object({ nome: z.string(), uf: z.string() }).nullable(),
          status: z.object({ nome: z.string(), cor: corDeTagSchema }).nullable(),
          /** Dias desde o último contato; nulo = nunca teve contato */
          diasSemContato: z.number().int().nullable(),
        }),
      ),
    }),
    atividades: z.object({
      hoje: z.number().int(),
      atrasadas: z.number().int(),
      proximos7: z.number().int(),
    }),
  })
  .meta({ id: 'Dashboard' })
export type Dashboard = z.infer<typeof dashboardSchema>

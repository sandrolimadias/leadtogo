import { z } from 'zod'

import { corDeTagSchema } from './cadastros.js'
import { diaNoFuso, FUSO_PADRAO, inicioDoDiaNoFuso } from './atividades.js'

// Dashboard: o período, as contas de data e as respostas de GET /v1/carteira/dashboard e dos blocos da aba
// Resultados (Dashboard v2, docs/plano_dashboard_v2.md). Todos os dias e meses valem no fuso da empresa.

export const PERIODOS_DO_DASHBOARD = [
  'mes',
  'mes_anterior',
  'trimestre',
  'semestre',
  'ano',
  'ano_anterior',
  'personalizado',
] as const
export const periodoDoDashboardSchema = z.enum(PERIODOS_DO_DASHBOARD)
export type PeriodoDoDashboard = z.infer<typeof periodoDoDashboardSchema>

export const ROTULO_DO_PERIODO: Record<PeriodoDoDashboard, string> = {
  mes: 'Mês atual',
  mes_anterior: 'Mês anterior',
  trimestre: 'Trimestre',
  semestre: 'Semestre',
  ano: 'Ano',
  ano_anterior: 'Ano anterior',
  personalizado: 'Personalizado',
}

/** De quem são os números da aba Resultados (limitado pelo alcance de `empresas.ver`). */
export const VISOES_DO_DASHBOARD = ['minha', 'equipe', 'empresa'] as const
export const visaoDoDashboardSchema = z.enum(VISOES_DO_DASHBOARD)
export type VisaoDoDashboard = z.infer<typeof visaoDoDashboardSchema>

/** O período personalizado tem no máximo 3 anos (proteção das consultas). */
export const MAX_DIAS_DO_PERIODO = 1096

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
  /** O intervalo de mesmo tamanho logo antes (mês → mês anterior, semestre → semestre anterior, N dias → N dias) */
  anterior: IntervaloDeDias
}

/** O que acompanha a chave do período: o ano (Ano anterior) ou o intervalo (Personalizado). */
export interface ExtrasDoPeriodo {
  ano?: number | undefined
  de?: string | undefined
  ate?: string | undefined
}

const doisDigitos = (n: number) => String(n).padStart(2, '0')
const texto = (ano: number, mes: number, dia: number) =>
  `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`

/** Soma meses ao par (ano, mês de 1 a 12). */
function somarMeses(ano: number, mes: number, n: number): { ano: number; mes: number } {
  const indice = ano * 12 + (mes - 1) + n
  return { ano: Math.floor(indice / 12), mes: (indice % 12) + 1 }
}

/** Soma dias a um dia `AAAA-MM-DD` (calendário puro, sem fuso). */
export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Quantos dias há de `inicio` a `fim`, os dois inclusive. */
export function diasNoIntervalo(inicio: string, fim: string): number {
  return (
    Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) +
    1
  )
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

const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

/**
 * O período do Dashboard no fuso da empresa. Mês atual, Mês anterior, Trimestre, Semestre e Ano são do
 * calendário (o trimestre e o semestre em que "hoje" cai); Ano anterior é o ano escolhido em `extras.ano`;
 * Personalizado vai de `extras.de` a `extras.ate` (inclusive). O anterior é o intervalo de mesmo tamanho logo
 * antes (inteiro, mesmo que o atual ainda esteja no meio).
 */
export function periodoDoDashboard(
  chave: PeriodoDoDashboard,
  agora: Date,
  fuso: string = FUSO_PADRAO,
  extras: ExtrasDoPeriodo = {},
): PeriodoCalculado {
  const [ano, mes] = diaNoFuso(agora, fuso).split('-').map(Number) as [number, number]
  const deMeses = (a: number, m: number, quantos: number, rotulo: string): PeriodoCalculado => {
    const anterior = somarMeses(a, m, -quantos)
    return {
      chave,
      ...intervaloDeMeses(a, m, quantos),
      rotulo,
      anterior: intervaloDeMeses(anterior.ano, anterior.mes, quantos),
    }
  }
  switch (chave) {
    case 'trimestre': {
      const primeiroMes = Math.floor((mes - 1) / 3) * 3 + 1
      return deMeses(ano, primeiroMes, 3, `${Math.floor((mes - 1) / 3) + 1}º trimestre de ${ano}`)
    }
    case 'semestre': {
      const primeiroMes = mes <= 6 ? 1 : 7
      return deMeses(ano, primeiroMes, 6, `${mes <= 6 ? 1 : 2}º semestre de ${ano}`)
    }
    case 'ano':
      return deMeses(ano, 1, 12, String(ano))
    case 'ano_anterior': {
      const escolhido = extras.ano ?? ano - 1
      return deMeses(escolhido, 1, 12, String(escolhido))
    }
    case 'personalizado': {
      if (!extras.de || !extras.ate) throw new Error('Período personalizado sem as datas')
      const n = diasNoIntervalo(extras.de, extras.ate)
      return {
        chave,
        inicio: extras.de,
        fim: extras.ate,
        fimExclusivo: somarDias(extras.ate, 1),
        rotulo: `${diaCurto(extras.de)} a ${diaCurto(extras.ate)}`,
        anterior: {
          inicio: somarDias(extras.de, -n),
          fim: somarDias(extras.de, -1),
          fimExclusivo: extras.de,
        },
      }
    }
    default: {
      const base = chave === 'mes' ? { ano, mes } : somarMeses(ano, mes, -1)
      return deMeses(base.ano, base.mes, 1, `${MESES[base.mes - 1]} de ${base.ano}`)
    }
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

/**
 * Os meses da série do MRR: Mês, Mês anterior e Trimestre → os 6 últimos até o fim do período (nunca depois
 * de `hoje`); os outros períodos → os meses do próprio período (no máximo os 36 últimos).
 */
export function mesesDoPeriodo(periodo: PeriodoCalculado, hoje: string): MesDaSerie[] {
  if (
    periodo.chave === 'mes' ||
    periodo.chave === 'mes_anterior' ||
    periodo.chave === 'trimestre'
  ) {
    return ultimosMeses(periodo.fim > hoje ? hoje : periodo.fim, 6)
  }
  const [a1, m1] = periodo.inicio.split('-').map(Number) as [number, number]
  const [a2, m2] = periodo.fim.split('-').map(Number) as [number, number]
  return ultimosMeses(periodo.fim, Math.min(a2 * 12 + m2 - (a1 * 12 + m1) + 1, 36))
}

// ---------------------------------------------------------------------------------------------------------
// Aba Resultados (Dashboard v2): consultas
// ---------------------------------------------------------------------------------------------------------

const camposDoPeriodo = {
  periodo: periodoDoDashboardSchema.default('mes'),
  /** O ano do período `ano_anterior` */
  ano: z.coerce.number().int().min(2000).max(2100).optional(),
  /** Início do período `personalizado` (inclusive) */
  de: z.iso.date().optional(),
  /** Fim do período `personalizado` (inclusive) */
  ate: z.iso.date().optional(),
  visao: visaoDoDashboardSchema.default('minha'),
}

type CamposDoPeriodo = { periodo: PeriodoDoDashboard; ano?: number; de?: string; ate?: string }

function conferirPeriodo(v: CamposDoPeriodo, ctx: z.RefinementCtx): void {
  if (v.periodo === 'ano_anterior' && v.ano === undefined) {
    ctx.addIssue({ code: 'custom', path: ['ano'], message: 'informe o ano do período' })
  }
  if (v.periodo === 'personalizado') {
    if (!v.de || !v.ate) {
      ctx.addIssue({ code: 'custom', path: ['de'], message: 'informe o início e o fim do período' })
      return
    }
    if (v.de > v.ate) {
      ctx.addIssue({ code: 'custom', path: ['ate'], message: 'o fim vem antes do início' })
    } else if (diasNoIntervalo(v.de, v.ate) > MAX_DIAS_DO_PERIODO) {
      ctx.addIssue({ code: 'custom', path: ['ate'], message: 'o período tem no máximo 3 anos' })
    }
  }
}

export const consultaDeResultadosSchema = z
  .object({
    ...camposDoPeriodo,
    /** Funil do gráfico do funil; sem ele, o funil padrão */
    funilId: z.uuid().optional(),
  })
  .strict()
  .superRefine(conferirPeriodo)
export type ConsultaDeResultados = z.output<typeof consultaDeResultadosSchema>
export type ConsultaDeResultadosEntrada = z.input<typeof consultaDeResultadosSchema>

export const TIPOS_DA_LISTA_DE_ASSOCIADOS = ['novos', 'desassociados'] as const

export const consultaDeAssociadosSchema = z
  .object({
    ...camposDoPeriodo,
    tipo: z.enum(TIPOS_DA_LISTA_DE_ASSOCIADOS),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(8),
  })
  .strict()
  .superRefine(conferirPeriodo)
export type ConsultaDeAssociados = z.output<typeof consultaDeAssociadosSchema>
export type ConsultaDeAssociadosEntrada = z.input<typeof consultaDeAssociadosSchema>

export const consultaDoMapaDoDashboardSchema = z
  .object(camposDoPeriodo)
  .strict()
  .superRefine(conferirPeriodo)
export type ConsultaDoMapaDoDashboard = z.output<typeof consultaDoMapaDoDashboardSchema>
export type ConsultaDoMapaDoDashboardEntrada = z.input<typeof consultaDoMapaDoDashboardSchema>

export const consultaDeContornosSchema = z
  .object({
    uf: z
      .string()
      .regex(/^[A-Za-z]{2}$/)
      .transform((u) => u.toUpperCase()),
  })
  .strict()
export type ConsultaDeContornos = z.output<typeof consultaDeContornosSchema>

// ---------------------------------------------------------------------------------------------------------
// Aba Resultados: respostas
// ---------------------------------------------------------------------------------------------------------

const comparacao = z.object({
  anterior: z.number(),
  /** Em %; nulo quando o período anterior foi zero */
  variacao: z.number().nullable(),
})

export const periodoDaRespostaSchema = z.object({
  chave: periodoDoDashboardSchema,
  rotulo: z.string(),
  inicio: z.string(),
  fim: z.string(),
  anterior: z.object({ inicio: z.string(), fim: z.string() }),
})

const serieDoMrr = z.array(
  z.object({
    mes: z.string(),
    rotulo: z.string(),
    inicio: z.string(),
    fimExclusivo: z.string(),
    valor: z.number(),
    quantidade: z.number().int(),
  }),
)

const dinheiroEQuantidade = z.object({ quantidade: z.number().int(), total: z.number() })

const tagResumida = z.object({ id: z.uuid(), nome: z.string(), cor: corDeTagSchema })

export const resultadosDoDashboardSchema = z
  .object({
    periodo: periodoDaRespostaSchema,
    visao: visaoDoDashboardSchema,
    /** As visões que o alcance de `empresas.ver` permite (o seletor só mostra estas) */
    visoes: z.array(visaoDoDashboardSchema),
    /**
     * Oportunidades ativas na última fase ativa de cada funil ativo, com data prevista no período (valor
     * total); as que estão nessa fase sem data prevista vêm em `semPrevisao`
     */
    previsao: z.object({
      valor: z.number(),
      ponderado: z.number(),
      quantidade: z.number().int(),
      semPrevisao: z.number().int(),
      porFunil: z.array(
        z.object({
          funilId: z.uuid(),
          funil: z.string(),
          faseId: z.uuid(),
          fase: z.string(),
          valor: z.number(),
          quantidade: z.number().int(),
        }),
      ),
    }),
    /** Valor total das conquistadas no período (pela data de fechamento) */
    vendas: comparacao.extend({ total: z.number(), quantidade: z.number().int() }),
    mrr: comparacao.extend({
      valor: z.number(),
      quantidade: z.number().int(),
      serie: serieDoMrr,
    }),
    conversao: z.object({
      taxa: z.number().nullable(),
      conquistadas: z.number().int(),
      perdidas: z.number().int(),
    }),
    resultado: z.object({
      conquistadas: dinheiroEQuantidade.extend({ mensal: z.number() }),
      perdidasECanceladas: dinheiroEQuantidade.extend({
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
    /** As oportunidades ativas de HOJE por fase (não depende do período) */
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
    /** Empresas com o Status de chave `cliente` (pelo histórico de Status) */
    associados: z.object({
      /** A tag de Status Cliente da empresa (com o nome que ela deu, ex.: "Associado"); nula se não existir */
      tag: tagResumida.nullable(),
      /** No fim do período (períodos correntes: agora) */
      atual: z.number().int(),
      /** No início do período */
      inicio: z.number().int(),
      novos: z.number().int(),
      desassociados: z.number().int(),
      /** desassociados ÷ associados no início × 100 (uma casa); nulo sem associados no início */
      churn: z.number().nullable(),
      /** Data da linha mais antiga do histórico de Status Cliente; antes dela, os números são aproximados */
      historicoDesde: z.string().nullable(),
    }),
    /** Atividades Realizadas do tipo de sistema `visita` no período (as "não localizadas" contam) */
    visitas: comparacao.extend({ realizadas: z.number().int() }),
    /** Atividades Realizadas de todos os outros tipos no período (inclui as Tarefas) */
    atividadesRealizadas: comparacao.extend({ realizadas: z.number().int() }),
  })
  .meta({ id: 'ResultadosDoDashboard' })
export type ResultadosDoDashboard = z.infer<typeof resultadosDoDashboardSchema>

const pessoaResumida = z.object({ id: z.uuid(), nome: z.string() })

export const associadosDoDashboardSchema = z
  .object({
    tipo: z.enum(TIPOS_DA_LISTA_DE_ASSOCIADOS),
    periodo: periodoDaRespostaSchema,
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
    itens: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        cidade: z.object({ nome: z.string(), uf: z.string() }).nullable(),
        /** Quando virou (novos) ou deixou de ser (desassociados) associada, a última vez no período */
        em: z.iso.datetime({ offset: true }),
        vendedor: pessoaResumida.nullable(),
        /** Quem aplicou ou tirou a tag; nulo = o sistema */
        por: pessoaResumida.nullable(),
        /** Novos: o valor mensal da oportunidade conquistada no mesmo dia (se houver) */
        mrr: z.number().nullable(),
        /** Desassociados: o Status de agora */
        statusAtual: tagResumida.nullable(),
      }),
    ),
  })
  .meta({ id: 'AssociadosDoDashboard' })
export type AssociadosDoDashboard = z.infer<typeof associadosDoDashboardSchema>

const associadosEEmpresas = z.object({
  associados: z.number().int(),
  empresas: z.number().int(),
})

export const mapaDoDashboardSchema = z
  .object({
    /** A UF da empresa que usa o CRM (pelo endereço do cadastro dela); nula sem endereço */
    uf: z.string().nullable(),
    periodo: periodoDaRespostaSchema,
    /** Só os municípios da UF com alguma empresa */
    municipios: z.array(associadosEEmpresas.extend({ codigo: z.number().int(), nome: z.string() })),
    total: associadosEEmpresas,
    foraDaUf: associadosEEmpresas,
    semCidade: associadosEEmpresas,
  })
  .meta({ id: 'MapaDoDashboard' })
export type MapaDoDashboard = z.infer<typeof mapaDoDashboardSchema>

/** Anéis de um polígono: [longitude, latitude] */
const anelSchema = z.array(z.tuple([z.number(), z.number()]))

export const contornosDaUfSchema = z
  .object({
    uf: z.string(),
    fonte: z.string().nullable(),
    municipios: z.array(
      z.object({
        codigo: z.number().int(),
        nome: z.string(),
        /** MultiPolygon do GeoJSON: polígonos → anéis → pontos */
        poligonos: z.array(z.array(anelSchema)),
      }),
    ),
  })
  .meta({ id: 'ContornosDaUf' })
export type ContornosDaUf = z.infer<typeof contornosDaUfSchema>

// ---------------------------------------------------------------------------------------------------------
// Aba Minhas atividades (GET /v1/carteira/dashboard)
// ---------------------------------------------------------------------------------------------------------

export const consultaDoDashboardSchema = z
  .object({
    periodo: z.enum(['mes', 'mes_anterior', 'trimestre']).default('mes'),
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

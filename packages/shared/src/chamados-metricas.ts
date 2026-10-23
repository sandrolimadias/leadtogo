import { z } from 'zod'

import { statusDoChamadoSchema } from './chamados.js'

// Métricas da central de chamados (Fase 2). Todas saem de `chamados` e da linha do tempo
// (`chamado_eventos`), em horas úteis do expediente da empresa.

export const consultaDeMetricasSchema = z
  .object({
    /** Abertos a partir deste dia (padrão: 30 dias atrás) */
    de: z.iso.date().optional(),
    /** Abertos até este dia, inclusive (padrão: hoje) */
    ate: z.iso.date().optional(),
    areaId: z.uuid().optional(),
    responsavelId: z.uuid().optional(),
  })
  .strict()
export type ConsultaDeMetricas = z.infer<typeof consultaDeMetricasSchema>

export const indicadoresDeChamadosSchema = z
  .object({
    /** Chamados abertos no período */
    total: z.number().int(),
    /** Ainda não resolvidos nem fechados */
    abertos: z.number().int(),
    resolvidos: z.number().int(),
    /** Média, em minutos úteis, da abertura até a primeira resposta da equipe; nulo sem nenhuma resposta */
    tempoPrimeiraRespostaMin: z.number().nullable(),
    /** Média, em minutos úteis (sem a pausa de Aguardando cliente), da abertura até a resolução */
    tempoResolucaoMin: z.number().nullable(),
    /** Média, em dias corridos, dos chamados ainda abertos */
    diasEmAberto: z.number().nullable(),
    /** % dos chamados com meta de resposta que respondeu (ou responde) dentro dela; nulo sem meta ou sem base */
    respostaNoPrazoPct: z.number().nullable(),
    resolucaoNoPrazoPct: z.number().nullable(),
  })
  .meta({ id: 'IndicadoresDeChamados' })
export type IndicadoresDeChamados = z.infer<typeof indicadoresDeChamadosSchema>

export const metricasDeChamadosSchema = z
  .object({
    de: z.iso.date(),
    ate: z.iso.date(),
    /** O alcance de `chamados.ver_metricas` da pessoa: os números valem sobre os chamados dele */
    alcance: z.enum(['propria', 'equipe', 'todas']),
    geral: indicadoresDeChamadosSchema,
    porArea: z.array(
      indicadoresDeChamadosSchema.extend({ area: z.object({ id: z.uuid(), nome: z.string() }) }),
    ),
    porResponsavel: z.array(
      indicadoresDeChamadosSchema.extend({
        responsavel: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
      }),
    ),
    porStatus: z.array(z.object({ status: statusDoChamadoSchema, total: z.number().int() })),
    /** Passou do limite de linhas analisadas (os números valem sobre as mais recentes) */
    truncado: z.boolean(),
  })
  .meta({ id: 'MetricasDeChamados' })
export type MetricasDeChamados = z.infer<typeof metricasDeChamadosSchema>

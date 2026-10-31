import { z } from 'zod'

import { TAMANHO_MAXIMO_DE_PAGINA } from './paginacao.js'
import {
  alcanceDaPublicacaoSchema,
  MAXIMO_DE_EMPRESAS_NO_ALCANCE,
  tagDoAlcanceSchema,
  tagIdsDoAlcanceSchema,
  validarAudiencia,
} from './publicacoes.js'

// Portal do cliente, Fase 3D: agenda (docs/plano_portal_cliente.md, seção 7). A equipe publica eventos com vagas
// (totais e por empresa), prazo de confirmação e alcance; o cliente confirma e cancela a presença; a lista de espera
// promove sozinha quando abre uma vaga. Os formatos do cliente são listas de permissão: ele vê quantas vagas restam
// e as da empresa dele, nunca quem são os outros participantes.

export const TAMANHO_MAXIMO_DO_TITULO_DO_EVENTO = 160
export const TAMANHO_MAXIMO_DA_DESCRICAO_DO_EVENTO = 5000
export const TAMANHO_MAXIMO_DO_LOCAL = 200
export const TAMANHO_MAXIMO_DO_MOTIVO_DE_CANCELAR_EVENTO = 300
export const MAXIMO_DE_VAGAS = 100_000

export const SITUACOES_DO_EVENTO = ['rascunho', 'publicado', 'cancelado'] as const
export const situacaoDoEventoSchema = z.enum(SITUACOES_DO_EVENTO).meta({ id: 'SituacaoDoEvento' })
export type SituacaoDoEvento = z.infer<typeof situacaoDoEventoSchema>
export const ROTULO_DA_SITUACAO_DO_EVENTO: Record<SituacaoDoEvento, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
}

export const SITUACOES_DA_CONFIRMACAO = ['confirmado', 'lista_espera', 'cancelado'] as const
export const situacaoDaConfirmacaoSchema = z
  .enum(SITUACOES_DA_CONFIRMACAO)
  .meta({ id: 'SituacaoDaConfirmacao' })
export type SituacaoDaConfirmacao = z.infer<typeof situacaoDaConfirmacaoSchema>

/** Por que o cliente não pode confirmar ou cancelar agora */
export const MOTIVOS_DE_BLOQUEIO_DO_EVENTO = [
  'prazo_encerrado',
  'evento_encerrado',
  'evento_cancelado',
] as const
export const motivoDeBloqueioDoEventoSchema = z
  .enum(MOTIVOS_DE_BLOQUEIO_DO_EVENTO)
  .meta({ id: 'MotivoDeBloqueioDoEvento' })
export type MotivoDeBloqueioDoEvento = z.infer<typeof motivoDeBloqueioDoEventoSchema>

// ---------------------------------------------------------------------------------------- equipe (CRM)

const instante = z.iso.datetime({ offset: true })

export const itemDeEventoSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    situacao: situacaoDoEventoSchema,
    alcance: alcanceDaPublicacaoSchema,
    inicioEm: instante,
    fimEm: instante,
    local: z.string().nullable(),
    vagasTotais: z.number().int().positive().nullable(),
    vagasPorEmpresa: z.number().int().positive().nullable(),
    prazoConfirmacao: instante.nullable(),
    confirmados: z.number().int().nonnegative(),
    listaDeEspera: z.number().int().nonnegative(),
  })
  .meta({ id: 'ItemDeEvento' })
export type ItemDeEvento = z.infer<typeof itemDeEventoSchema>

export const eventoSchema = itemDeEventoSchema
  .extend({
    descricao: z.string().nullable(),
    linkOnline: z.string().nullable(),
    publicadoEm: instante.nullable(),
    canceladoEm: instante.nullable(),
    canceladoMotivo: z.string().nullable(),
    criadoEm: instante,
    empresas: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    tags: z.array(tagDoAlcanceSchema),
  })
  .meta({ id: 'Evento' })
export type Evento = z.infer<typeof eventoSchema>

export const ABAS_DE_EVENTOS = ['proximos', 'passados', 'rascunhos'] as const
export const consultaDeEventosSchema = z
  .object({
    aba: z.enum(ABAS_DE_EVENTOS).default('proximos'),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_DE_PAGINA).default(25),
  })
  .strict()
export type ConsultaDeEventos = z.infer<typeof consultaDeEventosSchema>

export const listaDeEventosSchema = z
  .object({
    itens: z.array(itemDeEventoSchema),
    total: z.number().int().nonnegative(),
    abas: z.object({
      proximos: z.number().int().nonnegative(),
      passados: z.number().int().nonnegative(),
      rascunhos: z.number().int().nonnegative(),
    }),
  })
  .meta({ id: 'ListaDeEventos' })
export type ListaDeEventos = z.infer<typeof listaDeEventosSchema>

const vagas = z.number().int().min(1, 'use ao menos 1 vaga').max(MAXIMO_DE_VAGAS)
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `no máximo ${max} caracteres`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null))

/** Criar e editar um evento (o rascunho vira publicado por `POST /portal-eventos/{id}/publicar`). */
export const salvarEventoSchema = z
  .object({
    titulo: z
      .string()
      .trim()
      .min(3, 'informe o título')
      .max(
        TAMANHO_MAXIMO_DO_TITULO_DO_EVENTO,
        `no máximo ${TAMANHO_MAXIMO_DO_TITULO_DO_EVENTO} caracteres`,
      ),
    descricao: textoOpcional(TAMANHO_MAXIMO_DA_DESCRICAO_DO_EVENTO),
    local: textoOpcional(TAMANHO_MAXIMO_DO_LOCAL),
    linkOnline: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), {
        message: 'informe um endereço que comece com http:// ou https://',
      })
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    inicioEm: instante,
    fimEm: instante,
    vagasTotais: vagas
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    vagasPorEmpresa: vagas
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    prazoConfirmacao: instante
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    alcance: alcanceDaPublicacaoSchema,
    empresaIds: z.array(z.uuid()).max(MAXIMO_DE_EMPRESAS_NO_ALCANCE).default([]),
    tagIds: tagIdsDoAlcanceSchema.default([]),
  })
  .strict()
  .superRefine((d, ctx) => {
    validarAudiencia(d, ctx)
    const inicio = new Date(d.inicioEm).getTime()
    if (new Date(d.fimEm).getTime() <= inicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['fimEm'],
        message: 'o fim precisa ser depois do início',
      })
    }
    if (d.prazoConfirmacao && new Date(d.prazoConfirmacao).getTime() > inicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['prazoConfirmacao'],
        message: 'o prazo de confirmação não pode passar do início do evento',
      })
    }
  })
  .meta({ id: 'SalvarEventoEntrada' })
export type SalvarEventoEntrada = z.infer<typeof salvarEventoSchema>

export const cancelarEventoSchema = z
  .object({
    motivo: z
      .string()
      .trim()
      .min(1, 'informe o motivo')
      .max(TAMANHO_MAXIMO_DO_MOTIVO_DE_CANCELAR_EVENTO),
  })
  .strict()
  .meta({ id: 'CancelarEventoEntrada' })
export type CancelarEventoEntrada = z.infer<typeof cancelarEventoSchema>

export const participanteDoEventoSchema = z
  .object({
    /** Id da confirmação (para a equipe tirar a pessoa do evento) */
    id: z.uuid(),
    pessoa: z.string(),
    email: z.string(),
    empresa: z.string(),
    situacao: situacaoDaConfirmacaoSchema,
    entrouNaFilaEm: instante,
    confirmadoEm: instante.nullable(),
    promovidoEm: instante.nullable(),
    /** Posição na lista de espera (1 = a próxima a ser promovida); nulo para quem está confirmado */
    posicaoNaFila: z.number().int().positive().nullable(),
  })
  .meta({ id: 'ParticipanteDoEvento' })
export type ParticipanteDoEvento = z.infer<typeof participanteDoEventoSchema>

export const listaDeParticipantesSchema = z
  .object({
    confirmados: z.array(participanteDoEventoSchema),
    listaDeEspera: z.array(participanteDoEventoSchema),
  })
  .meta({ id: 'ListaDeParticipantes' })
export type ListaDeParticipantes = z.infer<typeof listaDeParticipantesSchema>

// -------------------------------------------------------------------------------------------- cliente

export const minhaSituacaoNoEventoSchema = z
  .enum(['nenhuma', 'confirmado', 'lista_espera'])
  .meta({ id: 'MinhaSituacaoNoEvento' })
export type MinhaSituacaoNoEvento = z.infer<typeof minhaSituacaoNoEventoSchema>

export const eventoDoPortalSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    descricao: z.string().nullable(),
    local: z.string().nullable(),
    linkOnline: z.string().nullable(),
    inicioEm: instante,
    fimEm: instante,
    prazoConfirmacao: instante.nullable(),
    cancelado: z.boolean(),
    /** Vagas que ainda restam no total; nulo = sem limite */
    vagasRestantes: z.number().int().nonnegative().nullable(),
    lotado: z.boolean(),
    /** As vagas da empresa do cliente: o limite (nulo = sem limite) e quantos colegas já confirmaram */
    vagasDaEmpresa: z.object({
      limite: z.number().int().positive().nullable(),
      confirmados: z.number().int().nonnegative(),
    }),
    minhaSituacao: minhaSituacaoNoEventoSchema,
    podeConfirmar: z.boolean(),
    podeCancelar: z.boolean(),
    motivoDoBloqueio: motivoDeBloqueioDoEventoSchema.nullable(),
  })
  .meta({ id: 'EventoDoPortal' })
export type EventoDoPortal = z.infer<typeof eventoDoPortalSchema>

export const consultaDeEventosDoPortalSchema = z
  .object({
    aba: z.enum(['proximos', 'passados']).default('proximos'),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict()
export type ConsultaDeEventosDoPortal = z.infer<typeof consultaDeEventosDoPortalSchema>

export const listaDeEventosDoPortalSchema = z
  .object({ itens: z.array(eventoDoPortalSchema), total: z.number().int().nonnegative() })
  .meta({ id: 'ListaDeEventosDoPortal' })
export type ListaDeEventosDoPortal = z.infer<typeof listaDeEventosDoPortalSchema>

/** Os próximos eventos do Início do portal */
export const proximosEventosDoPortalSchema = z
  .object({ itens: z.array(eventoDoPortalSchema) })
  .meta({ id: 'ProximosEventosDoPortal' })
export type ProximosEventosDoPortal = z.infer<typeof proximosEventosDoPortalSchema>

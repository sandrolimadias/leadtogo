import { z } from 'zod'

import { TAMANHO_MAXIMO_DE_PAGINA } from './paginacao.js'
import { alcanceDaPublicacaoSchema, MAXIMO_DE_EMPRESAS_NO_ALCANCE } from './publicacoes.js'

// Portal do cliente, Fase 3E: avisos curtos (notificação no sino + push + e-mail), preferências de quem recebe,
// inscrição de push (Web Push/VAPID) e busca global. Docs: plano_portal_cliente.md (seção 8) e funcionalidades.md (9G).

export const TAMANHO_MAXIMO_DO_AVISO = 140
export const LIMITE_SEMANAL_PADRAO_DE_AVISOS = 3

export const URGENCIAS_DO_AVISO = ['normal', 'urgente'] as const
export const urgenciaDoAvisoSchema = z.enum(URGENCIAS_DO_AVISO).meta({ id: 'UrgenciaDoAviso' })
export type UrgenciaDoAviso = z.infer<typeof urgenciaDoAvisoSchema>
export const ROTULO_DA_URGENCIA_DO_AVISO: Record<UrgenciaDoAviso, string> = {
  normal: 'Normal',
  urgente: 'Urgente',
}

export const SITUACOES_DO_AVISO = ['agendado', 'enviado', 'cancelado'] as const
export const situacaoDoAvisoSchema = z.enum(SITUACOES_DO_AVISO).meta({ id: 'SituacaoDoAviso' })
export type SituacaoDoAviso = z.infer<typeof situacaoDoAvisoSchema>
export const ROTULO_DA_SITUACAO_DO_AVISO: Record<SituacaoDoAviso, string> = {
  agendado: 'Agendado',
  enviado: 'Enviado',
  cancelado: 'Cancelado',
}

const instante = z.iso.datetime({ offset: true })

/** O link do aviso: uma rota do portal (`/agenda`) ou um endereço http(s). Nunca `//` nem `javascript:`. */
export const linkDoAvisoSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^\/(?!\/)\S*$/.test(v) || /^https?:\/\/\S+$/i.test(v), {
    message: 'use um caminho do portal (ex.: /agenda) ou um endereço http(s)',
  })

// ---------------------------------------------------------------------------------------- equipe (CRM)

export const avisoSchema = z
  .object({
    id: z.uuid(),
    mensagem: z.string(),
    link: z.string().nullable(),
    urgencia: urgenciaDoAvisoSchema,
    alcance: alcanceDaPublicacaoSchema,
    situacao: situacaoDoAvisoSchema,
    enviarEm: instante,
    enviadoEm: instante.nullable(),
    canceladoEm: instante.nullable(),
    /** Quantas pessoas foram escolhidas (calculado no envio) */
    destinatarios: z.number().int().nonnegative(),
    /** Entregas no sino (as que não passaram do limite semanal) */
    entregues: z.number().int().nonnegative(),
    lidos: z.number().int().nonnegative(),
    pushEnviados: z.number().int().nonnegative(),
    emailsEnfileirados: z.number().int().nonnegative(),
    criadoEm: instante,
    empresas: z.array(z.object({ id: z.uuid(), nome: z.string() })),
  })
  .meta({ id: 'Aviso' })
export type Aviso = z.infer<typeof avisoSchema>

export const consultaDeAvisosSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_DE_PAGINA).default(25),
  })
  .strict()
export type ConsultaDeAvisos = z.infer<typeof consultaDeAvisosSchema>

export const listaDeAvisosSchema = z
  .object({
    itens: z.array(avisoSchema),
    total: z.number().int().nonnegative(),
    /**
     * Avisos normais da semana corrente (segunda a domingo, horário de Brasília) que a empresa mais atingida já
     * tem (enviados ou agendados, sem os cancelados) e o limite por empresa. Os urgentes não contam.
     */
    semana: z.object({
      usados: z.number().int().nonnegative(),
      limite: z.number().int().positive(),
    }),
  })
  .meta({ id: 'ListaDeAvisos' })
export type ListaDeAvisos = z.infer<typeof listaDeAvisosSchema>

export const criarAvisoSchema = z
  .object({
    mensagem: z
      .string()
      .trim()
      .min(1, 'escreva a mensagem')
      .max(TAMANHO_MAXIMO_DO_AVISO, `no máximo ${TAMANHO_MAXIMO_DO_AVISO} caracteres`),
    link: linkDoAvisoSchema
      .nullable()
      .optional()
      .transform((v) => (v ? v : null)),
    urgencia: urgenciaDoAvisoSchema.default('normal'),
    alcance: alcanceDaPublicacaoSchema,
    empresaIds: z.array(z.uuid()).max(MAXIMO_DE_EMPRESAS_NO_ALCANCE).default([]),
    /** Vazio = enviar agora; com data = agendar (precisa estar no futuro) */
    enviarEm: instante
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.alcance === 'empresas' && d.empresaIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['empresaIds'],
        message: 'escolha ao menos uma empresa',
      })
    }
    if (d.alcance === 'todos' && d.empresaIds.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['empresaIds'],
        message: 'o alcance "todos" não tem lista de empresas',
      })
    }
  })
  .meta({ id: 'CriarAvisoEntrada' })
export type CriarAvisoEntrada = z.infer<typeof criarAvisoSchema>

// -------------------------------------------------------------------------------------------- cliente

const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use o formato HH:MM')

export const preferenciasDoPortalSchema = z
  .object({
    /** Horário de silêncio dos avisos normais (push); nulos = sem silêncio */
    silencioInicio: horario.nullable(),
    silencioFim: horario.nullable(),
    emailChamados: z.boolean(),
    emailEventos: z.boolean(),
    emailAvisos: z.boolean(),
    /** Tema do portal (Fase 4A); salvo à parte, em `PUT /portal/preferencias/tema` */
    tema: z.enum(['claro', 'escuro', 'sistema']),
  })
  .meta({ id: 'PreferenciasDoPortal' })
export type PreferenciasDoPortal = z.infer<typeof preferenciasDoPortalSchema>

export const PREFERENCIAS_PADRAO_DO_PORTAL: PreferenciasDoPortal = {
  silencioInicio: null,
  silencioFim: null,
  emailChamados: true,
  emailEventos: true,
  emailAvisos: true,
  tema: 'sistema',
}

export const TEMAS_DO_PORTAL = ['claro', 'escuro', 'sistema'] as const
export type TemaDoPortal = (typeof TEMAS_DO_PORTAL)[number]
export const salvarTemaDoPortalSchema = z
  .object({ tema: z.enum(TEMAS_DO_PORTAL) })
  .strict()
  .meta({ id: 'SalvarTemaDoPortalEntrada' })
export type SalvarTemaDoPortalEntrada = z.infer<typeof salvarTemaDoPortalSchema>

export const salvarPreferenciasDoPortalSchema = preferenciasDoPortalSchema
  .omit({ tema: true })
  // O tema é opcional aqui (ausente não muda); a tela de tema usa `PUT /portal/preferencias/tema`
  .extend({ tema: z.enum(TEMAS_DO_PORTAL).optional() })
  .strict()
  .superRefine((d, ctx) => {
    if ((d.silencioInicio === null) !== (d.silencioFim === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['silencioFim'],
        message: 'informe o início e o fim do silêncio, ou nenhum dos dois',
      })
    } else if (d.silencioInicio !== null && d.silencioInicio === d.silencioFim) {
      ctx.addIssue({
        code: 'custom',
        path: ['silencioFim'],
        message: 'o fim precisa ser diferente do início',
      })
    }
  })
  .meta({ id: 'SalvarPreferenciasDoPortalEntrada' })
export type SalvarPreferenciasDoPortalEntrada = z.infer<typeof salvarPreferenciasDoPortalSchema>

export const configuracaoDePushSchema = z
  .object({
    /** Falso quando o servidor não tem as chaves VAPID: o portal esconde o botão de ativar */
    disponivel: z.boolean(),
    chavePublica: z.string().nullable(),
    /** Quantos aparelhos deste acesso estão inscritos */
    inscricoes: z.number().int().nonnegative(),
  })
  .meta({ id: 'ConfiguracaoDePush' })
export type ConfiguracaoDePush = z.infer<typeof configuracaoDePushSchema>

export const inscreverPushSchema = z
  .object({
    endpoint: z.url().max(1000),
    keys: z.object({
      p256dh: z.string().min(1).max(200),
      auth: z.string().min(1).max(100),
    }),
  })
  .strict()
  .meta({ id: 'InscreverPushEntrada' })
export type InscreverPushEntrada = z.infer<typeof inscreverPushSchema>

export const removerInscricaoDePushSchema = z
  .object({ endpoint: z.url().max(1000) })
  .strict()
  .meta({ id: 'RemoverInscricaoDePushEntrada' })
export type RemoverInscricaoDePushEntrada = z.infer<typeof removerInscricaoDePushSchema>

// -------------------------------------------------------------------------------------------- busca

export const TAMANHO_MINIMO_DA_BUSCA = 2
export const TAMANHO_MAXIMO_DA_BUSCA = 100

export const consultaDeBuscaDoPortalSchema = z
  .object({
    q: z
      .string()
      .trim()
      .min(TAMANHO_MINIMO_DA_BUSCA, `digite ao menos ${TAMANHO_MINIMO_DA_BUSCA} letras`)
      .max(TAMANHO_MAXIMO_DA_BUSCA),
  })
  .strict()
export type ConsultaDeBuscaDoPortal = z.infer<typeof consultaDeBuscaDoPortalSchema>

export const TIPOS_DE_RESULTADO_DA_BUSCA = ['chamado', 'documento', 'evento', 'publicacao'] as const
export const tipoDeResultadoDaBuscaSchema = z.enum(TIPOS_DE_RESULTADO_DA_BUSCA)
export type TipoDeResultadoDaBusca = z.infer<typeof tipoDeResultadoDaBuscaSchema>
export const ROTULO_DO_RESULTADO_DA_BUSCA: Record<TipoDeResultadoDaBusca, string> = {
  chamado: 'Chamados',
  documento: 'Documentos',
  evento: 'Agenda',
  publicacao: 'Publicações',
}

export const resultadoDaBuscaSchema = z
  .object({
    tipo: tipoDeResultadoDaBuscaSchema,
    id: z.uuid(),
    titulo: z.string(),
    /** Um pedaço do texto, quando o termo aparece fora do título */
    trecho: z.string().nullable(),
    /** Rota do portal a abrir */
    destino: z.string(),
    data: instante,
  })
  .meta({ id: 'ResultadoDaBusca' })
export type ResultadoDaBusca = z.infer<typeof resultadoDaBuscaSchema>

export const resultadoDaBuscaDoPortalSchema = z
  .object({ itens: z.array(resultadoDaBuscaSchema) })
  .meta({ id: 'ResultadoDaBuscaDoPortal' })
export type ResultadoDaBuscaDoPortal = z.infer<typeof resultadoDaBuscaDoPortalSchema>

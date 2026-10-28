import { z } from 'zod'

// API aberta, fase I3 (docs/plano_api_aberta.md, seção 6): webhooks de saída. O CRM avisa um sistema externo
// (n8n, ERP) quando algo acontece, com um POST assinado (HMAC-SHA256) e reenvio com espera progressiva.

const instante = z.iso.datetime({ offset: true })

/** Eventos que um webhook pode assinar (v1). Mudar a lista é mudança de contrato: só acrescentar. */
export const EVENTOS_DE_WEBHOOK = [
  'empresa.criada',
  'empresa.atualizada',
  'empresa.tag_alterada',
  'empresa.responsavel_alterado',
  'contato.criado',
  'contato.atualizado',
  'atividade.criada',
  'atividade.concluida',
  'oportunidade.criada',
  'oportunidade.fase_alterada',
  'oportunidade.status_alterado',
  'importacao.concluida',
] as const
export const eventoDeWebhookSchema = z.enum(EVENTOS_DE_WEBHOOK).meta({ id: 'EventoDeWebhook' })
export type EventoDeWebhook = z.infer<typeof eventoDeWebhookSchema>

/** O evento do botão "Enviar teste" (não se assina: vai só para o webhook testado). */
export const EVENTO_DE_TESTE = 'webhook.teste'

export const ROTULO_DO_EVENTO: Record<EventoDeWebhook, string> = {
  'empresa.criada': 'Empresa criada',
  'empresa.atualizada': 'Empresa atualizada',
  'empresa.tag_alterada': 'Tag da empresa alterada',
  'empresa.responsavel_alterado': 'Responsável da empresa alterado',
  'contato.criado': 'Contato criado',
  'contato.atualizado': 'Contato atualizado',
  'atividade.criada': 'Atividade criada',
  'atividade.concluida': 'Atividade concluída',
  'oportunidade.criada': 'Oportunidade criada',
  'oportunidade.fase_alterada': 'Oportunidade mudou de fase',
  'oportunidade.status_alterado': 'Oportunidade conquistada, perdida, cancelada ou suspensa',
  'importacao.concluida': 'Importação de planilha concluída',
}

/** Esperas entre as tentativas (a 1ª sai na hora): 1 min, 5 min, 30 min, 2 h, 6 h, 12 h e 24 h. */
export const ESPERAS_DO_WEBHOOK_S = [60, 300, 1800, 7200, 21_600, 43_200, 86_400] as const
export const TENTATIVAS_DO_WEBHOOK = ESPERAS_DO_WEBHOOK_S.length + 1
/** Webhook com todas as entregas falhando há este tempo é desligado sozinho */
export const DIAS_ATE_DESATIVAR_WEBHOOK = 3

export const SITUACOES_DA_ENTREGA = ['pendente', 'sucesso', 'falhou'] as const
export const situacaoDaEntregaSchema = z
  .enum(SITUACOES_DA_ENTREGA)
  .meta({ id: 'SituacaoDaEntrega' })
export type SituacaoDaEntrega = z.infer<typeof situacaoDaEntregaSchema>

/** URL do webhook: http(s), sem usuário e senha na URL, até 500 caracteres. O servidor confere o resto. */
export const urlDeWebhookSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v)
      return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password
    } catch {
      return false
    }
  }, 'informe um endereço http(s) válido, sem usuário e senha')

export const webhookSchema = z
  .object({
    id: z.uuid(),
    descricao: z.string(),
    url: z.string(),
    eventos: z.array(z.string()),
    ativo: z.boolean(),
    /** Por que foi desligado sozinho (`falhas` ou `410`); nulo se ativo ou desligado à mão */
    desativadoMotivo: z.string().nullable(),
    /** Rotação do segredo: a assinatura antiga ainda vai junto até este instante */
    segredoAnteriorAte: instante.nullable(),
    ultimoSucessoEm: instante.nullable(),
    falhandoDesde: instante.nullable(),
    /** Últimas 24 h */
    entregas24h: z.object({
      sucesso: z.number().int(),
      falhou: z.number().int(),
      pendente: z.number().int(),
    }),
    criadoEm: instante,
    criadoPor: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
  })
  .meta({ id: 'Webhook' })
export type Webhook = z.infer<typeof webhookSchema>

export const listaDeWebhooksSchema = z
  .object({ itens: z.array(webhookSchema) })
  .meta({ id: 'ListaDeWebhooks' })
export type ListaDeWebhooks = z.infer<typeof listaDeWebhooksSchema>

/** A resposta da criação e da rotação: o SEGREDO só aparece aqui, uma vez. */
export const webhookCriadoSchema = z
  .object({ webhook: webhookSchema, segredo: z.string() })
  .meta({ id: 'WebhookCriado' })
export type WebhookCriado = z.infer<typeof webhookCriadoSchema>

const descricao = z.string().trim().min(1, 'informe a descrição').max(120)
const eventos = z
  .array(eventoDeWebhookSchema)
  .min(1, 'escolha ao menos um evento')
  .max(EVENTOS_DE_WEBHOOK.length)

export const criarWebhookSchema = z
  .object({ descricao, url: urlDeWebhookSchema, eventos })
  .strict()
  .meta({ id: 'CriarWebhook' })
export type CriarWebhookEntrada = z.infer<typeof criarWebhookSchema>

export const alterarWebhookSchema = z
  .object({ descricao, url: urlDeWebhookSchema, eventos, ativo: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarWebhook' })
export type AlterarWebhookEntrada = z.infer<typeof alterarWebhookSchema>

export const entregaDeWebhookSchema = z
  .object({
    id: z.uuid(),
    eventoId: z.uuid(),
    tipo: z.string(),
    situacao: situacaoDaEntregaSchema,
    tentativas: z.number().int(),
    statusHttp: z.number().int().nullable(),
    duracaoMs: z.number().int().nullable(),
    /** Até 2 KB da resposta do destino, ou o erro de rede */
    resposta: z.string().nullable(),
    erro: z.string().nullable(),
    proximaTentativaEm: instante.nullable(),
    entregueEm: instante.nullable(),
    criadoEm: instante,
  })
  .meta({ id: 'EntregaDeWebhook' })
export type EntregaDeWebhook = z.infer<typeof entregaDeWebhookSchema>

export const consultaDeEntregasSchema = z
  .object({
    situacao: situacaoDaEntregaSchema.optional(),
    tipo: z.string().trim().max(60).optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
export type ConsultaDeEntregas = z.output<typeof consultaDeEntregasSchema>
export type ConsultaDeEntregasEntrada = z.input<typeof consultaDeEntregasSchema>

export const listaDeEntregasSchema = z
  .object({
    itens: z.array(entregaDeWebhookSchema),
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
  })
  .meta({ id: 'ListaDeEntregasDeWebhook' })
export type ListaDeEntregas = z.infer<typeof listaDeEntregasSchema>

export const reenvioDeEntregasSchema = z
  .object({ reenviadas: z.number().int() })
  .meta({ id: 'ReenvioDeEntregas' })
export type ReenvioDeEntregas = z.infer<typeof reenvioDeEntregasSchema>

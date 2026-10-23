import { z } from 'zod'

// Central de notificações (sino do CRM): REST e o fluxo em tempo real (SSE). Na Fase 2 só os chamados
// geram notificações; as demais (tarefa atribuída, prazo, WhatsApp...) entram nas fases das integrações.

export const notificacaoSchema = z
  .object({
    id: z.uuid(),
    /** `chamado.aberto`, `chamado.atribuido`, `chamado.mensagem`... */
    tipo: z.string(),
    titulo: z.string(),
    mensagem: z.string().nullable(),
    /** Caminho no app (ex.: `/chamados/<id>`) */
    link: z.string().nullable(),
    chamadoId: z.uuid().nullable(),
    lida: z.boolean(),
    criadoEm: z.iso.datetime(),
  })
  .meta({ id: 'Notificacao' })
export type Notificacao = z.infer<typeof notificacaoSchema>

export const consultaDeNotificacoesSchema = z
  .object({
    somenteNaoLidas: z.enum(['true', 'false']).default('false'),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
export type ConsultaDeNotificacoes = z.infer<typeof consultaDeNotificacoesSchema>

export const listaDeNotificacoesSchema = z
  .object({
    itens: z.array(notificacaoSchema),
    total: z.number().int(),
    /** O número do sino */
    naoLidas: z.number().int(),
  })
  .meta({ id: 'ListaDeNotificacoes' })
export type ListaDeNotificacoes = z.infer<typeof listaDeNotificacoesSchema>

export const marcadasComoLidasSchema = z
  .object({ marcadas: z.number().int(), naoLidas: z.number().int() })
  .meta({ id: 'MarcadasComoLidas' })
export type MarcadasComoLidas = z.infer<typeof marcadasComoLidasSchema>

/** O que o fluxo em tempo real avisa: chegou notificação (o app atualiza o sino e a lista). */
export const eventoDoSinoSchema = z
  .object({ id: z.uuid(), tipo: z.string(), titulo: z.string() })
  .meta({ id: 'EventoDoSino' })
export type EventoDoSino = z.infer<typeof eventoDoSinoSchema>

import { type Conexao, novoId, sql } from '@leadtogo/db'
import type { EventoDeWebhook } from '@leadtogo/shared'

type Transacao = Parameters<Parameters<Conexao['db']['transaction']>[0]>[0]

/** Versão do envelope dos eventos (docs/plano_api_aberta.md, seção 6.2). Só aditiva dentro da v1. */
export const VERSAO_DO_EVENTO = 1

export interface AtorDoEvento {
  tipo: 'membro' | 'integracao' | 'sistema'
  id: string | null
  nome: string
}

export interface EnvelopeDoEvento {
  id: string
  tipo: string
  versao: number
  ocorrido_em: string
  empresa_tenant: { id: string; nome: string }
  ator: AtorDoEvento
  dados: unknown
}

/** camelCase → snake_case (os nomes dos campos alterados vão no formato da API pública). */
export const paraSnake = (nome: string): string =>
  nome.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`)

/**
 * Grava no outbox, NA MESMA TRANSAÇÃO do dado, um evento de domínio para os webhooks (desfeita a transação, não
 * há evento). Só grava se a empresa tem algum webhook ativo que assina o tipo: sem assinante, nada custa.
 * `dados` é montado aqui (o DTO público no momento do evento); o relay do worker distribui aos webhooks.
 */
export async function emitirEvento(
  db: Transacao,
  evento: {
    tenantId: string
    tipo: EventoDeWebhook
    entidadeId: string
    /** Quem fez: o membro (pessoa ou integração); nulo = o sistema */
    membroId: string | null
    dados: () => Promise<unknown>
    /** Emite mesmo numa transação silenciada (o `importacao.concluida`, no fim do lote) */
    ignorarSilencio?: boolean
  },
): Promise<void> {
  const [assinante] = await db.execute<{ existe: number }>(sql`
    SELECT 1 AS existe FROM webhooks
    WHERE ativo AND excluido_em IS NULL AND ${evento.tipo} = ANY (eventos)
      AND (${evento.ignorarSilencio === true} OR coalesce(current_setting(${SILENCIO}, true), '') <> '1')
    LIMIT 1`)
  if (!assinante) return
  const envelope = await montarEnvelope(db, { ...evento, dados: await evento.dados() })
  await db.execute(sql`
    INSERT INTO eventos_outbox (id, tenant_id, tipo, entidade_id, payload)
    VALUES (${envelope.id}, ${evento.tenantId}, ${EVENTO_DISTRIBUIR}, ${evento.entidadeId},
            ${JSON.stringify(envelope)}::jsonb)`)
}

/**
 * Variável da transação que silencia os eventos de domínio (`set_config(SILENCIO, '1', true)`): a importação de
 * planilha a liga nas transações das linhas, para avisar uma vez só, no fim do lote (`importacao.concluida`).
 */
export const SILENCIO = 'app.silenciar_webhooks'

/** O tipo do outbox que leva um evento de domínio até os webhooks (o tipo do domínio vai no envelope). */
export const EVENTO_DISTRIBUIR = 'webhook.distribuir'
/** Entrega avulsa (teste, reenvio): o relay só enfileira a entrega já criada. */
export const EVENTO_ENTREGAR = 'webhook.entregar'

export async function montarEnvelope(
  db: Transacao,
  e: { tenantId: string; tipo: string; membroId: string | null; dados: unknown },
): Promise<EnvelopeDoEvento> {
  const [empresa] = await db.execute<{ nome: string }>(sql`
    SELECT coalesce(nome_fantasia, razao_social) AS nome FROM tenants WHERE id = ${e.tenantId}`)
  let ator: AtorDoEvento = { tipo: 'sistema', id: null, nome: 'Sistema' }
  if (e.membroId) {
    const [m] = await db.execute<{ nome: string; tipo: string }>(sql`
      SELECT nome, tipo::text AS tipo FROM membros WHERE id = ${e.membroId}`)
    if (m)
      ator = {
        tipo: m.tipo === 'integracao' ? 'integracao' : 'membro',
        id: e.membroId,
        nome: m.nome,
      }
  }
  return {
    id: novoId(),
    tipo: e.tipo,
    versao: VERSAO_DO_EVENTO,
    ocorrido_em: new Date().toISOString(),
    empresa_tenant: { id: e.tenantId, nome: empresa?.nome ?? '' },
    ator,
    dados: e.dados,
  }
}

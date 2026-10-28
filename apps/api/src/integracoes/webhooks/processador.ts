import { type Conexao, novoId, sql } from '@leadtogo/db'
import {
  DIAS_ATE_DESATIVAR_WEBHOOK,
  ESPERAS_DO_WEBHOOK_S,
  TENTATIVAS_DO_WEBHOOK,
} from '@leadtogo/shared'
import type { Job, Queue } from 'bullmq'
import type { Logger } from 'pino'

import { perfilEfetivo } from '../../acesso/permissoes-do-membro.js'
import type { Configuracao } from '../../configuracao/configuracao.js'
import { chavesDe, decifrar } from '../../seguranca/cifra.js'
import { FILAS } from '../../worker/filas.js'
import type { ManipuladorDeEvento } from '../../worker/outbox/relay.js'
import { assinar, entregar } from './entrega.js'
import type { EnvelopeDoEvento } from './eventos.js'
import { politicaDe } from './webhooks.service.js'

type Transacao = Parameters<Parameters<Conexao['db']['transaction']>[0]>[0]

export interface JobDeWebhook {
  tenantId: string
  entregaId: string
}

/** Id do job: a entrega e a tentativa (reentregar a mesma tentativa não duplica); `rodada` distingue reenvios. */
export const jobIdDaEntrega = (entregaId: string, tentativa: number, rodada?: string) =>
  `webhook-${entregaId}-${tentativa}${rodada ? `-${rodada}` : ''}`

export async function enfileirarEntrega(
  fila: Queue,
  dados: JobDeWebhook,
  tentativa: number,
  opcoes: { esperaMs?: number; rodada?: string } = {},
): Promise<void> {
  await fila.add('entregar', dados, {
    jobId: jobIdDaEntrega(dados.entregaId, tentativa, opcoes.rodada),
    delay: opcoes.esperaMs ?? 0,
    // O reenvio é nosso (proxima_tentativa_em): o BullMQ não repete
    attempts: 1,
    removeOnComplete: { age: 86_400 },
    removeOnFail: { age: 7 * 86_400 },
  })
}

/**
 * Evento de domínio (`webhook.distribuir`): cria uma entrega para cada webhook ativo que assina o tipo (única por
 * webhook e evento: reentrega do outbox não duplica) e, DEPOIS do commit, enfileira as entregas.
 */
export function manipuladorDaDistribuicao(): ManipuladorDeEvento {
  return async (evento, { tx, filas }) => {
    const envelope = evento.payload as EnvelopeDoEvento
    const assinantes = await tx.execute<{ id: string }>(sql`
      SELECT w.id FROM webhooks w
      WHERE w.ativo AND w.excluido_em IS NULL AND ${envelope.tipo} = ANY (w.eventos)`)
    const criadas: string[] = []
    for (const { id: webhookId } of assinantes) {
      const [criada] = await tx.execute<{ id: string }>(sql`
        INSERT INTO webhook_entregas (id, tenant_id, webhook_id, evento_id, tipo, corpo)
        VALUES (${novoId()}, ${evento.tenantId}, ${webhookId}, ${envelope.id}, ${envelope.tipo},
                ${JSON.stringify(envelope)}::jsonb)
        ON CONFLICT (webhook_id, evento_id) DO NOTHING
        RETURNING id`)
      if (criada) criadas.push(criada.id)
    }
    if (criadas.length === 0) return
    return async () => {
      for (const id of criadas) {
        await enfileirarEntrega(
          filas.fila(FILAS.webhooks),
          { tenantId: evento.tenantId, entregaId: id },
          0,
        )
      }
    }
  }
}

/** Entrega avulsa (teste, reenvio): a entrega já existe; só vai para a fila depois do commit. */
export function manipuladorDaEntregaAvulsa(): ManipuladorDeEvento {
  return async (evento, { tx, filas }) => {
    const { entregaId } = evento.payload as { entregaId: string }
    const [e] = await tx.execute<{ tentativas: number }>(sql`
      SELECT tentativas FROM webhook_entregas WHERE id = ${entregaId} AND situacao = 'pendente'`)
    if (!e) return
    return () =>
      enfileirarEntrega(
        filas.fila(FILAS.webhooks),
        { tenantId: evento.tenantId, entregaId },
        e.tentativas,
        {
          rodada: evento.id,
        },
      )
  }
}

type EntregaReservada = {
  id: string
  webhook_id: string
  tipo: string
  corpo: unknown
  tentativas: number
  url: string
  segredo: string
  segredo_anterior: string | null
  anterior_valido: boolean
}

/**
 * Processa uma entrega (fila `webhooks`): reserva (2 min), faz o POST FORA da transação, e grava o resultado.
 * Falhou: agenda a próxima tentativa (1 min, 5 min, 30 min, 2 h, 6 h, 12 h, 24 h) ou desiste na 8ª. 410 Gone
 * desliga o webhook na hora; todas as entregas falhando há 3 dias também (aviso no sino de quem gere integrações).
 */
export function processadorDeWebhooks(deps: {
  banco: Conexao
  config: Configuracao
  fila: () => Queue
  log: Logger
}) {
  const { banco, config, log } = deps
  const noTenant = <T>(tenantId: string, fn: (tx: Transacao) => Promise<T>) =>
    banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      return fn(tx)
    })

  return async (job: Job): Promise<string> => {
    const { tenantId, entregaId } = job.data as JobDeWebhook
    const reservada = await noTenant(tenantId, async (tx) => {
      const [e] = await tx.execute<EntregaReservada>(sql`
        UPDATE webhook_entregas e SET reservada_ate = now() + interval '2 minutes'
        FROM webhooks w
        WHERE e.id = ${entregaId} AND w.id = e.webhook_id AND e.situacao = 'pendente'
          AND (e.reservada_ate IS NULL OR e.reservada_ate < now())
          AND (w.ativo OR e.avulsa) AND w.excluido_em IS NULL
        RETURNING e.id, e.webhook_id, e.tipo, e.corpo, e.tentativas, w.url, w.segredo, w.segredo_anterior,
          coalesce(w.segredo_anterior_ate > now(), false) AS anterior_valido`)
      if (!e) {
        // Webhook desativado ou excluído antes da vez: a entrega pendente não sai mais
        await tx.execute(sql`
          UPDATE webhook_entregas e SET situacao = 'falhou', erro = 'webhook desativado', atualizado_em = now(),
            proxima_tentativa_em = NULL
          FROM webhooks w
          WHERE e.id = ${entregaId} AND w.id = e.webhook_id AND e.situacao = 'pendente' AND NOT e.avulsa
            AND (NOT w.ativo OR w.excluido_em IS NOT NULL)`)
      }
      return e ?? null
    })
    if (!reservada) return 'ignorada'

    const chaves = chavesDe(config)
    const segredos = [decifrar(reservada.segredo, chaves)]
    if (reservada.segredo_anterior && reservada.anterior_valido) {
      segredos.push(decifrar(reservada.segredo_anterior, chaves))
    }
    const corpo = JSON.stringify(reservada.corpo)
    const resultado = await entregar(
      reservada.url,
      corpo,
      {
        'X-Leadtogo-Evento': reservada.tipo,
        'X-Leadtogo-Entrega': reservada.id,
        'X-Leadtogo-Assinatura': assinar(corpo, segredos),
      },
      politicaDe(config),
      config.WEBHOOK_TIMEOUT_MS,
    )
    const tentativa = reservada.tentativas + 1

    const proxima = await noTenant(tenantId, async (tx) => {
      if (resultado.ok) {
        await tx.execute(sql`
          UPDATE webhook_entregas SET situacao = 'sucesso', tentativas = ${tentativa},
            status_http = ${resultado.statusHttp}, duracao_ms = ${resultado.duracaoMs}, resposta = ${resultado.resposta},
            erro = NULL, entregue_em = now(), proxima_tentativa_em = NULL, reservada_ate = NULL, atualizado_em = now()
          WHERE id = ${entregaId}`)
        await tx.execute(sql`
          UPDATE webhooks SET ultimo_sucesso_em = now(), falhando_desde = NULL WHERE id = ${reservada.webhook_id}`)
        return null
      }
      const gone = resultado.statusHttp === 410
      const espera = ESPERAS_DO_WEBHOOK_S[tentativa - 1]
      const desiste = gone || tentativa >= TENTATIVAS_DO_WEBHOOK || espera === undefined
      await tx.execute(sql`
        UPDATE webhook_entregas SET situacao = ${desiste ? 'falhou' : 'pendente'}, tentativas = ${tentativa},
          status_http = ${resultado.statusHttp}, duracao_ms = ${resultado.duracaoMs}, resposta = ${resultado.resposta},
          erro = ${resultado.erro ?? `HTTP ${resultado.statusHttp ?? '?'}`}, reservada_ate = NULL, atualizado_em = now(),
          proxima_tentativa_em = ${desiste ? null : new Date(Date.now() + (espera ?? 0) * 1000).toISOString()}::timestamptz
        WHERE id = ${entregaId}`)
      const [w] = await tx.execute<{ desligar: boolean; descricao: string }>(sql`
        UPDATE webhooks SET falhando_desde = coalesce(falhando_desde, now()) WHERE id = ${reservada.webhook_id}
        RETURNING ativo AND (${gone}
          OR (falhando_desde <= now() - make_interval(days => ${DIAS_ATE_DESATIVAR_WEBHOOK})
              AND (ultimo_sucesso_em IS NULL OR ultimo_sucesso_em < falhando_desde))) AS desligar, descricao`)
      if (w?.desligar)
        await desligar(tx, tenantId, reservada.webhook_id, w.descricao, gone ? '410' : 'falhas')
      return desiste ? null : { tentativa, esperaMs: (espera ?? 0) * 1000 }
    })
    if (proxima) {
      await enfileirarEntrega(deps.fila(), { tenantId, entregaId }, proxima.tentativa, {
        esperaMs: proxima.esperaMs,
      })
    }
    log.info(
      { entregaId, status: resultado.statusHttp, ok: resultado.ok, tentativa },
      'entrega de webhook',
    )
    return resultado.ok ? 'sucesso' : proxima ? 'reagendada' : 'falhou'
  }
}

/** Desliga o webhook e avisa no sino quem tem `integracoes.gerir`. */
async function desligar(
  tx: Transacao,
  tenantId: string,
  webhookId: string,
  descricao: string,
  motivo: '410' | 'falhas',
): Promise<void> {
  await tx.execute(sql`
    UPDATE webhooks SET ativo = false, desativado_motivo = ${motivo}, atualizado_em = now() WHERE id = ${webhookId}`)
  await tx.execute(sql`
    UPDATE webhook_entregas SET situacao = 'falhou', erro = 'webhook desativado', proxima_tentativa_em = NULL,
      atualizado_em = now()
    WHERE webhook_id = ${webhookId} AND situacao = 'pendente' AND NOT avulsa`)
  const quem = await tx.execute<{ id: string }>(sql`
    SELECT DISTINCT m.id FROM membros m
    JOIN perfis_acesso p ON ${perfilEfetivo(sql`m`, sql`p`)}
    JOIN perfil_permissoes pp ON pp.perfil_id = p.id AND pp.permissao = 'integracoes.gerir'
    WHERE m.ativo AND m.excluido_em IS NULL AND m.usuario_id IS NOT NULL`)
  const mensagem =
    motivo === '410'
      ? 'O destino respondeu 410 (não existe mais). Confira o endereço e religue o webhook.'
      : `Todas as entregas falharam nos últimos ${DIAS_ATE_DESATIVAR_WEBHOOK} dias. Confira o destino, religue e reenvie as falhas.`
  for (const { id } of quem) {
    await tx.execute(sql`
      INSERT INTO notificacoes (id, tenant_id, membro_id, tipo, titulo, mensagem, link)
      VALUES (${novoId()}, ${tenantId}, ${id}, 'integracao.webhook_desativado',
              ${`O webhook "${descricao}" foi desligado`}, ${mensagem}, '/configuracoes/integracoes')`)
  }
}

/** Rede de segurança (manutenção, a cada minuto): entregas pendentes vencidas que saíram da fila voltam a ela. */
export async function reenfileirarEntregasAtrasadas(banco: Conexao, fila: Queue): Promise<number> {
  const achadas = await banco.cliente<{ id: string; tenant_id: string; tentativas: number }[]>`
    SELECT id, tenant_id, tentativas FROM app_entregas_atrasadas()`
  const rodada = `varredura${Math.floor(Date.now() / 60_000)}`
  for (const a of achadas) {
    await enfileirarEntrega(fila, { tenantId: a.tenant_id, entregaId: a.id }, a.tentativas, {
      rodada,
    })
  }
  return achadas.length
}

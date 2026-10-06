import { Queue, type QueueOptions, type WorkerOptions } from 'bullmq'
import { Redis } from 'ioredis'

import type { Configuracao } from '../configuracao/configuracao.js'

/** Nomes das filas BullMQ. */
export const FILAS = {
  /** Tarefas agendadas (partições da auditoria, limpezas) */
  manutencao: 'manutencao',
  /** Grava notificações na central do membro (consumidor idempotente: o id da notificação é o id do evento) */
  notificacoes: 'notificacoes',
  /** E-mails de identidade (conteúdo cifrado) com reenvio e espera progressiva */
  email: 'email',
  /** Ciclos do relay do outbox (agendados a cada 2 s) */
  outbox: 'outbox',
  /** Só existe fora de produção: os testes do worker (encerramento, retenção) usam. */
  teste: 'teste',
} as const
export type NomeDaFila = (typeof FILAS)[keyof typeof FILAS]

/**
 * Retenção dos jobs no Valkey. O `jobId` só descarta repetição ENQUANTO o job existe: depois do
 * prazo de retenção um evento reenfileirado seria processado de novo. Por isso os consumidores
 * também são idempotentes (a chave única é o id do evento), e a retenção dos concluídos (24 h)
 * cobre com folga o tempo entre enfileirar e marcar o evento como processado.
 */
export const RETENCAO = {
  concluidos: { age: 24 * 3600 },
  /** Falhos ficam mais tempo para diagnóstico (o payload sensível é apagado na falha final) */
  falhos: { age: 14 * 24 * 3600 },
} as const

/** Conexão do ioredis para uma fila ou worker (cada um usa a sua; o Worker exige `maxRetriesPerRequest: null`). */
export function criarConexaoDeFila(config: Configuracao): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null })
}

export function opcoesDeFila(config: Configuracao, conexao: Redis): QueueOptions {
  return {
    connection: conexao,
    prefix: config.FILA_PREFIXO,
    defaultJobOptions: { removeOnComplete: RETENCAO.concluidos, removeOnFail: RETENCAO.falhos },
  }
}

export function opcoesDeWorker(config: Configuracao, conexao: Redis): WorkerOptions {
  return {
    connection: conexao,
    prefix: config.FILA_PREFIXO,
    concurrency: config.WORKER_CONCORRENCIA,
    lockDuration: config.FILA_LOCK_MS,
    // Um job que perde o lock (worker caiu ou saiu no prazo) volta para a fila; até 3 vezes antes de falhar
    stalledInterval: Math.max(500, Math.floor(config.FILA_LOCK_MS / 2)),
    maxStalledCount: 3,
  }
}

export function criarFila(nome: NomeDaFila, config: Configuracao): Queue {
  return new Queue(nome, opcoesDeFila(config, criarConexaoDeFila(config)))
}

import { type Conexao, sql } from '@leadtogo/db'
import type { Job } from 'bullmq'
import type { Redis } from 'ioredis'

import type { EnviadorSmtp } from '../email/enviador.js'
import type { JobDeEmail } from '../email/email.service.js'
import type { ModeloDeEmail } from '../email/modelos.js'
import { type Chaves, decifrar } from '../seguranca/cifra.js'

/**
 * Consumidor da fila `email`: decifra o conteúdo e envia por SMTP. Falha de envio lança erro e o
 * BullMQ tenta de novo com espera progressiva. Concluído o envio, o conteúdo sai do job (que o
 * Valkey retém por 24 h); na falha final, `limparDadosDoJobFalho` faz o mesmo.
 */
export function processadorDeEmail(enviador: EnviadorSmtp, chaves: Chaves) {
  return async (job: Job<JobDeEmail>): Promise<string> => {
    const { para, ...modelo } = JSON.parse(decifrar(job.data.p, chaves)) as {
      para: string
    } & ModeloDeEmail
    await enviador.enviar(para, modelo)
    await job.updateData({ p: '' })
    return 'enviado'
  }
}

/** Apaga o conteúdo sensível de um job que esgotou as tentativas (os falhos ficam 14 dias no Valkey). */
export async function limparDadosDoJobFalho(job: Job | undefined): Promise<void> {
  if (!job) return
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) await job.updateData({ p: '' })
}

/**
 * Consumidor da fila de teste (fora de produção). Idempotente: quando o job traz `eventoId`, o efeito
 * (`INCR chave:n`) acontece uma única vez por evento, mesmo que o job seja reenfileirado depois de
 * concluído, que é o que o `jobId` sozinho não garante (ele só vale enquanto o job existe).
 */
export function processadorDeTeste(valkey: Redis) {
  return async (job: Job): Promise<string> => {
    const { ms, chave, eventoId, tenantVisto } = job.data as {
      ms?: number
      chave?: string
      eventoId?: string
      tenantVisto?: string
    }
    await new Promise((r) => setTimeout(r, ms ?? 0))
    if (!chave) return 'sem-chave'
    if (eventoId) {
      const primeiro = await valkey.set(`${chave}:evento:${eventoId}`, '1', 'EX', 3600, 'NX')
      if (!primeiro) return 'duplicado'
    }
    await valkey.set(chave, job.id ?? 'sem-id', 'EX', 300)
    await valkey.incr(`${chave}:n`)
    if (tenantVisto) await valkey.set(`${chave}:tenant`, tenantVisto, 'EX', 300)
    return 'ok'
  }
}

export interface JobDeNotificacao {
  tenantId: string
  eventoId: string
  membroId: string
  tipo: string
  titulo: string
  mensagem?: string | null
  link?: string | null
}

/**
 * Grava a notificação no tenant do evento. Idempotente: o id da notificação é o id do evento, então
 * o mesmo evento reenfileirado depois de o job concluído sumir do Valkey (o `jobId` só protege
 * enquanto o job existe) não cria uma segunda notificação.
 */
export function processadorDeNotificacao(banco: Conexao) {
  return async (job: Job<JobDeNotificacao>): Promise<'criada' | 'duplicada'> => {
    const d = job.data
    return banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${d.tenantId}, true)`)
      const linhas = await tx.execute(sql`
        INSERT INTO notificacoes (id, tenant_id, membro_id, tipo, titulo, mensagem, link)
        VALUES (${d.eventoId}, ${d.tenantId}, ${d.membroId}, ${d.tipo}, ${d.titulo}, ${d.mensagem ?? null}, ${d.link ?? null})
        ON CONFLICT (id) DO NOTHING
        RETURNING id`)
      return linhas.length > 0 ? 'criada' : 'duplicada'
    })
  }
}

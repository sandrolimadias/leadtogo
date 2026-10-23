import type { Queue } from 'bullmq'

export interface JobDeVarredura {
  tenantId: string
  anexoId: string
  eventoId: string
}

/** Tentativas e espera entre elas: o clamd pode estar atualizando as assinaturas ou ainda subindo. */
export const TENTATIVAS_DA_VARREDURA = 10
export const ESPERA_DA_VARREDURA_MS = 30_000

export function enfileirarVarredura(fila: Queue, job: JobDeVarredura): Promise<unknown> {
  return fila.add('varrer', job, {
    // mesmo formato dos demais eventos do outbox (`jobIdDoEvento`): reentrega não duplica
    jobId: `evento-${job.eventoId}`,
    attempts: TENTATIVAS_DA_VARREDURA,
    backoff: { type: 'exponential', delay: ESPERA_DA_VARREDURA_MS },
  })
}

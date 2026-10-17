import type { Queue } from 'bullmq'

/** Job da fila `geocodificacao` para UMA empresa (automática: empresa nova ou endereço alterado). */
export interface JobDeGeocodificacaoDaEmpresa {
  tipo: 'empresa'
  tenantId: string
  empresaId: string
  /** O evento do outbox que originou o job (compõe o id: reentrega não duplica) */
  eventoId: string
}

/** Job da fila `geocodificacao` para UM bloco de um lote (por cidade ou região). */
export interface JobDeGeocodificacaoDoLote {
  tipo: 'lote'
  tenantId: string
  loteId: string
  /** O que originou a cadeia de blocos (evento do Iniciar ou da varredura); parte do id */
  raiz: string
  bloco: number
}

export type JobDeGeocodificacao = JobDeGeocodificacaoDaEmpresa | JobDeGeocodificacaoDoLote

export const idDoJobDaEmpresa = (j: JobDeGeocodificacaoDaEmpresa): string => `geo-e-${j.eventoId}`
export const idDoBlocoDoLote = (j: JobDeGeocodificacaoDoLote): string =>
  `geo-l-${j.loteId}-${j.raiz}-${j.bloco}`

/** Uma empresa; indisponibilidade dos provedores repete com espera de 1 minuto, até 5 vezes. */
export function enfileirarEmpresa(
  fila: Pick<Queue, 'add'>,
  job: JobDeGeocodificacaoDaEmpresa,
): Promise<unknown> {
  return fila.add('empresa', job, {
    jobId: idDoJobDaEmpresa(job),
    attempts: 5,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: true,
    removeOnFail: { age: 14 * 24 * 3600 },
  })
}

export function enfileirarBlocoDoLote(
  fila: Pick<Queue, 'add'>,
  job: JobDeGeocodificacaoDoLote,
  atrasoMs = 0,
): Promise<unknown> {
  return fila.add('lote', job, {
    jobId: idDoBlocoDoLote(job),
    ...(atrasoMs > 0 ? { delay: Math.ceil(atrasoMs) } : {}),
    attempts: 3,
    backoff: { type: 'fixed', delay: 30_000 },
    removeOnComplete: true,
    removeOnFail: { age: 14 * 24 * 3600 },
  })
}

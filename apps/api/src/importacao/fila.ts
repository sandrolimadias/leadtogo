import type { Queue } from 'bullmq'

/** Dados de um job da fila `importacao`: UM bloco do lote (não o lote inteiro). */
export interface JobDeImportacao {
  tenantId: string
  importacaoId: string
  /** O que originou a cadeia de blocos (id do evento do Iniciar, ou o da varredura); parte do id do job */
  raiz: string
  /** Número do bloco dentro da cadeia, a partir de 0 */
  bloco: number
}

/**
 * Id determinístico do bloco: a mesma cadeia e o mesmo número nunca viram dois jobs enquanto o
 * primeiro existe. É o que impede o relay (reentrega do evento) e a varredura de duplicar o trabalho.
 */
export const idDoBloco = (j: JobDeImportacao): string =>
  `imp-${j.importacaoId}-${j.raiz}-${j.bloco}`

/** Id da raiz de uma cadeia aberta pela varredura: uma por lote e por janela de 2 minutos. */
export const raizDaVarredura = (agora: number): string => `v${Math.floor(agora / 120_000)}`

/**
 * Enfileira um bloco. Um erro inesperado repete o bloco (a execução só mexe nas linhas pendentes);
 * o concluído sai da fila na hora, e o id volta a ficar livre.
 */
export function enfileirarBloco(
  fila: Pick<Queue, 'add'>,
  job: JobDeImportacao,
  atrasoMs = 0,
): Promise<unknown> {
  return fila.add('bloco', job, {
    jobId: idDoBloco(job),
    ...(atrasoMs > 0 ? { delay: Math.ceil(atrasoMs) } : {}),
    attempts: 3,
    backoff: { type: 'fixed', delay: 30_000 },
    removeOnComplete: true,
    removeOnFail: { age: 14 * 24 * 3600 },
  })
}

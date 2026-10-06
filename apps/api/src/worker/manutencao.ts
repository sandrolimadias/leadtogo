import type { Conexao } from '@leadtogo/db'
import type { Job } from 'bullmq'
import type { Logger } from 'pino'

import { FILAS } from './filas.js'
import type { WorkerFilas } from './worker-filas.service.js'

/** Tarefa agendada: o `id` do agendador do BullMQ é único, então reexecutar o registro não duplica nada. */
export interface Agendador {
  id: string
  tarefa: 'particoes' | 'limpar-convites' | 'limpar-outbox' | (string & {})
  /** Cron (UTC) ou intervalo em ms (só os testes usam intervalo) */
  quando: { pattern: string } | { every: number }
}

/**
 * Jobs agendados em produção. Os agendadores do BullMQ (`upsertJobScheduler`) vivem no Valkey: com
 * dois workers no ar, cada horário gera UM job, que só um deles pega. O horário é UTC.
 */
export const AGENDADORES: readonly Agendador[] = [
  // Todo dia 1º, 03:00: garante a partição do mês e as dos 12 meses seguintes
  { id: 'auditoria-particoes', tarefa: 'particoes', quando: { pattern: '0 3 1 * *' } },
  // Todo dia: convites cancelados/vencidos há mais de 30 dias e eventos entregues há mais de 14
  { id: 'limpeza-convites', tarefa: 'limpar-convites', quando: { pattern: '0 4 * * *' } },
  { id: 'limpeza-outbox', tarefa: 'limpar-outbox', quando: { pattern: '15 4 * * *' } },
]

const TAMANHO_DO_LOTE = 500
/** Teto de lotes por execução: a limpeza nunca prende o worker (o resto fica para o dia seguinte). */
const MAX_LOTES = 20

export async function registrarAgendadores(
  filas: WorkerFilas,
  agendadores: readonly Agendador[] = AGENDADORES,
): Promise<void> {
  const fila = filas.fila(FILAS.manutencao)
  for (const a of agendadores) {
    const repeticao =
      'pattern' in a.quando ? { pattern: a.quando.pattern, tz: 'UTC' } : { every: a.quando.every }
    await fila.upsertJobScheduler(a.id, repeticao, {
      name: a.tarefa,
      data: {},
      opts: { removeOnComplete: { age: 86_400 }, removeOnFail: { age: 14 * 86_400 } },
    })
  }
}

/** Ao subir, garante já as partições (não espera o dia 1º): a função é idempotente e usa lock. */
export async function garantirParticoesNaPartida(filas: WorkerFilas): Promise<void> {
  const dia = new Date().toISOString().slice(0, 10)
  await filas.fila(FILAS.manutencao).add('particoes', {}, { jobId: `particoes-partida-${dia}` })
}

async function emLotes(
  banco: Conexao,
  funcao: 'app_limpar_convites' | 'app_limpar_outbox',
): Promise<number> {
  let total = 0
  for (let i = 0; i < MAX_LOTES; i++) {
    const [linha] = await banco.cliente.unsafe<{ n: number }[]>(
      `SELECT ${funcao}(${TAMANHO_DO_LOTE}) AS n`,
    )
    const apagados = Number(linha?.n ?? 0)
    total += apagados
    if (apagados < TAMANHO_DO_LOTE) break
  }
  return total
}

export function processadorDeManutencao(banco: Conexao, log: Logger) {
  return async (job: Job): Promise<{ tarefa: string; resultado: number }> => {
    let resultado: number
    switch (job.name) {
      case 'particoes': {
        const [linha] = await banco.cliente<
          { n: number }[]
        >`SELECT app_manter_particoes_auditoria(12) AS n`
        resultado = Number(linha?.n ?? 0)
        break
      }
      case 'limpar-convites':
        resultado = await emLotes(banco, 'app_limpar_convites')
        break
      case 'limpar-outbox':
        resultado = await emLotes(banco, 'app_limpar_outbox')
        break
      default:
        throw new Error(`tarefa de manutenção desconhecida: ${job.name}`)
    }
    log.info({ tarefa: job.name, resultado }, 'manutenção concluída')
    return { tarefa: job.name, resultado }
  }
}

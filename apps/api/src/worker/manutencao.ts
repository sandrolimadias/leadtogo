import { type Conexao, sql } from '@leadtogo/db'
import type { Job } from 'bullmq'
import type { Logger } from 'pino'

import { varrerImportacoesParadas } from '../importacao/varredura.js'
import { avisarChavesAVencer } from '../integracoes/vencimento-chaves.js'
import { agendarEnvioDoAviso, EVENTO_ENVIAR_AVISO } from '../portal/notificar-aviso.js'
import { agendarNotificacaoDeEvento } from '../portal/notificar-evento.js'
import { type EnviadorDePush, enviarPushesPendentes } from '../portal/push.js'
import { FILAS } from './filas.js'
import type { WorkerFilas } from './worker-filas.service.js'

/** Tarefa agendada: o `id` do agendador do BullMQ é único, então reexecutar o registro não duplica nada. */
export interface Agendador {
  id: string
  tarefa:
    | 'particoes'
    | 'limpar-convites'
    | 'limpar-outbox'
    | 'varrer-importacoes'
    | 'publicar-agendadas'
    | 'lembrar-eventos'
    | 'enviar-avisos'
    | 'enviar-pushes'
    | 'avisar-chaves'
    | (string & {})
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
  // A cada minuto: reenfileira o lote de importação em andamento que parou de andar
  { id: 'varredura-importacoes', tarefa: 'varrer-importacoes', quando: { every: 60_000 } },
  // A cada minuto: publica as publicações do portal agendadas que já venceram (em todas as empresas)
  { id: 'publicar-agendadas', tarefa: 'publicar-agendadas', quando: { every: 60_000 } },
  // A cada 5 minutos: avisa quem está confirmado nos eventos que começam em até 24 horas (uma vez por evento)
  { id: 'lembrar-eventos', tarefa: 'lembrar-eventos', quando: { every: 300_000 } },
  // A cada minuto: entrega os avisos do portal agendados que já venceram (em todas as empresas)
  { id: 'enviar-avisos', tarefa: 'enviar-avisos', quando: { every: 60_000 } },
  // A cada minuto: envia os pushes que já podem sair (os que esperaram o fim do horário de silêncio)
  { id: 'enviar-pushes', tarefa: 'enviar-pushes', quando: { every: 60_000 } },
  // Todo dia, 11:00 UTC (08:00 em Brasília): avisa as chaves de API que vencem em até 15 dias e no último dia
  { id: 'avisar-chaves', tarefa: 'avisar-chaves', quando: { pattern: '0 11 * * *' } },
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

/**
 * Lembrete de 24 horas: acha (em todas as empresas) os eventos publicados que começam em até 24 horas e ainda sem
 * lembrete, e para cada um, dentro da empresa dele, marca o lembrete e grava o evento do outbox que avisa os
 * confirmados. A marca e o evento saem na mesma transação: se falhar, o evento é achado de novo na próxima rodada.
 */
async function lembrarEventos(banco: Conexao): Promise<number> {
  const achados = await banco.cliente<{ id: string; tenant_id: string }[]>`
    SELECT id, tenant_id FROM app_eventos_a_lembrar()`
  let lembrados = 0
  for (const { id, tenant_id: tenantId } of achados) {
    const feito = await banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      const marcado = await tx.execute(sql`
        UPDATE eventos SET lembrete_enviado_em = now(), atualizado_em = now()
        WHERE id = ${id} AND lembrete_enviado_em IS NULL AND situacao = 'publicado' RETURNING id`)
      if (marcado.length === 0) return false
      await agendarNotificacaoDeEvento(tx, tenantId, { tipo: 'lembrete', eventoId: id })
      return true
    })
    if (feito) lembrados += 1
  }
  return lembrados
}

/**
 * Avisos agendados que chegaram na hora: para cada um, dentro da empresa dele, grava o evento do outbox que faz a
 * entrega (se ainda não houver um na fila). A entrega em si é idempotente pela situação do aviso.
 */
async function enviarAvisosVencidos(banco: Conexao): Promise<number> {
  const achados = await banco.cliente<{ id: string; tenant_id: string }[]>`
    SELECT id, tenant_id FROM app_avisos_a_enviar()`
  let enfileirados = 0
  for (const { id, tenant_id: tenantId } of achados) {
    const feito = await banco.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
      const [existe] = await tx.execute(sql`
        SELECT 1 FROM eventos_outbox WHERE tipo = ${EVENTO_ENVIAR_AVISO} AND entidade_id = ${id}`)
      if (existe) return false
      await agendarEnvioDoAviso(tx, tenantId, id)
      return true
    })
    if (feito) enfileirados += 1
  }
  return enfileirados
}

export function processadorDeManutencao(
  banco: Conexao,
  log: Logger,
  filas?: WorkerFilas,
  /** Quem envia o push (nulo = push desligado: o job não faz nada) */
  enviadorDePush: EnviadorDePush | null = null,
) {
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
      case 'publicar-agendadas': {
        const [linha] = await banco.cliente<{ n: number }[]>`SELECT app_publicar_agendadas() AS n`
        resultado = Number(linha?.n ?? 0)
        break
      }
      case 'lembrar-eventos':
        resultado = await lembrarEventos(banco)
        break
      case 'enviar-avisos':
        resultado = await enviarAvisosVencidos(banco)
        break
      case 'enviar-pushes':
        resultado = await enviarPushesPendentes(banco, enviadorDePush, log)
        break
      case 'avisar-chaves':
        resultado = await avisarChavesAVencer(banco)
        break
      case 'varrer-importacoes':
        if (!filas) throw new Error('varredura de importações sem acesso às filas')
        resultado = await varrerImportacoesParadas({ banco, fila: filas.fila(FILAS.importacao) })
        break
      default:
        throw new Error(`tarefa de manutenção desconhecida: ${job.name}`)
    }
    log.info({ tarefa: job.name, resultado }, 'manutenção concluída')
    return { tarefa: job.name, resultado }
  }
}

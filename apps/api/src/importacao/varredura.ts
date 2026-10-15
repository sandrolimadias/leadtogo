import type { Conexao } from '@leadtogo/db'
import type { Queue } from 'bullmq'

import { enfileirarBloco, type JobDeImportacao, raizDaVarredura } from './fila.js'

/** Sem progresso e sem espera programada por mais de tanto tempo, o lote é considerado parado. */
export const MARGEM_DE_LOTE_PARADO_MIN = 2

/**
 * Rede de segurança dos blocos: reenfileira o lote em andamento que parou de andar (worker que caiu,
 * Valkey que perdeu o job, encadeamento que falhou). Quem espera de propósito (intervalo ou Receita
 * fora do ar) não conta como parado até passar a espera mais a margem; isso é decidido no banco
 * (`app_importacoes_paradas`). O id do job é determinístico (lote + janela de 2 min), e um lote que
 * ainda tem job vivo na fila é deixado em paz; dois blocos juntos seriam inofensivos de todo modo
 * (a gravação por linha é idempotente).
 */
export async function varrerImportacoesParadas(deps: {
  banco: Conexao
  fila: Pick<Queue, 'add' | 'getJobs'>
  agora?: () => number
}): Promise<number> {
  const paradas = await deps.banco.cliente<{ tenant_id: string; id: string }[]>`
    SELECT tenant_id, id FROM app_importacoes_paradas(${MARGEM_DE_LOTE_PARADO_MIN})`
  if (paradas.length === 0) return 0
  const vivos = new Set(
    (await deps.fila.getJobs(['waiting', 'active', 'delayed', 'prioritized'])).map(
      (j) => (j.data as JobDeImportacao).importacaoId,
    ),
  )
  const raiz = raizDaVarredura((deps.agora ?? Date.now)())
  let reenfileiradas = 0
  for (const l of paradas) {
    if (vivos.has(l.id)) continue
    await enfileirarBloco(deps.fila, {
      tenantId: l.tenant_id,
      importacaoId: l.id,
      raiz,
      bloco: 0,
    })
    reenfileiradas++
  }
  return reenfileiradas
}

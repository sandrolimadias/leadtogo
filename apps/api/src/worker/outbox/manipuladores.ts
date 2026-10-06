import { sql } from '@leadtogo/db'

import type { Configuracao } from '../../configuracao/configuracao.js'
import { FILAS } from '../filas.js'
import type { ManipuladorDeEvento } from './relay.js'

/** Id do job de um evento: o BullMQ descarta repetição enquanto o job existir. */
export const jobIdDoEvento = (eventoId: string) => `evento-${eventoId}`

/**
 * Tipos de evento entregues pelo relay. Os de produção (e-mail, notificação) entram nos commits
 * seguintes; os `teste.*` só existem fora de produção e servem aos testes do relay.
 */
export function manipuladoresPadrao(config: Configuracao): Record<string, ManipuladorDeEvento> {
  const manipuladores: Record<string, ManipuladorDeEvento> = {}
  if (config.NODE_ENV !== 'production') {
    manipuladores['teste.evento'] = async (evento, { tx, filas }) => {
      // Registra o tenant que o banco enxergava ao entregar: prova que o evento rodou no tenant dele
      const [cfg] = await tx.execute<{ tenant: string }>(
        sql`SELECT current_setting('app.tenant_id', true) AS tenant`,
      )
      const dados = (evento.payload ?? {}) as Record<string, unknown>
      await filas
        .fila(FILAS.teste)
        .add(
          'espera',
          { ...dados, eventoId: evento.id, tenantVisto: cfg?.tenant },
          { jobId: jobIdDoEvento(evento.id) },
        )
    }
    manipuladores['teste.falha'] = () =>
      Promise.reject(new Error('falha de teste ao entregar o evento'))
  }
  return manipuladores
}

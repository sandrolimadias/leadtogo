import { describe, expect, it } from 'vitest'

import { configuracaoDeTeste } from '../testes/app-teste.js'
import { manipuladoresPadrao } from '../worker/outbox/manipuladores.js'
import { EnviadorSmtp } from '../email/enviador.js'
import type { EventoDoOutbox } from '../worker/outbox/relay.js'
import type { WorkerFilas } from '../worker/worker-filas.service.js'
import { EVENTO_GEOCODIFICAR_EMPRESA } from './evento.js'
import { EVENTO_EXECUTAR_LOTE_GEO } from './evento-lote.js'
import { idDoBlocoDoLote, idDoJobDaEmpresa } from './fila.js'

const evento = (tipo: string, payload: Record<string, unknown>): EventoDoOutbox =>
  ({ id: '0198a000-0000-7000-8000-000000000001', tenantId: 't-1', tipo, payload }) as never

function filasFalsas() {
  const jobs: { nome: string; dados: unknown; jobId: string | undefined; fila: string }[] = []
  const filas = {
    fila: (nome: string) => ({
      add: (n: string, dados: unknown, opcoes?: { jobId?: string }) => {
        jobs.push({ nome: n, dados, jobId: opcoes?.jobId, fila: nome })
        return Promise.resolve()
      },
    }),
  } as unknown as WorkerFilas
  return { filas, jobs }
}

const enviador = {} as EnviadorSmtp

describe('eventos de geolocalização no relay do outbox', () => {
  it('empresa.geocodificar vira um job de empresa na fila geocodificacao (id do evento)', async () => {
    const config = configuracaoDeTeste({ GEO_AUTOMATICA: 'true' })
    const { filas, jobs } = filasFalsas()
    const m = manipuladoresPadrao(config, enviador)[EVENTO_GEOCODIFICAR_EMPRESA]
    await m?.(evento(EVENTO_GEOCODIFICAR_EMPRESA, { empresaId: 'e-1' }), { tx: {} as never, filas })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      fila: 'geocodificacao',
      nome: 'empresa',
      dados: { tipo: 'empresa', tenantId: 't-1', empresaId: 'e-1' },
      jobId: idDoJobDaEmpresa({
        tipo: 'empresa',
        tenantId: 't-1',
        empresaId: 'e-1',
        eventoId: '0198a000-0000-7000-8000-000000000001',
      }),
    })
  })

  it('com GEO_AUTOMATICA desligada o evento é entregue sem enfileirar nada', async () => {
    const config = configuracaoDeTeste({ GEO_AUTOMATICA: 'false' })
    const { filas, jobs } = filasFalsas()
    const m = manipuladoresPadrao(config, enviador)[EVENTO_GEOCODIFICAR_EMPRESA]
    await m?.(evento(EVENTO_GEOCODIFICAR_EMPRESA, { empresaId: 'e-1' }), { tx: {} as never, filas })
    expect(jobs).toHaveLength(0)
  })

  it('geo.lote.executar abre a cadeia de blocos do lote (mesmo desligada a automática)', async () => {
    const config = configuracaoDeTeste({ GEO_AUTOMATICA: 'false' })
    const { filas, jobs } = filasFalsas()
    const m = manipuladoresPadrao(config, enviador)[EVENTO_EXECUTAR_LOTE_GEO]
    await m?.(evento(EVENTO_EXECUTAR_LOTE_GEO, { loteId: 'l-1' }), { tx: {} as never, filas })
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      fila: 'geocodificacao',
      nome: 'lote',
      dados: { tipo: 'lote', tenantId: 't-1', loteId: 'l-1', bloco: 0 },
      jobId: idDoBlocoDoLote({
        tipo: 'lote',
        tenantId: 't-1',
        loteId: 'l-1',
        raiz: '0198a000-0000-7000-8000-000000000001',
        bloco: 0,
      }),
    })
  })
})

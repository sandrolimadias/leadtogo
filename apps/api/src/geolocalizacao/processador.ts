import type { Conexao } from '@leadtogo/db'
import type { Job } from 'bullmq'
import type { Logger } from 'pino'

import type { Configuracao } from '../configuracao/configuracao.js'
import type { WorkerFilas } from '../worker/worker-filas.service.js'
import { geocodificarEmpresa, type ServicosDeGeo } from './geocodificar-empresa.js'
import { ExecutorDoLoteGeo } from './executor-lote.js'
import { enfileirarBlocoDoLote, type JobDeGeocodificacao } from './fila.js'
import { FILAS } from '../worker/filas.js'
import { ProvedorCep } from './provedor-cep.js'
import { ProvedorNominatim } from './provedor-nominatim.js'

/** Os provedores da configuração (sem `NOMINATIM_URL` não há Nominatim). */
export function servicosDeGeoDaConfiguracao(config: Configuracao, banco: Conexao): ServicosDeGeo {
  return {
    banco,
    nominatim: config.NOMINATIM_URL
      ? new ProvedorNominatim(config.NOMINATIM_URL, config.NOMINATIM_TIMEOUT_MS)
      : null,
    cep: new ProvedorCep(config.VIACEP_URL, config.BRASILAPI_CEP_URL, config.CEP_TIMEOUT_MS),
    diasDeCache: config.GEO_CACHE_DIAS,
  }
}

/**
 * Consumidor da fila `geocodificacao`. Job de empresa: geocodifica uma e, se os provedores estiverem
 * fora do ar, lança erro para o BullMQ repetir com espera progressiva (a empresa não é marcada).
 */
export function processadorDaGeocodificacao(deps: {
  config: Configuracao
  banco: Conexao
  filas: WorkerFilas
  log: Logger
}) {
  const svc = servicosDeGeoDaConfiguracao(deps.config, deps.banco)
  const executor = new ExecutorDoLoteGeo(svc, () => deps.filas.estaEncerrando)
  return async (job: Job): Promise<string> => {
    const dados = job.data as JobDeGeocodificacao
    if (dados.tipo === 'empresa') {
      const desfecho = await geocodificarEmpresa(svc, {
        tenantId: dados.tenantId,
        empresaId: dados.empresaId,
        acionadoPor: null,
        loteId: null,
        refazerComCoordenada: false,
      })
      if (desfecho === 'indisponivel') {
        throw new Error('provedores de geocodificação indisponíveis; nova tentativa')
      }
      return desfecho
    }
    const desfecho = await executor.executarBloco(dados.tenantId, dados.loteId)
    // Ainda há empresas (ou o SIGTERM interrompeu): agenda o próximo bloco, que outro worker pega
    if (desfecho === 'continua' || desfecho === 'interrompido') {
      await enfileirarBlocoDoLote(deps.filas.fila(FILAS.geocodificacao), {
        ...dados,
        bloco: dados.bloco + 1,
      })
    }
    return desfecho
  }
}

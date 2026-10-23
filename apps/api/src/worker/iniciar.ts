import type { Server } from 'node:http'

import type { Conexao } from '@leadtogo/db'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'

import type { Configuracao } from '../configuracao/configuracao.js'
import { FILAS } from './filas.js'
import {
  garantirParticoesNaPartida,
  processadorDeManutencao,
  registrarAgendadores,
} from './manutencao.js'
import { manipuladoresPadrao } from './outbox/manipuladores.js'
import { RelayDoOutbox } from './outbox/relay.js'
import { ExecutorDaImportacao } from '../importacao/executor.js'
import { enfileirarBloco, type JobDeImportacao } from '../importacao/fila.js'
import { EnviadorSmtp } from '../email/enviador.js'
import { criarClienteS3 } from '../infra/s3.js'
import { processadorDeAntivirus } from '../chamados/processador-antivirus.js'
import { processadorDaGeocodificacao } from '../geolocalizacao/processador.js'
import { ReceitaService, provedoresPadrao } from '../receita/receita.service.js'
import { chavesDe } from '../seguranca/cifra.js'
import {
  limparDadosDoJobFalho,
  processadorDeEmail,
  processadorDeNotificacao,
  processadorDeTeste,
} from './processadores.js'
import { iniciarServidorDeSaude, type EstadoDoWorker } from './saude.js'
import { WorkerFilas } from './worker-filas.service.js'

export interface WorkerEmExecucao {
  filas: WorkerFilas
  servidorDeSaude: Server
  estado: EstadoDoWorker
  /** Encerra de forma graciosa e devolve se tudo terminou dentro do prazo. */
  encerrar: () => Promise<boolean>
}

/**
 * Sobe os consumidores das filas e o healthcheck. O encerramento (SIGTERM) está em `worker.ts`;
 * aqui fica só a montagem, para os testes poderem subir o worker em processo.
 */
export async function iniciarWorker(deps: {
  config: Configuracao
  banco: Conexao
  valkey: Redis
  log: Logger
}): Promise<WorkerEmExecucao> {
  const { config, banco, valkey, log } = deps
  const filas = new WorkerFilas(config, log)
  // Marca compartilhada: o relay roda em UM worker por ciclo, então a idade do último ciclo vale para todos
  const chaveDoCiclo = `${config.FILA_PREFIXO}:relay:ultimo-ciclo`
  const estado: EstadoDoWorker = {
    relayAtivo: true,
    ultimoCicloEm: async () => {
      const v = await valkey.get(chaveDoCiclo)
      return v === null ? null : Number(v)
    },
  }

  // Fila de teste: só fora de produção (encerramento gracioso, retenção e idempotência são testados com ela)
  if (config.NODE_ENV !== 'production') filas.consumir(FILAS.teste, processadorDeTeste(valkey))

  // E-mails de identidade: conteúdo cifrado no job; reenvio e espera progressiva definidos ao enfileirar
  const enviador = new EnviadorSmtp(config, log)
  if (config.TOKEN_ENCRYPTION_KEY) {
    const consumidor = filas.consumir(FILAS.email, processadorDeEmail(enviador, chavesDe(config)))
    consumidor.on('failed', (job) => void limparDadosDoJobFalho(job).catch(() => undefined))
  } else {
    log.warn('TOKEN_ENCRYPTION_KEY ausente: a fila de e-mail não será consumida')
  }

  filas.consumir(FILAS.notificacoes, processadorDeNotificacao(banco))

  // Antivírus dos anexos dos chamados (Fase 2): poucos por vez, o clamd é pesado
  const armazenamento = criarClienteS3(config)
  filas.consumir(
    FILAS.antivirus,
    processadorDeAntivirus({ config, banco, s3: armazenamento, log }),
    { concorrencia: 2 },
  )

  // Manutenção agendada (partições da auditoria e limpezas), via funções SECURITY DEFINER do banco
  filas.consumir(FILAS.manutencao, processadorDeManutencao(banco, log, filas), { concorrencia: 1 })
  await registrarAgendadores(filas)
  await garantirParticoesNaPartida(filas)

  // Relay do outbox: um agendador do BullMQ (`upsertJobScheduler`, idempotente) gera um ciclo a cada
  // 2 s; só UM worker pega cada ciclo, então vários workers juntos não duplicam o trabalho
  const receita = new ReceitaService(banco, provedoresPadrao(config))
  // Importação de planilha: uma por vez no processo (a Receita não tem SLA e o intervalo é por consulta)
  const executor = new ExecutorDaImportacao({
    banco,
    receita,
    log,
    // SIGTERM: termina a linha em curso e fecha o bloco, em vez de segurar o deploy até o prazo
    deveParar: () => filas.estaEncerrando,
  })
  filas.consumir(
    FILAS.importacao,
    async (job) => {
      const dados = job.data as JobDeImportacao
      const { desfecho, proximoEmMs } = await executor.executarBloco(
        dados.tenantId,
        dados.importacaoId,
      )
      // Ainda há linhas: agenda o próximo bloco (no SIGTERM também, o próximo worker o pega). Se este
      // processo cair antes de agendar, a varredura de lote parado reenfileira.
      if (desfecho === 'continua' || desfecho === 'interrompida') {
        await enfileirarBloco(
          filas.fila(FILAS.importacao),
          { ...dados, bloco: dados.bloco + 1 },
          proximoEmMs,
        )
      }
      return desfecho
    },
    { concorrencia: 1 },
  )

  // Geocodificação (G1): concorrência baixa e limite por minuto, para não disputar a CPU da VPS
  filas.consumir(FILAS.geocodificacao, processadorDaGeocodificacao({ config, banco, filas, log }), {
    concorrencia: config.GEO_CONCORRENCIA,
    limitador: { max: config.GEO_LIMITE_POR_MINUTO, duration: 60_000 },
  })

  const relay = new RelayDoOutbox({
    banco,
    filas,
    log,
    manipuladores: manipuladoresPadrao(config, enviador, {
      banco,
      servico: receita,
    }),
  })
  filas.consumir(
    FILAS.outbox,
    async () => {
      const r = await relay.rodarCiclo()
      await valkey.set(chaveDoCiclo, String(Date.now()), 'EX', 300)
      return r
    },
    { concorrencia: 1 },
  )
  await filas.fila(FILAS.outbox).upsertJobScheduler(
    'relay',
    { every: config.OUTBOX_INTERVALO_MS },
    {
      name: 'ciclo',
      data: {},
      opts: { removeOnComplete: { count: 5 }, removeOnFail: { count: 20 } },
    },
  )

  const servidorDeSaude = await iniciarServidorDeSaude(config.WORKER_SAUDE_PORTA, {
    filas,
    valkey,
    banco,
    estado,
    log,
  })
  log.info({ porta: config.WORKER_SAUDE_PORTA, versao: config.APP_VERSION }, 'worker iniciado')

  return {
    filas,
    servidorDeSaude,
    estado,
    encerrar: async () => {
      servidorDeSaude.close()
      const terminou = await filas.encerrar(config.WORKER_ENCERRAMENTO_S * 1000)
      armazenamento.destroy()
      return terminou
    },
  }
}

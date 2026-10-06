import { type Job, Queue, Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import type { Logger } from 'pino'

import type { Configuracao } from '../configuracao/configuracao.js'
import { type NomeDaFila, criarConexaoDeFila, opcoesDeFila, opcoesDeWorker } from './filas.js'

export type Processador = (job: Job) => Promise<unknown>

/**
 * Filas e workers do processo worker. Cada fila tem a sua conexão, e `encerrar` para de pegar
 * jobs novos e espera os em andamento até o prazo (o resto volta para a fila pelo mecanismo de
 * jobs parados do BullMQ).
 */
export class WorkerFilas {
  private readonly conexoes: Redis[] = []
  private readonly filas = new Map<NomeDaFila, Queue>()
  private readonly workers = new Map<NomeDaFila, Worker>()
  private encerrando = false

  constructor(
    private readonly config: Configuracao,
    private readonly log: Logger,
  ) {}

  private conexao(): Redis {
    const c = criarConexaoDeFila(this.config)
    this.conexoes.push(c)
    return c
  }

  fila(nome: NomeDaFila): Queue {
    let fila = this.filas.get(nome)
    if (!fila) {
      fila = new Queue(nome, opcoesDeFila(this.config, this.conexao()))
      this.filas.set(nome, fila)
    }
    return fila
  }

  /** Registra o consumidor de uma fila. */
  consumir(nome: NomeDaFila, processador: Processador): Worker {
    const worker = new Worker(nome, processador, opcoesDeWorker(this.config, this.conexao()))
    worker.on('error', (erro) =>
      this.log.error({ fila: nome, erro: erro.message }, 'erro no worker'),
    )
    worker.on('failed', (job, erro) =>
      this.log.warn(
        { fila: nome, job: job?.id, tentativa: job?.attemptsMade, erro: erro.message },
        'job falhou',
      ),
    )
    this.workers.set(nome, worker)
    return worker
  }

  /** Todos os consumidores estão rodando (e não pausados nem fechando)? */
  consumidoresVivos(): boolean {
    if (this.encerrando || this.workers.size === 0) return false
    return [...this.workers.values()].every((w) => w.isRunning() && !w.isPaused())
  }

  get estaEncerrando(): boolean {
    return this.encerrando
  }

  /**
   * Para de pegar jobs novos e espera os em andamento por até `prazoMs`. Devolve `true` se tudo
   * terminou no prazo. Se o prazo estourar, NÃO espera mais (o `close()` do BullMQ reaproveita a
   * mesma promessa e esperaria o job inteiro): desconecta e devolve `false`; o job que sobrou perde
   * o lock (`FILA_LOCK_MS`) e volta para a fila, onde outro worker o conclui.
   */
  async encerrar(prazoMs: number): Promise<boolean> {
    this.encerrando = true
    const fechamentos = Promise.all([...this.workers.values()].map((w) => w.close()))
    let timer: NodeJS.Timeout | undefined
    const limite = new Promise<'prazo'>((resolver) => {
      timer = setTimeout(() => resolver('prazo'), prazoMs)
    })
    const resultado = await Promise.race([fechamentos.then(() => 'ok' as const), limite])
    clearTimeout(timer)
    if (resultado === 'prazo') {
      this.log.warn(
        { prazoMs },
        'prazo de encerramento esgotado: saindo; o job em andamento volta para a fila',
      )
      for (const c of this.conexoes) c.disconnect()
      void fechamentos.catch(() => undefined)
      return false
    }
    await Promise.allSettled([...this.filas.values()].map((f) => f.close()))
    for (const c of this.conexoes) c.disconnect()
    return true
  }
}

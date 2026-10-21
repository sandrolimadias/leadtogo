import type { Conexao } from '@leadtogo/db'
import { Inject, Injectable, Logger } from '@nestjs/common'
import type { Redis } from 'ioredis'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'
import { BANCO, VALKEY } from '../infra/infra.module.js'
import { MonitorDoPool } from '../infra/monitor-do-pool.js'
import { FILAS, type NomeDaFila } from '../worker/filas.js'

/** Filas reais (a `teste` só existe fora de produção). */
export const FILAS_MONITORADAS: NomeDaFila[] = [
  FILAS.manutencao,
  FILAS.notificacoes,
  FILAS.email,
  FILAS.outbox,
]

/** Ocupação do pool do banco (pico dos últimos 5 minutos) acima da qual o /health/alertas acusa. */
export const LIMITE_DO_POOL_PCT = 80

/** Falhas finais mais antigas que isto já não acendem o alerta (a retenção do BullMQ é de 14 dias). */
export const JANELA_JOBS_FALHOS_MS = 24 * 3600 * 1000

export interface RelatorioAlertas {
  /** `ok`; `alerta` (há o que tratar); `erro` (não foi possível verificar: também é motivo de alerta) */
  status: 'ok' | 'alerta' | 'erro'
  /** Eventos do outbox que esgotaram as tentativas e ainda não foram tratados (null = não verificou) */
  eventos_esgotados: number | null
  /** Falhas finais de jobs nas últimas 24 h, por fila (null = não verificou) */
  jobs_falhos: Record<string, number | null>
  jobs_falhos_total: number
  /** A partir deste total o status vira `alerta` */
  limite_jobs_falhos: number
  /** Acima de `limite_pct` o status vira `alerta` (a API está perto de ficar sem conexão do banco) */
  pool_banco: { pico_pct: number; limite_pct: number }
}

/** Só contagens: nenhum dado de empresa, usuário, evento ou job. */
@Injectable()
export class AlertasService {
  private readonly log = new Logger(AlertasService.name)

  constructor(
    @Inject(CONFIGURACAO) private readonly config: Configuracao,
    @Inject(BANCO) private readonly banco: Conexao,
    @Inject(VALKEY) private readonly valkey: Redis,
    private readonly pool: MonitorDoPool,
  ) {}

  async verificar(agora = Date.now()): Promise<RelatorioAlertas> {
    const eventos = await this.eventosEsgotados()
    const jobs: Record<string, number | null> = {}
    for (const fila of FILAS_MONITORADAS) jobs[fila] = await this.jobsFalhos(fila, agora)

    const valores = Object.values(jobs)
    const total = valores.reduce<number>((soma, n) => soma + (n ?? 0), 0)
    const limite = this.config.ALERTAS_LIMITE_JOBS_FALHOS
    const naoVerificou = eventos === null || valores.includes(null)
    const poolPct = this.pool.picoPct()
    const status = naoVerificou
      ? 'erro'
      : (eventos ?? 0) > 0 || total >= limite || poolPct > LIMITE_DO_POOL_PCT
        ? 'alerta'
        : 'ok'
    return {
      status,
      eventos_esgotados: eventos,
      jobs_falhos: jobs,
      jobs_falhos_total: total,
      limite_jobs_falhos: limite,
      pool_banco: { pico_pct: poolPct, limite_pct: LIMITE_DO_POOL_PCT },
    }
  }

  /** Função SECURITY DEFINER: conta o outbox de todas as empresas sem papel que ignore o RLS. */
  private async eventosEsgotados(): Promise<number | null> {
    try {
      const [linha] = await this.banco.cliente<
        { n: string }[]
      >`SELECT app_contar_eventos_esgotados()::text AS n`
      return Number(linha?.n)
    } catch (erro) {
      this.log.warn(
        `/health/alertas: outbox: ${erro instanceof Error ? erro.message : String(erro)}`,
      )
      return null
    }
  }

  /**
   * Falhas FINAIS (sem tentativas sobrando) nas últimas 24 h. O BullMQ guarda os jobs falhos num
   * conjunto ordenado `<prefixo>:<fila>:failed` cuja nota é o `finishedOn` (ms); contar a faixa
   * das últimas 24 h é uma operação só, sem carregar nenhum job (e os testes cobrem essa chave).
   */
  private async jobsFalhos(fila: NomeDaFila, agora: number): Promise<number | null> {
    try {
      return await this.valkey.zcount(
        `${this.config.FILA_PREFIXO}:${fila}:failed`,
        agora - JANELA_JOBS_FALHOS_MS,
        '+inf',
      )
    } catch (erro) {
      this.log.warn(
        `/health/alertas: fila ${fila}: ${erro instanceof Error ? erro.message : String(erro)}`,
      )
      return null
    }
  }
}

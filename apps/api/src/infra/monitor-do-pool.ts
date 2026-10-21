import { Inject, Injectable } from '@nestjs/common'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'

const MINUTO_MS = 60_000

/**
 * Quantas transações da API estão em andamento (inclui as que esperam uma conexão do pool) e o pico de cada
 * minuto, para o alerta de "pool acima de 80%" do /health/alertas. O Uptime Kuma consulta de 5 em 5 minutos:
 * o pico da janela pega uma saturação que já passou, o valor instantâneo não pegaria. Só contagem em
 * memória; nada de dado de empresa.
 */
@Injectable()
export class MonitorDoPool {
  private ativas = 0
  private readonly picos = new Map<number, number>()

  constructor(@Inject(CONFIGURACAO) private readonly config: Configuracao) {}

  get tamanho(): number {
    return this.config.DB_POOL_MAX
  }

  get emAndamento(): number {
    return this.ativas
  }

  iniciar(agora = Date.now()): void {
    this.ativas += 1
    const minuto = Math.floor(agora / MINUTO_MS)
    this.picos.set(minuto, Math.max(this.picos.get(minuto) ?? 0, this.ativas))
    for (const m of this.picos.keys()) if (m < minuto - 15) this.picos.delete(m)
  }

  terminar(): void {
    this.ativas = Math.max(0, this.ativas - 1)
  }

  /** Maior ocupação (em % do pool) nos últimos `janelaMin` minutos, contando o minuto em curso. */
  picoPct(janelaMin = 5, agora = Date.now()): number {
    const minuto = Math.floor(agora / MINUTO_MS)
    let pico = this.ativas
    for (const [m, n] of this.picos) if (m > minuto - janelaMin) pico = Math.max(pico, n)
    return Math.round((pico / this.tamanho) * 100)
  }
}

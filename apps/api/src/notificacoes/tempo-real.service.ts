import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common'
import { Redis } from 'ioredis'

import type { Configuracao } from '../configuracao/configuracao.js'
import { CONFIGURACAO } from '../configuracao/configuracao.module.js'

type Ouvinte = (mensagem: string) => void

/**
 * Tempo real do sino (SSE): o worker publica no Valkey (`<prefixo>:notif:<empresa>:<membro>`) depois de gravar a
 * notificação, e esta API repassa só às conexões daquele membro daquela empresa. Uma única conexão de
 * assinatura por processo (criada na primeira conexão SSE), com um mapa canal → ouvintes.
 */
@Injectable()
export class TempoRealDoSino implements OnModuleDestroy {
  private assinante: Redis | null = null
  private readonly ouvintes = new Map<string, Set<Ouvinte>>()

  constructor(@Inject(CONFIGURACAO) private readonly config: Configuracao) {}

  private obterAssinante(): Redis {
    if (this.assinante) return this.assinante
    const a = new Redis(this.config.REDIS_URL, { maxRetriesPerRequest: null })
    a.on('error', () => undefined)
    a.on('message', (canal: string, mensagem: string) => {
      for (const ouvinte of this.ouvintes.get(canal) ?? []) ouvinte(mensagem)
    })
    // Depois de reconectar, o ioredis reassina os canais sozinho
    this.assinante = a
    return a
  }

  canal(tenantId: string, membroId: string): string {
    return `${this.config.FILA_PREFIXO}:notif:${tenantId}:${membroId}`
  }

  /** Começa a ouvir; devolve a função que para (e solta a assinatura do canal sem ouvintes). */
  async ouvir(tenantId: string, membroId: string, ouvinte: Ouvinte): Promise<() => void> {
    const canal = this.canal(tenantId, membroId)
    const conjunto = this.ouvintes.get(canal) ?? new Set<Ouvinte>()
    const primeiro = conjunto.size === 0
    conjunto.add(ouvinte)
    this.ouvintes.set(canal, conjunto)
    if (primeiro) await this.obterAssinante().subscribe(canal)
    return () => {
      conjunto.delete(ouvinte)
      if (conjunto.size === 0) {
        this.ouvintes.delete(canal)
        void this.assinante?.unsubscribe(canal).catch(() => undefined)
      }
    }
  }

  /** Quantas conexões estão ouvindo (diagnóstico e testes). */
  get conexoes(): number {
    let n = 0
    for (const c of this.ouvintes.values()) n += c.size
    return n
  }

  onModuleDestroy(): void {
    this.ouvintes.clear()
    this.assinante?.disconnect()
    this.assinante = null
  }
}

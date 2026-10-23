import { Logger } from '@nestjs/common'
import type { Coordenada } from '@leadtogo/shared'

/** O VROOM ou o OSRM não responderam (sem conexão, tempo esgotado, erro): a ordem sai em linha reta. */
export class RoteirizadorIndisponivel extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'RoteirizadorIndisponivel'
  }
}

export interface TrechoPelasRuas {
  distanciaM: number
  duracaoS: number
}

export interface TrajetoPelasRuas {
  /** `pontos[i] → pontos[i + 1]` */
  trechos: TrechoPelasRuas[]
  /** `[longitude, latitude]`, simplificado para o mapa */
  linha: [number, number][]
}

/** O que as rotas pedem ao serviço de rotas (a pilha leadtogo-rotas; nos testes, um falso). */
export interface Roteirizador {
  /**
   * A ordem mais curta das paradas (índices), com um veículo: sai de `inicio` (ou de onde for melhor, sem
   * ele) e volta para `fim` quando há fim. Sem janela de horário nem almoço (decisão do G0).
   */
  ordenar(
    inicio: Coordenada | null,
    paradas: readonly Coordenada[],
    fim: Coordenada | null,
  ): Promise<number[]>
  /** Distância e tempo de cada trecho, na ordem dada, e o desenho pelas ruas. */
  trajeto(pontos: readonly Coordenada[]): Promise<TrajetoPelasRuas>
}

const lonLat = (c: Coordenada): [number, number] => [c.longitude, c.latitude]

/**
 * VROOM (ordem) + OSRM (trechos e desenho) da pilha `leadtogo-rotas` (scripts/geo/rotas-compose.yml), na
 * rede interna. Cada chamada tem o prazo `ROTA_TEMPO_LIMITE_S`; qualquer falha vira `RoteirizadorIndisponivel`.
 * Medido na VPS (23/10/2026): 30 paradas em 0,11 s no pior caso.
 */
export class RoteirizadorVroomOsrm implements Roteirizador {
  private readonly log = new Logger('Roteirizador')

  constructor(
    private readonly vroomUrl: string,
    private readonly osrmUrl: string,
    private readonly tempoMs: number,
    private readonly buscar: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  private async json(servico: string, url: string, init?: RequestInit): Promise<unknown> {
    let resposta: Response
    try {
      resposta = await this.buscar(url, { ...init, signal: AbortSignal.timeout(this.tempoMs) })
    } catch (erro) {
      const motivo =
        erro instanceof Error && erro.name === 'TimeoutError' ? 'tempo esgotado' : 'sem conexão'
      this.log.warn(`${servico}: ${motivo}`)
      throw new RoteirizadorIndisponivel(`${servico}: ${motivo}`)
    }
    if (!resposta.ok) {
      this.log.warn(`${servico}: HTTP ${resposta.status}`)
      throw new RoteirizadorIndisponivel(`${servico}: HTTP ${resposta.status}`)
    }
    try {
      return await resposta.json()
    } catch {
      throw new RoteirizadorIndisponivel(`${servico}: resposta inválida`)
    }
  }

  async ordenar(
    inicio: Coordenada | null,
    paradas: readonly Coordenada[],
    fim: Coordenada | null,
  ): Promise<number[]> {
    const corpo = {
      vehicles: [
        {
          id: 1,
          profile: 'car',
          ...(inicio ? { start: lonLat(inicio) } : {}),
          ...(fim ? { end: lonLat(fim) } : {}),
        },
      ],
      jobs: paradas.map((p, i) => ({ id: i + 1, location: lonLat(p) })),
    }
    const r = (await this.json('VROOM', `${this.vroomUrl.replace(/\/+$/, '')}/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    })) as {
      code?: number
      unassigned?: unknown[]
      routes?: { steps?: { type: string; job?: number }[] }[]
    }
    const passos = r.routes?.[0]?.steps ?? []
    const ordem = passos.filter((s) => s.type === 'job' && s.job).map((s) => (s.job as number) - 1)
    // uma parada sem rota (fora das ruas do estado, ilha...) ou resposta torta: não vale meia ordem
    if (r.code !== 0 || (r.unassigned?.length ?? 0) > 0 || ordem.length !== paradas.length) {
      this.log.warn(`VROOM: ${r.unassigned?.length ?? 0} parada(s) sem rota`)
      throw new RoteirizadorIndisponivel('VROOM: parada sem rota')
    }
    return ordem
  }

  async trajeto(pontos: readonly Coordenada[]): Promise<TrajetoPelasRuas> {
    if (pontos.length < 2) return { trechos: [], linha: [] }
    const coordenadas = pontos.map((p) => `${p.longitude},${p.latitude}`).join(';')
    const url = `${this.osrmUrl.replace(/\/+$/, '')}/route/v1/driving/${coordenadas}?overview=simplified&geometries=geojson&steps=false`
    const r = (await this.json('OSRM', url)) as {
      code?: string
      routes?: {
        legs?: { distance: number; duration: number }[]
        geometry?: { coordinates?: [number, number][] }
      }[]
    }
    const rota = r.routes?.[0]
    if (r.code !== 'Ok' || !rota?.legs || rota.legs.length !== pontos.length - 1) {
      throw new RoteirizadorIndisponivel(`OSRM: ${r.code ?? 'resposta inválida'}`)
    }
    return {
      trechos: rota.legs.map((l) => ({
        distanciaM: Math.round(l.distance),
        duracaoS: Math.round(l.duration),
      })),
      linha: rota.geometry?.coordinates ?? [],
    }
  }
}

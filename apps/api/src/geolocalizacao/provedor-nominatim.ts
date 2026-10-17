import { Logger } from '@nestjs/common'
import { chaveDaRua, chaveDoBairro } from '@leadtogo/shared'

export type NivelNominatim = 'numero' | 'rua' | 'cidade'

export interface AcheiNoNominatim {
  nivel: NivelNominatim
  latitude: number
  longitude: number
  /** Resumo do que o Nominatim respondeu (vai para o registro de consulta) */
  resumo: Record<string, unknown>
}

export class NominatimIndisponivel extends Error {
  constructor(motivo: string) {
    super(motivo)
    this.name = 'NominatimIndisponivel'
  }
}

interface ItemDoNominatim {
  lat: string
  lon: string
  category?: string
  type?: string
  address?: Record<string, string>
}

/** Os campos de município que o Nominatim usa, do mais específico ao mais geral. */
const CAMPOS_DE_MUNICIPIO = ['city', 'town', 'village', 'municipality', 'city_district']

/**
 * Nominatim local (só o ES; docs/plano_geolocalizacao.md). Só roda em produção: sem `NOMINATIM_URL`
 * o provedor não existe e a cascata segue só com o CNEFE e o CEP. A consulta é a que o G0 mediu:
 * "rua sem tipo, número, município" (sem UF; "- ES" e "Espírito Santo" derrubam a busca).
 */
export class ProvedorNominatim {
  private readonly log = new Logger('Nominatim')

  constructor(
    private readonly urlBase: string,
    private readonly tempoMs: number,
    private readonly buscar: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}

  /** O texto da consulta (normalizado), que também é a chave do cache. */
  static consulta(rua: string, numero: number | null, municipioNome: string): string {
    const chave = chaveDaRua(rua)
    return [chave, numero !== null ? String(numero) : null, municipioNome.trim()]
      .filter(Boolean)
      .join(', ')
  }

  /**
   * Procura e classifica o primeiro resultado do MUNICÍPIO pedido: com número da porta, só a rua
   * ou só a localidade. Resultado de outro município (a mesma rua existe em muitos) é descartado.
   */
  async buscarEndereco(consulta: string, municipioNome: string): Promise<AcheiNoNominatim | null> {
    const url = new URL(`${this.urlBase.replace(/\/+$/, '')}/search`)
    url.search = new URLSearchParams({
      q: consulta,
      format: 'jsonv2',
      addressdetails: '1',
      limit: '5',
      countrycodes: 'br',
    }).toString()
    let resposta: Response
    try {
      resposta = await this.buscar(url, {
        headers: { accept: 'application/json', 'user-agent': 'Leadtogo/1.0 (+geocodificacao)' },
        signal: AbortSignal.timeout(this.tempoMs),
      })
    } catch (erro) {
      const motivo =
        erro instanceof Error && erro.name === 'TimeoutError' ? 'tempo esgotado' : 'sem conexão'
      this.log.warn(`Nominatim: ${motivo}`)
      throw new NominatimIndisponivel(motivo)
    }
    if (!resposta.ok) {
      this.log.warn(`Nominatim: HTTP ${resposta.status}`)
      throw new NominatimIndisponivel(`HTTP ${resposta.status}`)
    }
    let itens: unknown
    try {
      itens = await resposta.json()
    } catch {
      throw new NominatimIndisponivel('resposta que não é JSON')
    }
    if (!Array.isArray(itens)) return null
    const alvo = chaveDoBairro(municipioNome)
    for (const bruto of itens as ItemDoNominatim[]) {
      const a = bruto.address ?? {}
      const municipioDoItem = CAMPOS_DE_MUNICIPIO.map((c) => a[c]).find(Boolean)
      if (municipioDoItem && chaveDoBairro(municipioDoItem) !== alvo) continue
      const latitude = Number.parseFloat(bruto.lat)
      const longitude = Number.parseFloat(bruto.lon)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue
      const nivel: NivelNominatim = a['house_number']
        ? 'numero'
        : a['road'] || bruto.category === 'highway'
          ? 'rua'
          : 'cidade'
      return {
        nivel,
        latitude,
        longitude,
        resumo: {
          nivel,
          rua: a['road'] ?? null,
          numero: a['house_number'] ?? null,
          municipio: municipioDoItem ?? null,
        },
      }
    }
    return null
  }
}

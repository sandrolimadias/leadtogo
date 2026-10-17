import { sql } from '@leadtogo/db'
import {
  cepNormalizado,
  chaveDaRua,
  escolherNaRua,
  type LinhaCnefe,
  type PontoCnefe,
  semelhanca,
} from '@leadtogo/shared'

import type { Transacao } from '../acesso/contexto-tenant.service.js'

/** Só lê; vale uma transação de qualquer tenant (as tabelas de `referencia_geo` não têm RLS). */
export type LeitorSql = Pick<Transacao, 'execute'>

/** Semelhança mínima (edição) entre a rua pedida e a rua do CNEFE quando o nome não bate exato. */
const SEMELHANCA_MINIMA = 0.86

export interface RuaDoCnefe {
  /** Chave normalizada da rua que foi achada (a pedida, ou a mais parecida) */
  chave: string
  exata: boolean
}

/**
 * Consulta ao CNEFE 2022 carregado em `referencia_geo` (docs/plano_geolocalizacao.md): é a camada 1,
 * 3 e 5 da cascata. A rua é achada pela chave normalizada; se o nome não bate exato, vale a mais
 * parecida do município (`pg_trgm` para os candidatos e distância de edição para decidir).
 */
export class ProvedorCnefe {
  constructor(private readonly db: LeitorSql) {}

  /** O CNEFE está carregado? Sem ele a camada é pulada (e o relatório avisa). */
  async carregado(): Promise<boolean> {
    const l = await this.db.execute<{ existe: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM referencia_geo.cnefe_logradouros LIMIT 1) AS existe`,
    )
    return l[0]?.existe === true
  }

  async acharRua(municipioCodigo: number, ruaOriginal: string): Promise<RuaDoCnefe | null> {
    const chave = chaveDaRua(ruaOriginal)
    if (!chave) return null
    const exata = await this.db.execute(
      sql`SELECT 1 FROM referencia_geo.cnefe_logradouros
          WHERE municipio_codigo = ${municipioCodigo} AND logradouro_normalizado = ${chave} LIMIT 1`,
    )
    if (exata.length > 0) return { chave, exata: true }
    const candidatas = await this.db.execute<{ logradouro_normalizado: string }>(
      sql`SELECT logradouro_normalizado FROM referencia_geo.cnefe_logradouros
          WHERE municipio_codigo = ${municipioCodigo} AND logradouro_normalizado % ${chave}
          ORDER BY similarity(logradouro_normalizado, ${chave}) DESC LIMIT 5`,
    )
    let melhor: { chave: string; s: number } | null = null
    for (const c of candidatas) {
      const s = semelhanca(chave, c.logradouro_normalizado)
      if (s >= SEMELHANCA_MINIMA && (!melhor || s > melhor.s)) {
        melhor = { chave: c.logradouro_normalizado, s }
      }
    }
    return melhor ? { chave: melhor.chave, exata: false } : null
  }

  /** Decide o ponto na rua (número exato, interpolado ou centro da rua). */
  async buscarNaRua(
    municipioCodigo: number,
    rua: RuaDoCnefe,
    numero: number | null,
    cep: string | null,
  ): Promise<PontoCnefe | null> {
    const linhas = await this.db.execute<{
      latitude: number
      longitude: number
      numero: number | null
      nivel_coordenada: number
      cep: string | null
    }>(
      sql`SELECT latitude, longitude, numero, nivel_coordenada, cep
          FROM referencia_geo.cnefe_enderecos
          WHERE municipio_codigo = ${municipioCodigo} AND logradouro_normalizado = ${rua.chave}`,
    )
    const cnefe: LinhaCnefe[] = linhas.map((l) => ({
      latitude: l.latitude,
      longitude: l.longitude,
      numero: l.numero,
      nivelCoordenada: l.nivel_coordenada,
      cep: l.cep,
    }))
    return escolherNaRua(cnefe, numero, cep)
  }

  /** Centro dos endereços do CEP (camada "CEP"); nulo se o CEP não está no CNEFE. */
  async centroDoCep(cep: string | null): Promise<{ latitude: number; longitude: number } | null> {
    const limpo = cepNormalizado(cep)
    if (!limpo) return null
    const l = await this.db.execute<{ latitude: number | null; longitude: number | null }>(
      sql`SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY latitude) AS latitude,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY longitude) AS longitude
          FROM referencia_geo.cnefe_enderecos WHERE cep = ${limpo}`,
    )
    const r = l[0]
    return r && r.latitude !== null && r.longitude !== null
      ? { latitude: r.latitude, longitude: r.longitude }
      : null
  }

  /** Centro do município (`municipios.localizacao`, do centroide da malha do IBGE). */
  async centroDoMunicipio(
    municipioCodigo: number,
  ): Promise<{ latitude: number; longitude: number } | null> {
    const l = await this.db.execute<{ latitude: number | null; longitude: number | null }>(
      sql`SELECT ST_Y(localizacao) AS latitude, ST_X(localizacao) AS longitude
          FROM municipios WHERE codigo_ibge = ${municipioCodigo}`,
    )
    const r = l[0]
    return r && r.latitude !== null && r.longitude !== null
      ? { latitude: r.latitude, longitude: r.longitude }
      : null
  }
}

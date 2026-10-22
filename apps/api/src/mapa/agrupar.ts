import { type AgrupamentoDoMapa, chaveDoBairroNoMapa, rotuloDoBairro } from '@leadtogo/shared'

/** Uma linha da consulta agregada: um município (ou um município + bairro DIGITADO, antes de normalizar). */
export interface LinhaAgregada {
  municipio: number | null
  nomeDoMunicipio: string | null
  /** O bairro como está no cadastro (só no nível bairro) */
  bairro?: string | null
  total: number
  somaLat: number
  somaLon: number
  oeste: number
  sul: number
  leste: number
  norte: number
}

const arredondar = (v: number) => Math.round(v * 1e6) / 1e6

function paraAgrupamento(
  id: string,
  rotulo: string,
  l: Pick<LinhaAgregada, 'total' | 'somaLat' | 'somaLon' | 'oeste' | 'sul' | 'leste' | 'norte'>,
): AgrupamentoDoMapa {
  return {
    id,
    rotulo,
    total: l.total,
    latitude: arredondar(l.somaLat / l.total),
    longitude: arredondar(l.somaLon / l.total),
    oeste: arredondar(l.oeste),
    sul: arredondar(l.sul),
    leste: arredondar(l.leste),
    norte: arredondar(l.norte),
  }
}

/** Uma bolha por município. */
export function bolhasDeMunicipio(linhas: LinhaAgregada[]): AgrupamentoDoMapa[] {
  return linhas
    .filter((l) => l.total > 0)
    .map((l) => paraAgrupamento(String(l.municipio ?? 0), l.nomeDoMunicipio ?? 'Sem município', l))
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
}

/**
 * Uma bolha por bairro DENTRO do município: as linhas vêm por bairro digitado ("Jd. Camburi", "JARDIM CAMBURÍ"...)
 * e aqui se juntam pela chave normalizada. O nome mostrado é o da chave em caixa de título. A posição é o centro
 * das empresas (média ponderada, pelas somas) e a caixa é a união das caixas.
 */
export function bolhasDeBairro(linhas: LinhaAgregada[]): AgrupamentoDoMapa[] {
  const grupos = new Map<string, LinhaAgregada>()
  for (const l of linhas) {
    if (l.total <= 0) continue
    const chave = chaveDoBairroNoMapa(l.bairro)
    const id = `${l.municipio ?? 0}:${chave}`
    const g = grupos.get(id)
    if (!g) {
      grupos.set(id, { ...l })
      continue
    }
    g.total += l.total
    g.somaLat += l.somaLat
    g.somaLon += l.somaLon
    g.oeste = Math.min(g.oeste, l.oeste)
    g.sul = Math.min(g.sul, l.sul)
    g.leste = Math.max(g.leste, l.leste)
    g.norte = Math.max(g.norte, l.norte)
  }
  return [...grupos.entries()]
    .map(([id, g]) => {
      const chave = id.slice(id.indexOf(':') + 1)
      return paraAgrupamento(id, rotuloDoBairro(chave), g)
    })
    .sort((a, b) => b.total - a.total || a.id.localeCompare(b.id))
}

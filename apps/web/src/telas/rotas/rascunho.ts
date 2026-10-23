import type { PontoDePartida, Rota } from '@leadtogo/api-client'
import {
  type Coordenada,
  type PartidaDeRota,
  type SalvarRotaEntrada,
  trechoEstimado,
} from '@leadtogo/shared'

import type { RotaDesenhada } from '@/components/mapa/mapa-base'

/** Uma parada no editor: o mínimo para listar, desenhar e salvar. */
export interface ParadaDoRascunho {
  empresaId: string
  nome: string
  /** "Centro · Vitória" */
  detalhe: string | null
  latitude: number
  longitude: number
  precisao: 'exata' | 'aproximada' | null
  /** Já visitada ou pulada (G4b): não sai da rota */
  resolvida: boolean
  /** Trecho que chega à parada, como veio da API (nulo até salvar) */
  distanciaTrechoM: number | null
}

/** A rota no editor (nova ou já salva), antes de salvar. */
export interface RascunhoDeRota {
  id: string | null
  codigo: number | null
  nome: string
  data: string
  /** Vazio = a própria pessoa */
  responsavelId: string
  partida: PartidaDeRota
  pontoPartidaId: string | null
  voltarAoInicio: boolean
  minutosPorVisita: number
  paradas: ParadaDoRascunho[]
  /** A ordem atual veio de "Otimizar ordem" (e nada mudou desde então) */
  otimizada: boolean
  /** Algo mudou desde o último salvamento */
  alterado: boolean
}

export const hojeLocal = (agora = new Date()): string =>
  agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

const detalheDe = (bairro: string | null, cidade: string | null) =>
  [bairro, cidade].filter(Boolean).join(' · ') || null

/** Rota nova: hoje, a própria pessoa, o ponto padrão (se houver) e os minutos da empresa. */
export function novoRascunho(entrada: {
  responsavelId: string
  minutosPorVisita: number
  pontos: readonly PontoDePartida[]
  agora?: Date
}): RascunhoDeRota {
  const padrao = entrada.pontos.find((p) => p.padrao && p.ativo)
  const data = hojeLocal(entrada.agora)
  const [ano, mes, dia] = data.split('-')
  return {
    id: null,
    codigo: null,
    nome: `Rota de ${dia}/${mes}/${ano}`,
    data,
    responsavelId: entrada.responsavelId,
    partida: 'posicao_atual',
    pontoPartidaId: padrao?.id ?? null,
    voltarAoInicio: true,
    minutosPorVisita: entrada.minutosPorVisita,
    paradas: [],
    otimizada: false,
    alterado: false,
  }
}

export function rascunhoDaRota(r: Rota): RascunhoDeRota {
  return {
    id: r.id,
    codigo: r.codigo,
    nome: r.nome,
    data: r.data,
    responsavelId: r.responsavel.id,
    partida: r.partida,
    pontoPartidaId: r.pontoPartida?.id ?? null,
    voltarAoInicio: r.voltarAoInicio,
    minutosPorVisita: r.minutosPorVisita,
    paradas: r.paradas
      .filter((p) => p.latitude !== null && p.longitude !== null)
      .map((p) => ({
        empresaId: p.empresaId,
        nome: p.empresaNome,
        detalhe: detalheDe(p.bairro, p.cidade),
        latitude: p.latitude as number,
        longitude: p.longitude as number,
        precisao: p.precisao,
        resolvida: p.situacao !== 'pendente',
        distanciaTrechoM: p.distanciaTrechoM,
      })),
    otimizada: false,
    alterado: false,
  }
}

export interface ResultadoDeAdicionar {
  rascunho: RascunhoDeRota
  adicionadas: number
  jaNaRota: number
  excedentes: number
}

/** Acrescenta no fim o que cabe (até `max`); as que já estão e as que passam do limite só contam. */
export function adicionarParadas(
  r: RascunhoDeRota,
  novas: readonly Omit<ParadaDoRascunho, 'resolvida' | 'distanciaTrechoM'>[],
  max: number,
): ResultadoDeAdicionar {
  const naRota = new Set(r.paradas.map((p) => p.empresaId))
  const unicas = novas.filter((n, i) => novas.findIndex((x) => x.empresaId === n.empresaId) === i)
  const fora = unicas.filter((n) => !naRota.has(n.empresaId))
  const vagas = Math.max(0, max - r.paradas.length)
  const entram = fora.slice(0, vagas)
  return {
    rascunho:
      entram.length === 0
        ? r
        : {
            ...r,
            paradas: [
              ...r.paradas,
              ...entram.map((p) => ({ ...p, resolvida: false, distanciaTrechoM: null })),
            ],
            otimizada: false,
            alterado: true,
          },
    adicionadas: entram.length,
    jaNaRota: unicas.length - fora.length,
    excedentes: fora.length - entram.length,
  }
}

export function moverParada(r: RascunhoDeRota, de: number, para: number): RascunhoDeRota {
  if (de === para || de < 0 || para < 0 || de >= r.paradas.length || para >= r.paradas.length)
    return r
  const paradas = [...r.paradas]
  const [p] = paradas.splice(de, 1)
  if (!p) return r
  paradas.splice(para, 0, p)
  return { ...r, paradas, otimizada: false, alterado: true }
}

export function removerParada(r: RascunhoDeRota, empresaId: string): RascunhoDeRota {
  const p = r.paradas.find((x) => x.empresaId === empresaId)
  if (!p || p.resolvida) return r
  return {
    ...r,
    paradas: r.paradas.filter((x) => x.empresaId !== empresaId),
    otimizada: false,
    alterado: true,
  }
}

/** Põe as paradas na ordem dada (a resposta de "Otimizar ordem"). */
export function aplicarOrdem(r: RascunhoDeRota, empresaIds: readonly string[]): RascunhoDeRota {
  const porId = new Map(r.paradas.map((p) => [p.empresaId, p]))
  const paradas = empresaIds.map((id) => porId.get(id)).filter((p): p is ParadaDoRascunho => !!p)
  if (paradas.length !== r.paradas.length) return r
  return { ...r, paradas, otimizada: true, alterado: true }
}

export function entradaDoRascunho(
  r: RascunhoDeRota,
  posicaoAtual: Coordenada | null,
): SalvarRotaEntrada {
  return {
    nome: r.nome.trim(),
    data: r.data,
    // vazio = a própria pessoa (a API decide quem é)
    ...(r.responsavelId ? { responsavelId: r.responsavelId } : {}),
    partida: r.partida,
    pontoPartidaId: r.partida === 'ponto' ? r.pontoPartidaId : null,
    voltarAoInicio: r.voltarAoInicio,
    minutosPorVisita: r.minutosPorVisita,
    empresaIds: r.paradas.map((p) => p.empresaId),
    ...(r.partida === 'posicao_atual' && posicaoAtual ? { posicaoAtual } : {}),
    otimizada: r.otimizada,
  }
}

/**
 * O que o mapa desenha: o trajeto pelas ruas da rota salva (se o rascunho não mudou) ou, senão, a
 * sequência em linha reta a partir do ponto de partida.
 */
export function desenhoDoRascunho(
  r: RascunhoDeRota,
  inicio: Coordenada | null,
  trajetoSalvo: [number, number][] | null,
): RotaDesenhada | null {
  if (r.paradas.length === 0) return null
  const paradas = r.paradas.map((p, i) => ({
    id: p.empresaId,
    latitude: p.latitude,
    longitude: p.longitude,
    numero: i + 1,
    resolvida: p.resolvida,
  }))
  if (trajetoSalvo && !r.alterado) return { linha: trajetoSalvo, emLinhaReta: false, paradas }
  const pontos = [
    ...(inicio ? [inicio] : []),
    ...r.paradas,
    ...(inicio && r.voltarAoInicio ? [inicio] : []),
  ]
  return {
    linha: pontos.map((p) => [p.longitude, p.latitude]),
    emLinhaReta: true,
    paradas,
  }
}

/** Totais estimados em linha reta, para o editor antes de salvar. */
export function totaisEmLinhaReta(
  r: RascunhoDeRota,
  inicio: Coordenada | null,
): { distanciaM: number; duracaoS: number } {
  const pontos = [
    ...(inicio ? [inicio] : []),
    ...r.paradas,
    ...(inicio && r.voltarAoInicio ? [inicio] : []),
  ]
  let distanciaM = 0
  let duracaoS = 0
  for (let i = 1; i < pontos.length; i++) {
    const t = trechoEstimado(pontos[i - 1] as Coordenada, pontos[i] as Coordenada)
    distanciaM += t.distanciaM
    duracaoS += t.duracaoS
  }
  return { distanciaM, duracaoS }
}

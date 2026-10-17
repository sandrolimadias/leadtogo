import {
  cepNormalizado,
  chaveDoBairro,
  faltasNoEndereco,
  numeroDePorta,
  textoDoEndereco,
} from '@leadtogo/shared'

import type { DadosDoCep } from './provedor-cep.js'
import type { AcheiNoNominatim } from './provedor-nominatim.js'
import { ProvedorNominatim } from './provedor-nominatim.js'
import type {
  ConsultaFeita,
  EnderecoParaGeocodificar,
  PosicaoGeo,
  ResultadoDaGeocodificacao,
} from './tipos.js'
import type { PontoCnefe } from '@leadtogo/shared'
import type { RuaDoCnefe } from './provedor-cnefe.js'

/** O que o geocodificador precisa de fora, para os testes trocarem por falsos. */
export interface DependenciasDaGeocodificacao {
  cnefe: {
    carregado(): Promise<boolean>
    acharRua(municipioCodigo: number, rua: string): Promise<RuaDoCnefe | null>
    buscarNaRua(
      municipioCodigo: number,
      rua: RuaDoCnefe,
      numero: number | null,
      cep: string | null,
    ): Promise<PontoCnefe | null>
    centroDoCep(cep: string | null): Promise<{ latitude: number; longitude: number } | null>
    centroDoMunicipio(
      municipioCodigo: number,
    ): Promise<{ latitude: number; longitude: number } | null>
  }
  /** Nulo fora de produção (sem `NOMINATIM_URL`) */
  nominatim: {
    buscarEndereco(consulta: string, municipioNome: string): Promise<AcheiNoNominatim | null>
  } | null
  cep: { consultar(cep: string): Promise<DadosDoCep | null> }
  /** Cache das consultas externas (Nominatim e CEP) em `geo_consultas`: devolve a resposta guardada */
  cache: {
    obter(provedor: 'nominatim' | 'cep', consulta: string): Promise<CacheDeConsulta | null>
  }
}

export interface CacheDeConsulta {
  resultado: 'achou' | 'nao_achou'
  /** A resposta resumida que foi guardada */
  resposta: Record<string, unknown> | null
  latitude: number | null
  longitude: number | null
}

/** A consulta externa falhou (rede/tempo): não decide nada e não vira "não achou". */
function indisponivel(e: unknown): boolean {
  return e instanceof Error && (e.name === 'NominatimIndisponivel' || e.name === 'CepIndisponivel')
}

/**
 * Cascata do G1 (docs/plano_geolocalizacao.md): para na primeira camada que acerta.
 *   1 CNEFE número exato → 2 Nominatim com número → 3 CNEFE interpolado → 4 Nominatim rua →
 *   5 CNEFE centro da rua → 6 CEP/cidade.
 * Antes: completa rua e bairro pelo CEP; se continuar incompleto, não vira pin (`a_confirmar`).
 * Não grava nada: devolve a posição e as consultas feitas para quem chamou gravar.
 */
export async function geocodificar(
  endereco: EnderecoParaGeocodificar,
  dep: DependenciasDaGeocodificacao,
): Promise<ResultadoDaGeocodificacao> {
  const consultas: ConsultaFeita[] = []
  let completouPeloCep = false
  let algumaFalha = false

  // ---- 1. Completar pelo CEP o que falta (rua, bairro, cidade). Só preenche; nunca sobrescreve.
  let rua = [endereco.tipoLogradouro, endereco.logradouro]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(' ')
  let bairro = endereco.bairro?.trim() ?? ''
  let municipioCodigo = endereco.municipioCodigo
  let municipioNome = endereco.municipioNome?.trim() ?? ''
  const cep = cepNormalizado(endereco.cep)

  const incompleto = () =>
    faltasNoEndereco({
      cep,
      logradouro: rua,
      numero: endereco.numero,
      bairro,
      municipioCodigo,
    })
  if (cep && incompleto().some((f) => f === 'logradouro' || f === 'bairro' || f === 'cidade')) {
    const dados = await consultarCep(cep, dep, consultas)
    if (dados === 'falhou') algumaFalha = true
    else if (dados) {
      if (!rua && dados.logradouro) {
        rua = dados.logradouro
        completouPeloCep = true
      }
      if (!bairro && dados.bairro) {
        bairro = dados.bairro
        completouPeloCep = true
      }
      if (!municipioCodigo && dados.municipioCodigo) {
        municipioCodigo = dados.municipioCodigo
        municipioNome = dados.cidade ?? municipioNome
        completouPeloCep = true
      }
    }
  }
  const faltas = incompleto()
  if (faltas.length > 0) {
    // Se faltou porque o CEP não pôde ser consultado (rede), tenta de novo depois, sem marcar a empresa
    if (algumaFalha && cep) return { situacao: 'indisponivel', consultas, completouPeloCep }
    return { situacao: 'a_confirmar', faltas, consultas, completouPeloCep }
  }
  // Daqui em diante há rua, número (ou S/N), bairro e município
  const codigo = municipioCodigo as number
  const numero = numeroDePorta(endereco.numero)
  const textoConsultado = textoDoEndereco(
    { cep, logradouro: rua, numero: endereco.numero, bairro, municipioCodigo: codigo },
    municipioNome || null,
  )

  const posicao = (p: Omit<PosicaoGeo, 'consultado'>): ResultadoDaGeocodificacao => ({
    situacao: 'posicionada',
    posicao: { ...p, consultado: textoConsultado },
    consultas,
    completouPeloCep,
  })

  // ---- 2. CNEFE: a rua e o ponto nela
  const temCnefe = await dep.cnefe.carregado()
  let pontoCnefe: PontoCnefe | null = null
  if (temCnefe) {
    const ruaCnefe = await dep.cnefe.acharRua(codigo, rua)
    if (ruaCnefe) {
      pontoCnefe = await dep.cnefe.buscarNaRua(codigo, ruaCnefe, numero, cep)
      consultas.push({
        provedor: 'cnefe',
        consulta: `${ruaCnefe.chave}${numero !== null ? `, ${numero}` : ''}, ${codigo}`,
        resultado: pontoCnefe ? 'achou' : 'nao_achou',
        precisao: pontoCnefe?.nivel === 'numero' && !pontoCnefe.ambiguo ? 'exata' : 'aproximada',
        aproximacao:
          pontoCnefe?.nivel === 'numero' && !pontoCnefe.ambiguo
            ? null
            : pontoCnefe?.nivel === 'numero_interpolado'
              ? 'interpolada'
              : 'rua',
        latitude: pontoCnefe?.latitude ?? null,
        longitude: pontoCnefe?.longitude ?? null,
        resposta: pontoCnefe
          ? { nivel: pontoCnefe.nivel, ambiguo: pontoCnefe.ambiguo, detalhe: pontoCnefe.detalhe }
          : null,
        doCache: false,
      })
    } else {
      consultas.push({
        provedor: 'cnefe',
        consulta: `${rua}, ${codigo}`,
        resultado: 'nao_achou',
        precisao: null,
        aproximacao: null,
        latitude: null,
        longitude: null,
        resposta: null,
        doCache: false,
      })
    }
  }

  // Camada 1: CNEFE com o número casado, sem ambiguidade
  if (pontoCnefe?.nivel === 'numero' && !pontoCnefe.ambiguo) {
    return posicao({
      latitude: pontoCnefe.latitude,
      longitude: pontoCnefe.longitude,
      precisao: 'exata',
      aproximacao: null,
      origem: 'cnefe',
      detalhe: pontoCnefe.detalhe,
    })
  }

  // Camadas 2 e 4 (Nominatim): uma só chamada serve às duas (número ou rua)
  let osm: AcheiNoNominatim | null = null
  if (dep.nominatim && municipioNome) {
    const consulta = ProvedorNominatim.consulta(rua, numero, municipioNome)
    const guardado = await dep.cache.obter('nominatim', consulta)
    if (guardado) {
      osm =
        guardado.resultado === 'achou' && guardado.latitude !== null && guardado.longitude !== null
          ? {
              nivel: (guardado.resposta?.['nivel'] as AcheiNoNominatim['nivel']) ?? 'rua',
              latitude: guardado.latitude,
              longitude: guardado.longitude,
              resumo: guardado.resposta ?? {},
            }
          : null
      consultas.push(consultaDoNominatim(consulta, osm, true))
    } else {
      try {
        osm = await dep.nominatim.buscarEndereco(consulta, municipioNome)
        consultas.push(consultaDoNominatim(consulta, osm, false))
      } catch (e) {
        if (!indisponivel(e)) throw e
        algumaFalha = true
        consultas.push({
          provedor: 'nominatim',
          consulta,
          resultado: 'erro',
          precisao: null,
          aproximacao: null,
          latitude: null,
          longitude: null,
          resposta: { erro: e instanceof Error ? e.message : 'falha' },
          doCache: false,
        })
      }
    }
  }
  // Camada 2: Nominatim com o número da porta
  if (osm?.nivel === 'numero') {
    return posicao({
      latitude: osm.latitude,
      longitude: osm.longitude,
      precisao: 'exata',
      aproximacao: null,
      origem: 'nominatim',
      detalhe: 'número da porta no OpenStreetMap',
    })
  }

  // Camada 3: CNEFE interpolado entre os vizinhos
  if (pontoCnefe?.nivel === 'numero_interpolado') {
    return posicao({
      latitude: pontoCnefe.latitude,
      longitude: pontoCnefe.longitude,
      precisao: 'aproximada',
      aproximacao: 'interpolada',
      origem: 'cnefe',
      detalhe: pontoCnefe.detalhe,
    })
  }

  // Camada 4: a rua no Nominatim
  if (osm?.nivel === 'rua') {
    return posicao({
      latitude: osm.latitude,
      longitude: osm.longitude,
      precisao: 'aproximada',
      aproximacao: 'rua',
      origem: 'nominatim',
      detalhe: 'rua no OpenStreetMap',
    })
  }

  // Camada 5: o centro da rua no CNEFE (inclui o número casado mas ambíguo entre bairros)
  if (pontoCnefe) {
    return posicao({
      latitude: pontoCnefe.latitude,
      longitude: pontoCnefe.longitude,
      precisao: 'aproximada',
      aproximacao: 'rua',
      origem: 'cnefe',
      detalhe: pontoCnefe.ambiguo
        ? 'a rua existe em mais de um bairro e o CEP não resolveu'
        : pontoCnefe.detalhe,
    })
  }

  // Camada 6: o centro do CEP e, por fim, o centro do município
  const doCep = temCnefe ? await dep.cnefe.centroDoCep(cep) : null
  if (doCep) {
    return posicao({
      ...doCep,
      precisao: 'aproximada',
      aproximacao: 'cep_cidade',
      origem: 'cep',
      detalhe: `centro do CEP ${cep}`,
    })
  }
  if (osm?.nivel === 'cidade') {
    return posicao({
      latitude: osm.latitude,
      longitude: osm.longitude,
      precisao: 'aproximada',
      aproximacao: 'cep_cidade',
      origem: 'nominatim',
      detalhe: `localidade ${chaveDoBairro(municipioNome)} no OpenStreetMap`,
    })
  }
  const doMunicipio = await dep.cnefe.centroDoMunicipio(codigo)
  if (doMunicipio) {
    return posicao({
      ...doMunicipio,
      precisao: 'aproximada',
      aproximacao: 'cep_cidade',
      origem: 'cep',
      detalhe: `centro do município ${municipioNome}`,
    })
  }
  // Nada achou. Se alguém falhou, tenta depois; senão, o endereço precisa de confirmação
  if (algumaFalha) return { situacao: 'indisponivel', consultas, completouPeloCep }
  return {
    situacao: 'a_confirmar',
    faltas: [],
    consultas,
    completouPeloCep,
  }
}

function consultaDoNominatim(
  consulta: string,
  achou: AcheiNoNominatim | null,
  doCache: boolean,
): ConsultaFeita {
  return {
    provedor: 'nominatim',
    consulta,
    resultado: achou ? 'achou' : 'nao_achou',
    precisao: achou?.nivel === 'numero' ? 'exata' : achou ? 'aproximada' : null,
    aproximacao:
      achou && achou.nivel !== 'numero' ? (achou.nivel === 'rua' ? 'rua' : 'cep_cidade') : null,
    latitude: achou?.latitude ?? null,
    longitude: achou?.longitude ?? null,
    resposta: achou?.resumo ?? null,
    doCache,
  }
}

/** Consulta o CEP (com cache) e registra. `'falhou'` = rede/tempo; `null` = CEP que não existe. */
async function consultarCep(
  cep: string,
  dep: DependenciasDaGeocodificacao,
  consultas: ConsultaFeita[],
): Promise<DadosDoCep | null | 'falhou'> {
  const guardado = await dep.cache.obter('cep', cep)
  if (guardado) {
    const r = guardado.resposta as DadosDoCep | null
    consultas.push({
      provedor: 'cep',
      consulta: cep,
      resultado: guardado.resultado,
      precisao: null,
      aproximacao: null,
      latitude: null,
      longitude: null,
      resposta: guardado.resposta,
      doCache: true,
    })
    return guardado.resultado === 'achou' ? r : null
  }
  try {
    const dados = await dep.cep.consultar(cep)
    consultas.push({
      provedor: 'cep',
      consulta: cep,
      resultado: dados ? 'achou' : 'nao_achou',
      precisao: null,
      aproximacao: null,
      latitude: null,
      longitude: null,
      resposta: dados ? { ...dados } : null,
      doCache: false,
    })
    return dados
  } catch (e) {
    if (!indisponivel(e)) throw e
    consultas.push({
      provedor: 'cep',
      consulta: cep,
      resultado: 'erro',
      precisao: null,
      aproximacao: null,
      latitude: null,
      longitude: null,
      resposta: { erro: e instanceof Error ? e.message : 'falha' },
      doCache: false,
    })
    return 'falhou'
  }
}

import type { PontoCnefe } from '@leadtogo/shared'
import { describe, expect, it } from 'vitest'

import { type DependenciasDaGeocodificacao, geocodificar } from './geocodificador.js'
import type { DadosDoCep } from './provedor-cep.js'
import type { AcheiNoNominatim } from './provedor-nominatim.js'
import type { EnderecoParaGeocodificar } from './tipos.js'

// Endereços FICTÍCIOS (rua e coordenadas inventadas): nenhum dado de cliente.
const ENDERECO: EnderecoParaGeocodificar = {
  cep: '29000-000',
  tipoLogradouro: 'Rua',
  logradouro: 'Fictícia',
  numero: '120',
  bairro: 'Bairro Teste',
  municipioCodigo: 3205309,
  municipioNome: 'Vitória',
}

const CENTRO = { latitude: -20.3, longitude: -40.3 }

interface Roteiro {
  cnefeCarregado?: boolean
  rua?: { chave: string; exata: boolean } | null
  ponto?: PontoCnefe | null
  centroCep?: typeof CENTRO | null
  centroMunicipio?: typeof CENTRO | null
  osm?: AcheiNoNominatim | null | 'falha'
  cep?: DadosDoCep | null | 'falha'
  semNominatim?: boolean
  cache?: Record<
    string,
    {
      resultado: 'achou' | 'nao_achou'
      resposta: Record<string, unknown> | null
      latitude: number | null
      longitude: number | null
    }
  >
}

function montar(r: Roteiro) {
  const chamadas: string[] = []
  const dep: DependenciasDaGeocodificacao = {
    cnefe: {
      carregado: () => Promise.resolve(r.cnefeCarregado ?? true),
      acharRua: () => {
        chamadas.push('cnefe.rua')
        return Promise.resolve(r.rua === undefined ? { chave: 'FICTICIA', exata: true } : r.rua)
      },
      buscarNaRua: () => Promise.resolve(r.ponto ?? null),
      centroDoCep: () => Promise.resolve(r.centroCep ?? null),
      centroDoMunicipio: () => Promise.resolve(r.centroMunicipio ?? null),
    },
    nominatim: r.semNominatim
      ? null
      : {
          buscarEndereco: () => {
            chamadas.push('nominatim')
            if (r.osm === 'falha') {
              const e = new Error('tempo esgotado')
              e.name = 'NominatimIndisponivel'
              return Promise.reject(e)
            }
            return Promise.resolve(r.osm ?? null)
          },
        },
    cep: {
      consultar: () => {
        chamadas.push('cep')
        if (r.cep === 'falha') {
          const e = new Error('sem conexão')
          e.name = 'CepIndisponivel'
          return Promise.reject(e)
        }
        return Promise.resolve(r.cep ?? null)
      },
    },
    cache: { obter: (p, c) => Promise.resolve(r.cache?.[`${p}:${c}`] ?? null) },
  }
  return { dep, chamadas }
}

const ponto = (nivel: PontoCnefe['nivel'], ambiguo = false): PontoCnefe => ({
  nivel,
  ...CENTRO,
  detalhe: 'x',
  ambiguo,
})
const osm = (nivel: AcheiNoNominatim['nivel']): AcheiNoNominatim => ({
  nivel,
  latitude: -20.31,
  longitude: -40.31,
  resumo: { nivel },
})

describe('cascata de camadas', () => {
  it('1: CNEFE com o número casado é exata e não chama o Nominatim', async () => {
    const { dep, chamadas } = montar({ ponto: ponto('numero') })
    const r = await geocodificar(ENDERECO, dep)
    expect(r.situacao).toBe('posicionada')
    if (r.situacao !== 'posicionada') return
    expect(r.posicao).toMatchObject({ precisao: 'exata', aproximacao: null, origem: 'cnefe' })
    expect(chamadas).not.toContain('nominatim')
  })

  it('2: sem número no CNEFE, o Nominatim com número é exata', async () => {
    const { dep } = montar({ ponto: ponto('rua'), osm: osm('numero') })
    const r = await geocodificar(ENDERECO, dep)
    expect(r).toMatchObject({
      situacao: 'posicionada',
      posicao: { precisao: 'exata', origem: 'nominatim', latitude: -20.31 },
    })
  })

  it('3: o interpolado do CNEFE vem antes da rua do Nominatim', async () => {
    const { dep } = montar({ ponto: ponto('numero_interpolado'), osm: osm('rua') })
    const r = await geocodificar(ENDERECO, dep)
    expect(r).toMatchObject({
      situacao: 'posicionada',
      posicao: { precisao: 'aproximada', aproximacao: 'interpolada', origem: 'cnefe' },
    })
  })

  it('4: a rua do Nominatim vem antes do centro da rua do CNEFE', async () => {
    const { dep } = montar({ ponto: ponto('rua'), osm: osm('rua') })
    const r = await geocodificar(ENDERECO, dep)
    expect(r).toMatchObject({
      situacao: 'posicionada',
      posicao: { precisao: 'aproximada', aproximacao: 'rua', origem: 'nominatim' },
    })
  })

  it('5: sem Nominatim (desenvolvimento), o centro da rua do CNEFE', async () => {
    const { dep } = montar({ ponto: ponto('rua'), semNominatim: true })
    const r = await geocodificar(ENDERECO, dep)
    expect(r).toMatchObject({
      situacao: 'posicionada',
      posicao: { aproximacao: 'rua', origem: 'cnefe' },
    })
  })

  it('6: rua desconhecida: centro do CEP, depois a localidade, depois o centro do município', async () => {
    const doCep = montar({ rua: null, centroCep: CENTRO, osm: osm('cidade') })
    expect(await geocodificar(ENDERECO, doCep.dep)).toMatchObject({
      posicao: { aproximacao: 'cep_cidade', origem: 'cep', detalhe: 'centro do CEP 29000000' },
    })
    const localidade = montar({ rua: null, osm: osm('cidade') })
    expect(await geocodificar(ENDERECO, localidade.dep)).toMatchObject({
      posicao: { aproximacao: 'cep_cidade', origem: 'nominatim' },
    })
    const municipio = montar({ rua: null, centroMunicipio: CENTRO })
    expect(await geocodificar(ENDERECO, municipio.dep)).toMatchObject({
      posicao: { aproximacao: 'cep_cidade', origem: 'cep' },
    })
  })

  it('nada acha em lugar nenhum: a confirmar (e nenhum pin)', async () => {
    const { dep } = montar({ rua: null })
    const r = await geocodificar(ENDERECO, dep)
    expect(r.situacao).toBe('a_confirmar')
  })

  it('número casado em dois bairros (ambíguo): é aproximada, nunca exata', async () => {
    const { dep } = montar({ ponto: ponto('numero', true), semNominatim: true })
    const r = await geocodificar(ENDERECO, dep)
    expect(r).toMatchObject({
      situacao: 'posicionada',
      posicao: { precisao: 'aproximada', aproximacao: 'rua', origem: 'cnefe' },
    })
  })

  it('número ambíguo no CNEFE mas o Nominatim acha a porta: vale o Nominatim (exata)', async () => {
    const { dep } = montar({ ponto: ponto('numero', true), osm: osm('numero') })
    const r = await geocodificar(ENDERECO, dep)
    expect(r).toMatchObject({ posicao: { precisao: 'exata', origem: 'nominatim' } })
  })

  it('CNEFE não carregado: pula a camada e segue pelo Nominatim', async () => {
    const { dep, chamadas } = montar({ cnefeCarregado: false, osm: osm('numero') })
    const r = await geocodificar(ENDERECO, dep)
    expect(r).toMatchObject({ posicao: { origem: 'nominatim' } })
    expect(chamadas).not.toContain('cnefe.rua')
  })

  it('o texto consultado e as consultas feitas voltam para o registro', async () => {
    const { dep } = montar({ ponto: ponto('numero') })
    const r = await geocodificar(ENDERECO, dep)
    if (r.situacao !== 'posicionada') throw new Error('esperava posição')
    expect(r.posicao.consultado).toBe('Rua Fictícia, 120, Bairro Teste, Vitória, 29000000')
    expect(r.consultas.map((c) => c.provedor)).toEqual(['cnefe'])
  })
})

describe('endereço incompleto e CEP', () => {
  it('sem número: completar pelo CEP não adianta, vai para "a confirmar" sem pin', async () => {
    const { dep } = montar({
      ponto: ponto('numero'),
      cep: {
        logradouro: 'Rua X',
        bairro: 'Y',
        cidade: 'Vitória',
        uf: 'ES',
        municipioCodigo: 3205309,
      },
    })
    const r = await geocodificar({ ...ENDERECO, numero: '' }, dep)
    expect(r).toMatchObject({ situacao: 'a_confirmar', faltas: ['numero'] })
  })

  it('"S/N" não é incompleto: geocodifica a rua', async () => {
    const { dep } = montar({ ponto: ponto('rua'), semNominatim: true })
    const r = await geocodificar({ ...ENDERECO, numero: 'S/N' }, dep)
    expect(r.situacao).toBe('posicionada')
  })

  it('sem rua e sem bairro: o CEP completa e a empresa vira pin', async () => {
    const { dep, chamadas } = montar({
      ponto: ponto('numero'),
      cep: {
        logradouro: 'Rua do CEP',
        bairro: 'Bairro do CEP',
        cidade: 'Vitória',
        uf: 'ES',
        municipioCodigo: 3205309,
      },
    })
    const r = await geocodificar(
      { ...ENDERECO, logradouro: null, tipoLogradouro: null, bairro: null },
      dep,
    )
    expect(chamadas).toContain('cep')
    expect(r).toMatchObject({ situacao: 'posicionada', completouPeloCep: true })
    if (r.situacao === 'posicionada')
      expect(r.consultas.map((c) => c.provedor)).toEqual(['cep', 'cnefe'])
  })

  it('o CEP só preenche o que falta: a rua do cadastro nunca é trocada', async () => {
    const { dep, chamadas } = montar({
      ponto: ponto('numero'),
      cep: {
        logradouro: 'Outra Rua',
        bairro: 'Outro',
        cidade: 'Vitória',
        uf: 'ES',
        municipioCodigo: 3205309,
      },
    })
    await geocodificar(ENDERECO, dep)
    // endereço já completo: nem consulta o CEP
    expect(chamadas).not.toContain('cep')
  })

  it('CEP que não existe e continua faltando bairro: a confirmar', async () => {
    const { dep } = montar({ cep: null })
    const r = await geocodificar({ ...ENDERECO, bairro: null }, dep)
    expect(r).toMatchObject({ situacao: 'a_confirmar', faltas: ['bairro'] })
  })

  it('CEP fora do ar: tenta de novo depois, sem marcar a empresa', async () => {
    const { dep } = montar({ cep: 'falha' })
    const r = await geocodificar({ ...ENDERECO, bairro: null }, dep)
    expect(r.situacao).toBe('indisponivel')
  })

  it('usa o cache do CEP sem chamar o serviço', async () => {
    const { dep, chamadas } = montar({
      ponto: ponto('numero'),
      cache: {
        'cep:29000000': {
          resultado: 'achou',
          resposta: {
            logradouro: 'Rua Y',
            bairro: 'Bairro Y',
            cidade: 'Vitória',
            uf: 'ES',
            municipioCodigo: 3205309,
          },
          latitude: null,
          longitude: null,
        },
      },
    })
    const r = await geocodificar({ ...ENDERECO, bairro: null }, dep)
    expect(r.situacao).toBe('posicionada')
    expect(chamadas).not.toContain('cep')
    expect(r.consultas[0]).toMatchObject({ provedor: 'cep', doCache: true })
  })
})

describe('falhas do Nominatim', () => {
  it('fora do ar e o CNEFE só acha a rua: ainda posiciona (aproximada)', async () => {
    const { dep } = montar({ ponto: ponto('rua'), osm: 'falha' })
    const r = await geocodificar(ENDERECO, dep)
    expect(r.situacao).toBe('posicionada')
    expect(r.consultas.find((c) => c.provedor === 'nominatim')?.resultado).toBe('erro')
  })

  it('fora do ar e nada mais acha: indisponível (tenta depois), não "a confirmar"', async () => {
    const { dep } = montar({ rua: null, osm: 'falha' })
    expect((await geocodificar(ENDERECO, dep)).situacao).toBe('indisponivel')
  })

  it('o cache do Nominatim evita a segunda chamada', async () => {
    const { dep, chamadas } = montar({
      ponto: ponto('rua'),
      cache: {
        'nominatim:FICTICIA, 120, Vitória': {
          resultado: 'achou',
          resposta: { nivel: 'numero' },
          latitude: -20.31,
          longitude: -40.31,
        },
      },
    })
    const r = await geocodificar(ENDERECO, dep)
    expect(r).toMatchObject({ posicao: { precisao: 'exata', origem: 'nominatim' } })
    expect(chamadas).not.toContain('nominatim')
  })
})

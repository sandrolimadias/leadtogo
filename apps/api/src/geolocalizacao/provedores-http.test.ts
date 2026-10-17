import { afterEach, describe, expect, it } from 'vitest'

import { subirServidorFalso, type ServidorFalso } from '../receita/servidor-falso.js'
import { ProvedorCep } from './provedor-cep.js'
import { ProvedorNominatim } from './provedor-nominatim.js'

const servidores: ServidorFalso[] = []
const subir = async (...args: Parameters<typeof subirServidorFalso>) => {
  const s = await subirServidorFalso(...args)
  servidores.push(s)
  return s
}
afterEach(async () => {
  await Promise.all(servidores.splice(0).map((s) => s.fechar()))
})

describe('ProvedorNominatim', () => {
  const item = (address: Record<string, string>, extra = {}) => ({
    lat: '-20.3',
    lon: '-40.3',
    address,
    ...extra,
  })

  it('a consulta é "rua sem tipo, número, município" (sem UF)', () => {
    expect(ProvedorNominatim.consulta('Avenida Dr. Fulano', 120, 'Vitória')).toBe(
      'DOUTOR FULANO, 120, Vitória',
    )
    expect(ProvedorNominatim.consulta('Rua Sete', null, 'Serra')).toBe('SETE, Serra')
  })

  it('classifica: com número, só a rua e só a localidade', async () => {
    const s = await subir({
      status: 200,
      corpo: [item({ road: 'Rua A', house_number: '12', city: 'Vitória' })],
    })
    const p = new ProvedorNominatim(s.url, 2000)
    expect(await p.buscarEndereco('A, 12, Vitória', 'Vitória')).toMatchObject({
      nivel: 'numero',
      latitude: -20.3,
      longitude: -40.3,
    })
    s.responder({ status: 200, corpo: [item({ road: 'Rua A', city: 'Vitória' })] })
    expect((await p.buscarEndereco('A, Vitória', 'Vitória'))?.nivel).toBe('rua')
    s.responder({ status: 200, corpo: [item({ city: 'Vitória' })] })
    expect((await p.buscarEndereco('Vitória', 'Vitória'))?.nivel).toBe('cidade')
  })

  it('descarta resultado de outro município e usa o próximo', async () => {
    const s = await subir({
      status: 200,
      corpo: [
        item({ road: 'Rua A', house_number: '12', city: 'Serra' }),
        item({ road: 'Rua A', city: 'Vitória' }),
      ],
    })
    const p = new ProvedorNominatim(s.url, 2000)
    expect((await p.buscarEndereco('A, 12, Vitória', 'Vitória'))?.nivel).toBe('rua')
    s.responder({ status: 200, corpo: [item({ road: 'Rua A', house_number: '1', city: 'Serra' })] })
    expect(await p.buscarEndereco('A, 1, Vitória', 'Vitória')).toBeNull()
  })

  it('sem resultado: nulo; falha de rede, 5xx ou texto: indisponível', async () => {
    const s = await subir({ status: 200, corpo: [] })
    const p = new ProvedorNominatim(s.url, 2000)
    expect(await p.buscarEndereco('x', 'Vitória')).toBeNull()
    s.responder({ status: 503 })
    await expect(p.buscarEndereco('x', 'Vitória')).rejects.toThrow('HTTP 503')
    s.responder({ status: 200, texto: '<html>' })
    await expect(p.buscarEndereco('x', 'Vitória')).rejects.toThrow('não é JSON')
    s.responder({ status: 200, corpo: [], atrasoMs: 600 })
    await expect(new ProvedorNominatim(s.url, 100).buscarEndereco('x', 'Vitória')).rejects.toThrow(
      'tempo esgotado',
    )
    await expect(
      new ProvedorNominatim('http://127.0.0.1:1', 500).buscarEndereco('x', 'V'),
    ).rejects.toThrow('sem conexão')
  })

  it('manda o User-Agent do Leadtogo e restringe ao Brasil', async () => {
    const s = await subir({ status: 200, corpo: [] })
    await new ProvedorNominatim(s.url, 2000).buscarEndereco('rua, vila', 'Vila Velha')
    expect(s.chamadas[0]).toContain('/search?')
    expect(s.chamadas[0]).toContain('countrycodes=br')
    expect(s.chamadas[0]).toContain('q=rua%2C+vila')
  })
})

describe('ProvedorCep', () => {
  const viacep = {
    logradouro: 'Rua do CEP',
    bairro: 'Bairro',
    localidade: 'Vitória',
    uf: 'ES',
    ibge: '3205309',
  }

  it('lê a ViaCEP', async () => {
    const s = await subir({ status: 200, corpo: viacep })
    const p = new ProvedorCep(s.url, 'http://127.0.0.1:1', 1000, 0)
    expect(await p.consultar('29000000')).toEqual({
      logradouro: 'Rua do CEP',
      bairro: 'Bairro',
      cidade: 'Vitória',
      uf: 'ES',
      municipioCodigo: 3205309,
    })
    expect(s.chamadas[0]).toBe('/29000000/json/')
  })

  it('CEP único do município: logradouro vazio vira nulo', async () => {
    const s = await subir({
      status: 200,
      corpo: { ...viacep, logradouro: '', bairro: '' },
    })
    const p = new ProvedorCep(s.url, 'http://127.0.0.1:1', 1000, 0)
    expect(await p.consultar('29000000')).toMatchObject({ logradouro: null, bairro: null })
  })

  it('"erro": o CEP não existe (resposta definitiva, sem tentar a BrasilAPI)', async () => {
    const s = await subir({ status: 200, corpo: { erro: 'true' } })
    const b = await subir({ status: 200, corpo: {} })
    expect(await new ProvedorCep(s.url, b.url, 1000, 0).consultar('29000000')).toBeNull()
    expect(b.chamadas).toHaveLength(0)
  })

  it('ViaCEP fora do ar: a BrasilAPI responde', async () => {
    const s = await subir({ status: 503 })
    const b = await subir({
      status: 200,
      corpo: { street: 'Rua B', neighborhood: 'Bairro B', city: 'Serra', state: 'ES' },
    })
    expect(await new ProvedorCep(s.url, b.url, 1000, 0).consultar('29000000')).toEqual({
      logradouro: 'Rua B',
      bairro: 'Bairro B',
      cidade: 'Serra',
      uf: 'ES',
      municipioCodigo: null,
    })
  })

  it('as duas fora do ar: indisponível', async () => {
    const s = await subir({ status: 503 })
    const b = await subir({ status: 500 })
    await expect(new ProvedorCep(s.url, b.url, 1000, 0).consultar('29000000')).rejects.toThrow(
      'HTTP 500',
    )
  })

  it('respeita o intervalo mínimo entre chamadas', async () => {
    const s = await subir({ status: 200, corpo: viacep })
    const p = new ProvedorCep(s.url, 'http://127.0.0.1:1', 1000, 150)
    const t0 = Date.now()
    await p.consultar('29000000')
    await p.consultar('29000000')
    await p.consultar('29000000')
    expect(Date.now() - t0).toBeGreaterThanOrEqual(280)
  })
})

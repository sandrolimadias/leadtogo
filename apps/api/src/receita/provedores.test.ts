import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { FalhaDaReceita, ProvedorHttpDaReceita } from './provedores.js'
import { respostaDaReceita, type ServidorFalso, subirServidorFalso } from './servidor-falso.js'

const servidores: ServidorFalso[] = []
afterEach(async () => {
  for (const s of servidores.splice(0)) await s.fechar()
})
afterAll(async () => {
  for (const s of servidores.splice(0)) await s.fechar()
})
const subir = async (r: Parameters<typeof subirServidorFalso>[0]) => {
  const s = await subirServidorFalso(r)
  servidores.push(s)
  return s
}

const CNPJ = '12345678000195'
const falha = async (p: ProvedorHttpDaReceita) => {
  try {
    await p.consultar(CNPJ)
  } catch (e) {
    return e as FalhaDaReceita
  }
  throw new Error('devia ter falhado')
}

describe('ProvedorHttpDaReceita', () => {
  it('200: devolve o JSON bruto e chama {base}/{cnpj}', async () => {
    const s = await subir({ status: 200, corpo: respostaDaReceita(CNPJ) })
    const p = new ProvedorHttpDaReceita('minhareceita', `${s.url}/`, 2000)
    const r = (await p.consultar(CNPJ)) as { razao_social: string }
    expect(r.razao_social).toBe('METALURGICA EXEMPLO LTDA')
    expect(s.chamadas).toEqual([`/${CNPJ}`])
  })

  it('base com caminho (BrasilAPI) é respeitada', async () => {
    const s = await subir({ status: 200, corpo: respostaDaReceita(CNPJ) })
    await new ProvedorHttpDaReceita('brasilapi', `${s.url}/api/cnpj/v1`, 2000).consultar(CNPJ)
    expect(s.chamadas).toEqual([`/api/cnpj/v1/${CNPJ}`])
  })

  it('400 e 404 são definitivos (invalido e nao_encontrado)', async () => {
    const s = await subir({ status: 400, corpo: { message: 'CNPJ inválido' } })
    const p = new ProvedorHttpDaReceita('minhareceita', s.url, 2000)
    expect((await falha(p)).tipo).toBe('invalido')
    s.responder({ status: 404, corpo: { message: 'não existe' } })
    expect((await falha(p)).tipo).toBe('nao_encontrado')
  })

  it('429, 5xx e resposta que não é JSON são "indisponivel" (passam para a alternativa)', async () => {
    const s = await subir({ status: 429 })
    const p = new ProvedorHttpDaReceita('minhareceita', s.url, 2000)
    for (const r of [
      { status: 429 },
      { status: 500 },
      { status: 503 },
      { status: 200, texto: '<html>' },
    ]) {
      s.responder(r)
      const f = await falha(p)
      expect(f.tipo, JSON.stringify(r)).toBe('indisponivel')
      expect(f.provedor).toBe('minhareceita')
    }
  })

  it('tempo esgotado: falha "indisponivel" dentro do prazo', async () => {
    const s = await subir({ status: 200, corpo: {}, atrasoMs: 5000 })
    const p = new ProvedorHttpDaReceita('minhareceita', s.url, 600)
    const inicio = Date.now()
    const f = await falha(p)
    expect(f.tipo).toBe('indisponivel')
    expect(f.message).toBe('tempo esgotado')
    expect(Date.now() - inicio).toBeLessThan(3000)
  })

  it('sem conexão (porta fechada): "indisponivel"', async () => {
    const s = await subirServidorFalso({ status: 200 })
    const url = s.url
    await s.fechar()
    const f = await falha(new ProvedorHttpDaReceita('minhareceita', url, 1000))
    expect(f.tipo).toBe('indisponivel')
  })
})

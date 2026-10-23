import { beforeEach, describe, expect, it } from 'vitest'

import {
  type Armazem,
  armazemEmMemoria,
  contar,
  guardar,
  limparTudo,
  prepararParaUsuario,
  recuperar,
  recuperarTodos,
  usarArmazem,
  VALIDADE_MS,
} from './banco'

let armazem: Armazem
beforeEach(() => {
  armazem = armazemEmMemoria()
  usarArmazem(armazem)
})

describe('banco offline das visitas', () => {
  it('guarda cifrado: o armazém não tem o texto, e volta igual', async () => {
    await prepararParaUsuario('u1', 'e1')
    await guardar('empresas', 'x', { nome: 'Mercado Central', contatos: [{ nome: 'Joana' }] })
    const cru = await armazem.ler('empresas', 'e1:x')
    expect(JSON.stringify(cru)).not.toContain('Joana')
    expect(new TextDecoder().decode((cru as { dados: ArrayBuffer }).dados)).not.toContain('Mercado')
    expect(await recuperar('empresas', 'x')).toEqual({
      nome: 'Mercado Central',
      contatos: [{ nome: 'Joana' }],
    })
  })

  it('separa por empresa: trocar de empresa não perde a fila nem mistura os dados', async () => {
    await prepararParaUsuario('u1', 'e1')
    await guardar('fila', 'r1', { id: 'r1' })
    await prepararParaUsuario('u1', 'e2')
    expect(await recuperarTodos('fila')).toEqual([])
    await prepararParaUsuario('u1', 'e1')
    expect(await recuperarTodos('fila')).toEqual([{ id: 'r1', valor: { id: 'r1' } }])
  })

  it('outra pessoa no aparelho: apaga tudo antes (inclusive a chave)', async () => {
    await prepararParaUsuario('u1', 'e1')
    await guardar('empresas', 'x', { nome: 'A' })
    const chave = await armazem.ler('meta', 'chave')
    await prepararParaUsuario('u2', 'e1')
    expect(await recuperar('empresas', 'x')).toBeNull()
    expect(await contar('empresas')).toBe(0)
    await guardar('empresas', 'y', { nome: 'B' })
    expect(await armazem.ler('meta', 'chave')).not.toBe(chave)
  })

  it('validade de 7 dias: some o vencido das empresas e do apoio, nunca da fila', async () => {
    await prepararParaUsuario('u1', 'e1')
    await guardar('empresas', 'velha', { nome: 'A' })
    await guardar('fila', 'r1', { id: 'r1' })
    for (const loja of ['empresas', 'fila'] as const) {
      const chave = loja === 'empresas' ? 'e1:velha' : 'e1:r1'
      const c = (await armazem.ler(loja, chave)) as { salvoEm: number }
      await armazem.gravar(loja, chave, { ...c, salvoEm: Date.now() - VALIDADE_MS - 1 })
    }
    await prepararParaUsuario('u1', 'e1')
    expect(await recuperar('empresas', 'velha')).toBeNull()
    expect(await recuperar('fila', 'r1')).toEqual({ id: 'r1' })
  })

  it('limparTudo (ao sair da conta) apaga todas as lojas', async () => {
    await prepararParaUsuario('u1', 'e1')
    await guardar('fila', 'r1', { id: 'r1' })
    await limparTudo()
    expect(await contar('fila')).toBe(0)
    expect(await armazem.ler('meta', 'chave')).toBeUndefined()
  })
})

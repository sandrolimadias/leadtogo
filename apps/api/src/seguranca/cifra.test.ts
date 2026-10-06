import { randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { chavesDe, cifrar, decifrar } from './cifra.js'

const chave = () => randomBytes(32).toString('base64')
const chaves = chavesDe({ TOKEN_ENCRYPTION_KEY: chave() })

describe('cifra AES-256-GCM com versão de chave', () => {
  it('cifra e decifra, com prefixo v1: e sem o texto original no resultado', () => {
    const c = cifrar('https://app/reset?token=segredo', chaves)
    expect(c.startsWith('v1:')).toBe(true)
    expect(c).not.toContain('segredo')
    expect(decifrar(c, chaves)).toBe('https://app/reset?token=segredo')
  })
  it('usa IV novo: o mesmo texto não gera o mesmo cifrado', () => {
    expect(cifrar('a', chaves)).not.toBe(cifrar('a', chaves))
  })
  it('rejeita chave errada, adulteração e versão desconhecida', () => {
    const c = cifrar('x', chaves)
    expect(() => decifrar(c, chavesDe({ TOKEN_ENCRYPTION_KEY: chave() }))).toThrow()
    expect(() => decifrar(`${c.slice(0, -2)}AA`, chaves)).toThrow()
    expect(() => decifrar(`v9:${c.slice(3)}`, chaves)).toThrow('versão')
    expect(() => decifrar('lixo', chaves)).toThrow()
  })
  it('sem chave configurada, falha com mensagem clara', () => {
    expect(() => chavesDe({})).toThrow('TOKEN_ENCRYPTION_KEY')
  })
  it('uma chave nova (v2) cifra e a v1 antiga ainda decifra', () => {
    const duas = { ...chaves, v2: randomBytes(32) }
    const antigo = cifrar('velho', duas, 'v1')
    expect(cifrar('novo', duas, 'v2').startsWith('v2:')).toBe(true)
    expect(decifrar(antigo, duas)).toBe('velho')
  })
})

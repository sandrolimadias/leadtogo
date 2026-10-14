import { describe, expect, it } from 'vitest'

import {
  alterarPerfilDeImportacaoSchema,
  criarPerfilDeImportacaoSchema,
  formatarCnae,
  interpretarCnaes,
} from './importacao.js'

describe('interpretarCnaes', () => {
  it('aceita 6 ou 7 dígitos, com ou sem pontuação, e completa o zero à esquerda', () => {
    const r = interpretarCnaes('0710-3/01\n0710301\n710301 ; 4711-3/02, 4711302')
    expect(r.codigos).toEqual([710301, 4711302])
    expect(r.repetidos).toBe(3)
    expect(r.invalidos).toEqual([])
  })

  it('lista os inválidos como foram colados, sem perder os válidos', () => {
    const r = interpretarCnaes('0710301 123 12345678 abc 0710-3')
    expect(r.codigos).toEqual([710301])
    expect(r.invalidos.map((i) => i.texto)).toEqual(['123', '12345678', 'abc', '0710-3'])
    expect(r.invalidos.map((i) => i.motivo)).toEqual([
      'o CNAE tem 6 ou 7 dígitos',
      'o CNAE tem 6 ou 7 dígitos',
      'não tem dígitos',
      'o CNAE tem 6 ou 7 dígitos',
    ])
  })

  it('texto vazio ou só separadores não tem código nenhum', () => {
    expect(interpretarCnaes('')).toEqual({ codigos: [], invalidos: [], repetidos: 0 })
    expect(interpretarCnaes(' \n ,; ')).toEqual({ codigos: [], invalidos: [], repetidos: 0 })
  })

  it('cola 126 códigos de uma vez, em linhas, sem perder nenhum', () => {
    const codigos = Array.from({ length: 126 }, (_, i) => 1000000 + i * 7)
    const texto = codigos.map((c) => formatarCnae(c)).join('\n')
    const r = interpretarCnaes(texto)
    expect(r.codigos).toEqual(codigos)
    expect(r.invalidos).toEqual([])
  })

  it('formatarCnae mostra o código com a pontuação padrão', () => {
    expect(formatarCnae(710301)).toBe('0710-3/01')
    expect(formatarCnae(4711302)).toBe('4711-3/02')
  })
})

describe('schemas do perfil de importação', () => {
  it('criar: só o nome é obrigatório, o resto tem padrão', () => {
    expect(criarPerfilDeImportacaoSchema.parse({ nome: ' Metalurgia ' })).toEqual({
      nome: 'Metalurgia',
      exigeSituacaoAtiva: true,
      estabelecimento: 'ambas',
      excluirMei: false,
      cnaes: [],
      aceitarCnaeSecundario: false,
      acaoForaDoPerfil: 'pular',
    })
  })

  it('recusa CNAE fora de 7 dígitos, campo desconhecido e alteração vazia', () => {
    expect(criarPerfilDeImportacaoSchema.safeParse({ nome: 'X', cnaes: [123] }).success).toBe(false)
    expect(criarPerfilDeImportacaoSchema.safeParse({ nome: 'X', cor: 'azul' }).success).toBe(false)
    expect(alterarPerfilDeImportacaoSchema.safeParse({}).success).toBe(false)
    expect(alterarPerfilDeImportacaoSchema.safeParse({ ativo: false }).success).toBe(true)
  })
})

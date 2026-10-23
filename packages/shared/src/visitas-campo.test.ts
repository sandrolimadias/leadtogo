import { describe, expect, it } from 'vitest'

import { decidirCheckin, levarParaOfflineSchema, validarRespostas } from './visitas-campo.js'
import type { CampoDeVisita } from './visitas.js'

const id = (n: number) => `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`

const campos: CampoDeVisita[] = [
  { id: id(1), rotulo: 'Turnos', tipo: 'numero', obrigatorio: true },
  {
    id: id(2),
    rotulo: 'Interesse',
    tipo: 'escolha_unica',
    obrigatorio: false,
    opcoes: [
      { id: id(20), rotulo: 'Alto' },
      { id: id(21), rotulo: 'Baixo' },
    ],
  },
  {
    id: id(3),
    rotulo: 'Funcionários',
    tipo: 'dados_empresa',
    obrigatorio: false,
    campoEmpresa: 'numero_funcionarios',
  },
  { id: id(4), rotulo: 'Contato', tipo: 'contato', obrigatorio: false },
]

describe('validarRespostas', () => {
  it('limpa, põe na ordem dos campos e grava o rótulo da época', () => {
    const r = validarRespostas(
      campos,
      [
        { campoId: id(2), valor: id(21) },
        { campoId: id(1), valor: 3 },
        { campoId: id(3), valor: '' },
      ],
      true,
    )
    expect(r.erros).toEqual([])
    expect(r.respostas).toEqual([
      { campoId: id(1), rotulo: 'Turnos', valor: 3 },
      { campoId: id(2), rotulo: 'Interesse', valor: id(21) },
    ])
  })

  it('obrigatório só pesa ao concluir; campo de fora, opção de fora e tipo errado são erros', () => {
    expect(validarRespostas(campos, [], false).erros).toEqual([])
    expect(validarRespostas(campos, [], true).erros.map((e) => e.campoId)).toEqual([id(1)])
    const r = validarRespostas(
      campos,
      [
        { campoId: id(9), valor: 'x' },
        { campoId: id(1), valor: 'três' },
        { campoId: id(2), valor: id(99) },
        { campoId: id(3), valor: -1 },
        { campoId: id(4), valor: { novo: { nome: 'A' } } },
      ],
      false,
    )
    expect(r.erros.map((e) => e.campoId)).toEqual([id(9), id(1), id(2), id(3), id(4)])
  })
})

describe('decidirCheckin', () => {
  it('avisar, bloquear e só gravar além do limite; sem posição da empresa nada é fora', () => {
    expect(decidirCheckin(500, 'avisar', 300)).toEqual({
      foraDoLimite: true,
      bloqueado: false,
      avisar: true,
    })
    expect(decidirCheckin(500, 'bloquear', 300)).toMatchObject({ bloqueado: true })
    expect(decidirCheckin(500, 'so_gravar', 300)).toEqual({
      foraDoLimite: true,
      bloqueado: false,
      avisar: false,
    })
    expect(decidirCheckin(200, 'bloquear', 300).foraDoLimite).toBe(false)
    expect(decidirCheckin(null, 'bloquear', 300).bloqueado).toBe(false)
  })
})

describe('levarParaOfflineSchema', () => {
  it('até 300 empresas por vez', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => id(i + 1))
    expect(levarParaOfflineSchema.safeParse({ empresaIds: ids(300) }).success).toBe(true)
    expect(levarParaOfflineSchema.safeParse({ empresaIds: ids(301) }).success).toBe(false)
    expect(levarParaOfflineSchema.safeParse({ empresaIds: [] }).success).toBe(false)
  })
})

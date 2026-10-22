import { describe, expect, it } from 'vitest'

import { camposDeVisitaSchema, configuracaoDeVisitasSchema } from './visitas.js'

const id = (n: number) => `0190f0a0-0000-7000-8000-${String(n).padStart(12, '0')}`

const texto = (n: number) => ({
  id: id(n),
  rotulo: `Campo ${n}`,
  tipo: 'texto_curto',
  obrigatorio: false,
})
const escolha = (n: number, opcoes: string[]) => ({
  id: id(n),
  rotulo: `Escolha ${n}`,
  tipo: 'escolha_unica',
  obrigatorio: true,
  opcoes: opcoes.map((rotulo, i) => ({ id: id(100 * n + i), rotulo })),
})

describe('camposDeVisitaSchema', () => {
  it('aceita os tipos com a configuração de cada um', () => {
    const r = camposDeVisitaSchema.safeParse([
      texto(1),
      escolha(2, ['Alto', 'Baixo']),
      { id: id(3), rotulo: 'Cliente quer a tag', tipo: 'tag', obrigatorio: false, tagId: id(900) },
      {
        id: id(4),
        rotulo: 'Funcionários',
        tipo: 'dados_empresa',
        obrigatorio: false,
        campoEmpresa: 'numero_funcionarios',
      },
      { id: id(5), rotulo: 'Contato', tipo: 'contato', obrigatorio: false },
    ])
    expect(r.success).toBe(true)
  })

  it('recusa o que não é do tipo: opções num texto, escolha sem opções, tag sem tag', () => {
    expect(camposDeVisitaSchema.safeParse([{ ...texto(1), opcoes: [] }]).success).toBe(false)
    expect(camposDeVisitaSchema.safeParse([escolha(1, ['Só uma'])]).success).toBe(false)
    expect(
      camposDeVisitaSchema.safeParse([{ id: id(1), rotulo: 'T', tipo: 'tag', obrigatorio: false }])
        .success,
    ).toBe(false)
  })

  it('dados da empresa nunca é CNPJ nem razão social', () => {
    for (const campoEmpresa of ['documento', 'razao_social']) {
      const r = camposDeVisitaSchema.safeParse([
        { id: id(1), rotulo: 'X', tipo: 'dados_empresa', obrigatorio: false, campoEmpresa },
      ])
      expect(r.success).toBe(false)
    }
  })

  it('recusa ids repetidos, opções repetidas e CRM duplicado', () => {
    expect(camposDeVisitaSchema.safeParse([texto(1), texto(1)]).success).toBe(false)
    expect(camposDeVisitaSchema.safeParse([escolha(1, ['Alto', 'alto'])]).success).toBe(false)
    const contato = (n: number) => ({ id: id(n), rotulo: 'C', tipo: 'contato', obrigatorio: false })
    expect(camposDeVisitaSchema.safeParse([contato(1), contato(2)]).success).toBe(false)
    const tag = (n: number) => ({
      id: id(n),
      rotulo: 'T',
      tipo: 'tag',
      obrigatorio: false,
      tagId: id(900),
    })
    expect(camposDeVisitaSchema.safeParse([tag(1), tag(2)]).success).toBe(false)
  })

  it('aceita lista vazia (o resultado sozinho já é o relatório) e até 50 campos', () => {
    expect(camposDeVisitaSchema.safeParse([]).success).toBe(true)
    const cinquenta = Array.from({ length: 50 }, (_, i) => texto(i + 1))
    expect(camposDeVisitaSchema.safeParse(cinquenta).success).toBe(true)
    expect(camposDeVisitaSchema.safeParse([...cinquenta, texto(51)]).success).toBe(false)
  })
})

describe('configuracaoDeVisitasSchema', () => {
  const valida = { checkinModo: 'avisar', checkinLimiteM: 300, lembreteRelatoriosHora: '17:30' }
  it('aceita o padrão e recusa limite e hora fora da faixa', () => {
    expect(configuracaoDeVisitasSchema.safeParse(valida).success).toBe(true)
    expect(configuracaoDeVisitasSchema.safeParse({ ...valida, checkinLimiteM: 5 }).success).toBe(
      false,
    )
    expect(
      configuracaoDeVisitasSchema.safeParse({ ...valida, checkinLimiteM: 50_001 }).success,
    ).toBe(false)
    expect(
      configuracaoDeVisitasSchema.safeParse({ ...valida, lembreteRelatoriosHora: '24:00' }).success,
    ).toBe(false)
    expect(
      configuracaoDeVisitasSchema.safeParse({ ...valida, checkinModo: 'ignorar' }).success,
    ).toBe(false)
  })
})

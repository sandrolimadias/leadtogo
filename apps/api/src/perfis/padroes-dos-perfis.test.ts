import { CHAVES_DE_PERMISSAO, PERMISSOES_PADRAO, permissoesDasLinhas } from '@leadtogo/shared'
import { describe, expect, it } from 'vitest'

import { padroesDosPerfis } from './padroes-dos-perfis.js'

describe('padrões dos perfis de sistema (catálogo → banco)', () => {
  it('os três perfis, com as permissões do catálogo, sem nada fora dele', () => {
    expect(padroesDosPerfis.perfis.map((p) => [p.chave, p.nome])).toEqual([
      ['admin', 'Administrador'],
      ['gestor', 'Gestor'],
      ['vendedor', 'Vendedor'],
    ])
    for (const p of padroesDosPerfis.perfis) {
      expect(permissoesDasLinhas(p.permissoes)).toEqual(PERMISSOES_PADRAO[p.chave])
      for (const l of p.permissoes) expect(CHAVES_DE_PERMISSAO).toContain(l.permissao)
    }
  })

  it('o interruptor antigo só amplia as ações de ver', () => {
    expect([...padroesDosPerfis.permissoesDeVer].sort()).toEqual([
      'atividades.ver',
      'contatos.ver',
      'empresas.ver',
      'oportunidades.ver',
    ])
  })
})

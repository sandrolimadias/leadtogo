import { describe, expect, it } from 'vitest'

import { permissoesDoCatalogo } from './permissoes-do-membro.js'

describe('permissões gravadas que o catálogo não conhece', () => {
  it('chaves removidas do catálogo (ex.: atividades.excluir) são ignoradas e o alcance torto não vale', () => {
    expect(
      permissoesDoCatalogo([
        { permissao: 'atividades.excluir', alcance: 'todas' },
        { permissao: 'chamados.ver', alcance: 'equipe' },
        { permissao: 'chamados.criar', alcance: null },
        { permissao: 'chamados.inexistente', alcance: null },
        // alcance onde o catálogo não admite: vale como permissão simples
        { permissao: 'chamados.exportar', alcance: 'todas' },
        // alcance faltando onde ele é exigido
        { permissao: 'chamados.atender', alcance: null },
      ]),
    ).toEqual({
      'chamados.ver': 'equipe',
      'chamados.criar': true,
      'chamados.exportar': true,
    })
  })
})

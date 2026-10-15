import { describe, expect, it } from 'vitest'

import { completarCnpj } from './cnpj.js'
import {
  decidirPelaReceita,
  documentoDaPlanilha,
  type RegrasDeImportacao,
  sugerirMapeamento,
  validarMapeamento,
} from './importacao-regras.js'
import type { DadosDaReceita } from './receita.js'

// Tudo com dados inventados: nenhum dado real de cliente.

describe('documentoDaPlanilha', () => {
  const cnpj = completarCnpj('112223330001')

  it('aceita com ou sem máscara, com espaços, e CNPJ alfanumérico', () => {
    expect(documentoDaPlanilha(cnpj)).toBe(cnpj)
    expect(
      documentoDaPlanilha(
        ` ${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)} `,
      ),
    ).toBe(cnpj)
    const alfa = completarCnpj('AB12CD34EF56')
    expect(documentoDaPlanilha(alfa.toLowerCase())).toBe(alfa)
  })

  it('completa os zeros que o Excel perde quando o CNPJ vira número', () => {
    const comZeros = completarCnpj('000000000001')
    expect(comZeros.startsWith('000')).toBe(true)
    expect(documentoDaPlanilha(String(Number(comZeros)))).toBe(comZeros)
  })

  it('recusa vazio, dígito errado, repetido, CPF, texto e notação científica', () => {
    for (const ruim of [
      '',
      '   ',
      cnpj.slice(0, 13) + (cnpj.endsWith('0') ? '1' : '0'),
      '11111111111111',
      '12345678909',
      'sem cnpj',
      '1.12223330001E+13',
      '123',
    ]) {
      expect(documentoDaPlanilha(ruim), ruim).toBeNull()
    }
  })
})

describe('sugerirMapeamento', () => {
  it('reconhece os títulos comuns, sem acento e sem diferença de caixa', () => {
    expect(
      sugerirMapeamento([
        'CNPJ',
        'Razão Social',
        'Nome Fantasia',
        'Telefone',
        'E-mail',
        'CEP',
        'Endereço',
        'Número',
        'Cidade',
        'UF',
        'Obs.',
      ]),
    ).toEqual({
      documento: 'CNPJ',
      razaoSocial: 'Razão Social',
      nomeFantasia: 'Nome Fantasia',
      telefone: 'Telefone',
      cep: 'CEP',
      logradouro: 'Endereço',
      numero: 'Número',
      municipio: 'Cidade',
      uf: 'UF',
      observacoes: 'Obs.',
    })
  })

  it('"Nome" só vira razão social se não houver coisa melhor; uma coluna serve a um campo só', () => {
    expect(sugerirMapeamento(['Nome', 'Razão social'])).toEqual({ razaoSocial: 'Razão social' })
    expect(sugerirMapeamento(['Nome', 'CNPJ'])).toEqual({ documento: 'CNPJ', razaoSocial: 'Nome' })
    expect(sugerirMapeamento(['CNPJ da empresa', 'Algo'])).toEqual({ documento: 'CNPJ da empresa' })
    expect(sugerirMapeamento(['Coluna 1', 'Coluna 2'])).toEqual({})
  })
})

describe('validarMapeamento', () => {
  const colunas = ['CNPJ', 'Nome', 'Fone']
  it('o CNPJ é sempre obrigatório; a razão social só quando os dados vêm da planilha', () => {
    expect(validarMapeamento({}, colunas, 'receita')).toEqual([
      { campo: 'documento', mensagem: 'Indique a coluna do CNPJ.' },
    ])
    expect(validarMapeamento({ documento: 'CNPJ' }, colunas, 'receita')).toEqual([])
    expect(validarMapeamento({ documento: 'CNPJ' }, colunas, 'completar')).toEqual([])
    expect(
      validarMapeamento({ documento: 'CNPJ' }, colunas, 'planilha').map((e) => e.campo),
    ).toEqual(['razaoSocial'])
    expect(
      validarMapeamento({ documento: 'CNPJ', razaoSocial: 'Nome' }, colunas, 'planilha'),
    ).toEqual([])
  })

  it('recusa coluna que não existe, campo desconhecido e coluna usada em dois campos', () => {
    const erros = validarMapeamento(
      { documento: 'CNPJ', razaoSocial: 'CNPJ', telefone: 'Celular', cor: 'Nome' },
      colunas,
      'receita',
    )
    expect(erros.map((e) => e.campo).sort()).toEqual(['cor', 'razaoSocial', 'telefone'])
    expect(erros.find((e) => e.campo === 'razaoSocial')?.mensagem).toContain(
      'já alimenta o campo CNPJ',
    )
  })
})

function receita(
  mudanca: Partial<{
    ativa: boolean
    matrizFilial: 'matriz' | 'filial'
    mei: boolean
    principal: number | null
    secundarios: number[]
  }> = {},
): DadosDaReceita {
  const m = {
    ativa: true,
    matrizFilial: 'matriz' as const,
    mei: false,
    principal: 2539001,
    secundarios: [],
    ...mudanca,
  }
  return {
    cnpj: completarCnpj('112223330001'),
    razaoSocial: 'EMPRESA DE TESTE LTDA',
    nomeFantasia: null,
    matrizFilial: m.matrizFilial,
    situacao: {
      codigo: m.ativa ? 2 : 8,
      descricao: m.ativa ? 'ATIVA' : 'BAIXADA',
      motivo: m.ativa ? null : 'Extinção',
      desde: null,
      ativa: m.ativa,
    },
    mei: m.mei,
    regimeTributario: 'nao_informado',
    porteCodigo: null,
    dataInicioAtividades: null,
    endereco: {
      cep: null,
      tipoLogradouro: null,
      logradouro: null,
      numero: null,
      complemento: null,
      bairro: null,
      municipioCodigoIbge: null,
      municipioNome: null,
      uf: null,
      paisCodigo: null,
    },
    telefones: [],
    cnaes: {
      principal: m.principal === null ? null : { codigo: m.principal, descricao: 'x' },
      secundarios: m.secundarios.map((codigo) => ({ codigo, descricao: 'y' })),
    },
    socios: [],
  }
}

const perfil = (extra: Partial<RegrasDeImportacao> = {}): RegrasDeImportacao => ({
  exigeSituacaoAtiva: true,
  estabelecimento: 'ambas',
  excluirMei: false,
  cnaes: [],
  aceitarCnaeSecundario: false,
  acaoForaDoPerfil: 'pular',
  ...extra,
})

describe('decidirPelaReceita: precedência do bloqueio de empresa não ativa', () => {
  it('com o bloqueio ligado, empresa não ativa nunca entra, mesmo com "situação ativa" desligada no perfil', () => {
    const baixada = receita({ ativa: false })
    const sem = decidirPelaReceita(baixada, perfil({ exigeSituacaoAtiva: false }), true)
    expect(sem).toEqual({ tipo: 'nao_ativa', motivo: 'Situação na Receita: BAIXADA (Extinção).' })
    // nem com a ação "importar com a tag", nem sem perfil ("Sem regras")
    expect(
      decidirPelaReceita(
        baixada,
        perfil({ exigeSituacaoAtiva: false, acaoForaDoPerfil: 'importar_com_tag' }),
        true,
      ).tipo,
    ).toBe('nao_ativa')
    expect(decidirPelaReceita(baixada, null, true).tipo).toBe('nao_ativa')
  })

  it('com o bloqueio desligado, quem decide é o perfil', () => {
    const baixada = receita({ ativa: false })
    expect(decidirPelaReceita(baixada, perfil({ exigeSituacaoAtiva: false }), false)).toEqual({
      tipo: 'importar',
    })
    expect(decidirPelaReceita(baixada, perfil(), false)).toEqual({
      tipo: 'fora_do_perfil',
      motivos: ['situação BAIXADA (o perfil pede ativa)'],
    })
    expect(decidirPelaReceita(baixada, null, false)).toEqual({ tipo: 'importar' })
  })

  it('empresa ativa sem regras entra, com ou sem bloqueio', () => {
    expect(decidirPelaReceita(receita(), null, true)).toEqual({ tipo: 'importar' })
    expect(decidirPelaReceita(receita(), perfil(), true)).toEqual({ tipo: 'importar' })
  })
})

describe('decidirPelaReceita: regras do perfil', () => {
  it('matriz ou filial', () => {
    const filial = receita({ matrizFilial: 'filial' })
    expect(decidirPelaReceita(filial, perfil({ estabelecimento: 'matriz' }), true)).toEqual({
      tipo: 'fora_do_perfil',
      motivos: ['é filial (o perfil aceita só matriz)'],
    })
    expect(decidirPelaReceita(filial, perfil({ estabelecimento: 'filial' }), true).tipo).toBe(
      'importar',
    )
    expect(decidirPelaReceita(receita(), perfil({ estabelecimento: 'filial' }), true).tipo).toBe(
      'fora_do_perfil',
    )
  })

  it('excluir MEI', () => {
    expect(decidirPelaReceita(receita({ mei: true }), perfil({ excluirMei: true }), true)).toEqual({
      tipo: 'fora_do_perfil',
      motivos: ['é MEI (o perfil exclui MEI)'],
    })
    expect(decidirPelaReceita(receita({ mei: true }), perfil(), true).tipo).toBe('importar')
  })

  it('CNAE principal na lista; o secundário só conta se o perfil aceitar', () => {
    const lista = perfil({ cnaes: [2539001, 4711302] })
    expect(decidirPelaReceita(receita({ principal: 2539001 }), lista, true).tipo).toBe('importar')
    const secundario = receita({ principal: 1011201, secundarios: [4711302] })
    expect(decidirPelaReceita(secundario, lista, true)).toEqual({
      tipo: 'fora_do_perfil',
      motivos: ['CNAE principal 1011-2/01 fora da lista'],
    })
    expect(
      decidirPelaReceita(secundario, { ...lista, aceitarCnaeSecundario: true }, true).tipo,
    ).toBe('importar')
    expect(
      decidirPelaReceita(
        receita({ principal: null }),
        { ...lista, aceitarCnaeSecundario: true },
        true,
      ),
    ).toEqual({
      tipo: 'fora_do_perfil',
      motivos: ['CNAE principal não informado fora da lista (nem entre os secundários)'],
    })
    // lista vazia = qualquer CNAE
    expect(decidirPelaReceita(receita({ principal: 1011201 }), perfil(), true).tipo).toBe(
      'importar',
    )
  })

  it('junta todos os motivos e respeita a ação: pular ou importar com a tag', () => {
    const ruim = receita({ matrizFilial: 'filial', mei: true })
    const regras = perfil({ estabelecimento: 'matriz', excluirMei: true })
    expect(decidirPelaReceita(ruim, regras, true)).toEqual({
      tipo: 'fora_do_perfil',
      motivos: ['é filial (o perfil aceita só matriz)', 'é MEI (o perfil exclui MEI)'],
    })
    expect(
      decidirPelaReceita(ruim, { ...regras, acaoForaDoPerfil: 'importar_com_tag' }, true).tipo,
    ).toBe('importar_fora_do_perfil')
  })
})

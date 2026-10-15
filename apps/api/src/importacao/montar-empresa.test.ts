import { completarCnpj, type DadosDaReceita } from '@leadtogo/shared'
import { describe, expect, it } from 'vitest'

import { type EntradaDaMontagem, montarEmpresa, telefonesDaCelula } from './montar-empresa.js'

// Dados inventados: nenhum dado real de cliente.

const receita: DadosDaReceita = {
  cnpj: completarCnpj('112223330001'),
  razaoSocial: 'EMPRESA DA RECEITA LTDA',
  nomeFantasia: 'FANTASIA DA RECEITA',
  matrizFilial: 'matriz',
  situacao: { codigo: 2, descricao: 'ATIVA', motivo: null, desde: null, ativa: true },
  mei: false,
  regimeTributario: 'simples_nacional',
  porteCodigo: 3,
  dataInicioAtividades: '2015-05-20',
  endereco: {
    cep: '29100001',
    tipoLogradouro: 'RUA',
    logradouro: 'DAS FLORES',
    numero: '100',
    complemento: null,
    bairro: 'CENTRO',
    municipioCodigoIbge: 3205309,
    municipioNome: 'VITORIA',
    uf: 'ES',
    paisCodigo: null,
  },
  telefones: [{ numero: '2730643021', e164: '+552730643021', tipo: 'fixo' }],
  cnaes: {
    principal: { codigo: 2539001, descricao: 'x' },
    secundarios: [{ codigo: 2543800, descricao: 'y' }],
  },
  socios: [],
}

const base = (extra: Partial<EntradaDaMontagem> = {}): EntradaDaMontagem => ({
  fonte: 'planilha',
  documento: receita.cnpj,
  planilha: {},
  receita: null,
  municipioDaPlanilha: null,
  vendedorId: 'v',
  verticalId: null,
  statusTagId: 's',
  ...extra,
})

const dadosDe = (e: EntradaDaMontagem) => {
  const r = montarEmpresa(e)
  if (!r.ok) throw new Error(r.motivo)
  return r.dados as Record<string, unknown> & { endereco: Record<string, unknown> }
}

describe('telefonesDaCelula', () => {
  it('separa por ; / , e quebra de linha e descarta o que não é número', () => {
    expect(telefonesDaCelula('(27) 3064-3021; 27 99847-2210 / sem telefone\n123')).toEqual([
      '(27) 3064-3021',
      '27 99847-2210',
    ])
    expect(telefonesDaCelula('')).toEqual([])
  })
})

describe('montarEmpresa: fonte "planilha"', () => {
  it('usa só a planilha nos dados básicos, mesmo havendo Receita; a Receita dá o que a planilha não tem', () => {
    const d = dadosDe(
      base({
        receita,
        planilha: {
          razaoSocial: ' Metalúrgica Teste ',
          nomeFantasia: '',
          telefone: '27 99847-2210',
          cep: '29.100-001',
          logradouro: 'Avenida Teste',
          municipio: 'Vitória',
        },
        municipioDaPlanilha: 3205309,
      }),
    )
    expect(d).toMatchObject({
      razaoSocial: 'Metalúrgica Teste',
      nomeFantasia: null, // vazio na planilha: a Receita NÃO completa nesta fonte
      telefones: [{ numero: '27 99847-2210' }],
      mei: false,
      regimeTributario: 'simples_nacional',
      porteCodigo: 3,
      dataInicioAtividades: '2015-05-20',
      cnaes: { principal: 2539001, secundarios: [2543800] },
    })
    expect(d.endereco).toMatchObject({
      cep: '29100001',
      logradouro: 'Avenida Teste',
      tipoLogradouro: null, // o tipo "RUA" é da Receita: não vai junto do logradouro da planilha
      numero: null,
      municipioCodigo: 3205309,
    })
  })

  it('sem Receita (sem regras, sem bloqueio): só a planilha, e sem razão social não há empresa', () => {
    expect(dadosDe(base({ planilha: { razaoSocial: 'Só Planilha Ltda' } }))).not.toHaveProperty(
      'cnaes',
    )
    expect(montarEmpresa(base({ planilha: { razaoSocial: ' ' } }))).toEqual({
      ok: false,
      motivo: 'Razão social em branco (ou com menos de 2 letras).',
    })
    expect(montarEmpresa(base({ planilha: { razaoSocial: 'A' } })).ok).toBe(false)
  })
})

describe('montarEmpresa: fonte "receita"', () => {
  it('a Receita manda; a planilha completa o que a Receita não trouxe', () => {
    const d = dadosDe(
      base({
        fonte: 'receita',
        receita: { ...receita, telefones: [], nomeFantasia: null },
        planilha: {
          razaoSocial: 'Nome da planilha',
          nomeFantasia: 'Fantasia da planilha',
          telefone: '27 99847-2210',
          website: 'https://exemplo.com.br',
          observacoes: 'Visitar em novembro',
        },
      }),
    )
    expect(d).toMatchObject({
      razaoSocial: 'EMPRESA DA RECEITA LTDA',
      nomeFantasia: 'Fantasia da planilha',
      telefones: [{ numero: '27 99847-2210' }],
      website: 'https://exemplo.com.br',
      observacoes: 'Visitar em novembro',
    })
    expect(d.endereco).toMatchObject({
      tipoLogradouro: 'RUA',
      logradouro: 'DAS FLORES',
      numero: '100',
      municipioCodigo: 3205309,
    })
  })

  it('basta o CNPJ na planilha: razão social e telefone vêm da Receita', () => {
    expect(dadosDe(base({ fonte: 'receita', receita }))).toMatchObject({
      razaoSocial: 'EMPRESA DA RECEITA LTDA',
      nomeFantasia: 'FANTASIA DA RECEITA',
      telefones: [{ numero: '2730643021' }],
    })
  })
})

describe('montarEmpresa: fonte "completar"', () => {
  it('a planilha primeiro; a Receita só nos campos vazios', () => {
    const d = dadosDe(
      base({
        fonte: 'completar',
        receita,
        planilha: { razaoSocial: 'Nome da planilha', logradouro: 'Rua da planilha', numero: '' },
      }),
    )
    expect(d).toMatchObject({
      razaoSocial: 'Nome da planilha',
      nomeFantasia: 'FANTASIA DA RECEITA',
      telefones: [{ numero: '2730643021' }],
    })
    expect(d.endereco).toMatchObject({
      logradouro: 'Rua da planilha',
      tipoLogradouro: null,
      numero: '100', // vazio na planilha: a Receita completa
      bairro: 'CENTRO',
      municipioCodigo: 3205309,
    })
  })
})

describe('montarEmpresa: limites', () => {
  it('corta textos longos em vez de recusar a linha; CEP inválido some e telefones passam de 10', () => {
    const d = dadosDe(
      base({
        planilha: {
          razaoSocial: 'x'.repeat(300),
          observacoes: 'o'.repeat(6000),
          cep: '123',
          telefone: Array.from(
            { length: 14 },
            (_, i) => `2730643${String(i).padStart(3, '0')}`,
          ).join(';'),
        },
      }),
    )
    expect(String(d['razaoSocial'])).toHaveLength(200)
    expect(String(d['observacoes'])).toHaveLength(5000)
    expect(d.endereco['cep']).toBeNull()
    expect((d['telefones'] as unknown[]).length).toBeLessThanOrEqual(10)
  })
})

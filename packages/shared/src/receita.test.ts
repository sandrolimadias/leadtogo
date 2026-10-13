import { describe, expect, it } from 'vitest'

import { completarCnpj } from './cnpj.js'
import {
  matrizOuFilialDoCnpj,
  normalizarRespostaDaReceita,
  RespostaDaReceitaInvalida,
  SITUACAO_ATIVA,
} from './receita.js'

const CNPJ_MATRIZ = completarCnpj('123456780001')
const CNPJ_FILIAL = completarCnpj('123456780002')

/** Resposta FALSA no formato da Minha Receita (nada de empresa real). */
function falsa(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cnpj: CNPJ_MATRIZ,
    razao_social: 'METALURGICA EXEMPLO LTDA',
    nome_fantasia: 'EXEMPLO USINAGEM',
    situacao_cadastral: 2,
    descricao_situacao_cadastral: 'ATIVA',
    descricao_motivo_situacao_cadastral: 'SEM MOTIVO',
    data_situacao_cadastral: '2015-03-10',
    identificador_matriz_filial: 1,
    opcao_pelo_mei: false,
    opcao_pelo_simples: true,
    regime_tributario: [{ ano: 2020, forma_de_tributacao: 'LUCRO PRESUMIDO' }],
    codigo_porte: 3,
    data_inicio_atividade: '2015-03-10',
    cep: '29100001',
    descricao_tipo_de_logradouro: 'RUA',
    logradouro: 'DAS FLORES',
    numero: '567',
    complemento: 'GALPAO 2',
    bairro: 'CENTRO',
    codigo_municipio_ibge: 3205309,
    codigo_municipio: 5699,
    municipio: 'VITORIA',
    uf: 'es',
    codigo_pais: null,
    ddd_telefone_1: '2730643021',
    ddd_telefone_2: '27998124410',
    cnae_fiscal: 2539001,
    cnae_fiscal_descricao: 'Serviços de usinagem, tornearia e solda',
    cnaes_secundarios: [
      { codigo: 2543800, descricao: 'Fabricação de ferramentas' },
      { codigo: 0, descricao: 'Não informada' },
      { codigo: 2539001, descricao: 'repetido do principal' },
      { codigo: 2543800, descricao: 'repetido' },
    ],
    qsa: [
      {
        nome_socio: 'FULANO DE TAL',
        cnpj_cpf_do_socio: '***123456**',
        codigo_qualificacao_socio: 49,
        qualificacao_socio: 'Sócio-Administrador',
      },
      { nome_socio: '  ', codigo_qualificacao_socio: 22, qualificacao_socio: 'Sócio' },
    ],
    ...extra,
  }
}

describe('normalizarRespostaDaReceita', () => {
  it('lê os dados principais, o endereço, os telefones, os CNAEs e os sócios', () => {
    const d = normalizarRespostaDaReceita(falsa())
    expect(d).toMatchObject({
      cnpj: CNPJ_MATRIZ,
      razaoSocial: 'METALURGICA EXEMPLO LTDA',
      nomeFantasia: 'EXEMPLO USINAGEM',
      matrizFilial: 'matriz',
      mei: false,
      regimeTributario: 'simples_nacional',
      porteCodigo: 3,
      dataInicioAtividades: '2015-03-10',
      situacao: { codigo: SITUACAO_ATIVA, descricao: 'ATIVA', ativa: true, desde: '2015-03-10' },
    })
    expect(d.endereco).toEqual({
      cep: '29100001',
      tipoLogradouro: 'RUA',
      logradouro: 'DAS FLORES',
      numero: '567',
      complemento: 'GALPAO 2',
      bairro: 'CENTRO',
      municipioCodigoIbge: 3205309,
      municipioNome: 'VITORIA',
      uf: 'ES',
      paisCodigo: null,
    })
    expect(d.telefones).toEqual([
      { numero: '2730643021', e164: '+552730643021', tipo: 'fixo' },
      { numero: '27998124410', e164: '+5527998124410', tipo: 'celular' },
    ])
    expect(d.cnaes).toEqual({
      principal: { codigo: 2539001, descricao: 'Serviços de usinagem, tornearia e solda' },
      secundarios: [{ codigo: 2543800, descricao: 'Fabricação de ferramentas' }],
    })
  })

  it('o sócio vem só com nome e qualificação: o CPF mascarado não passa; sócio sem nome é descartado', () => {
    const d = normalizarRespostaDaReceita(falsa())
    expect(d.socios).toEqual([
      { nome: 'FULANO DE TAL', qualificacaoCodigo: 49, qualificacaoTexto: 'Sócio-Administrador' },
    ])
    expect(JSON.stringify(d)).not.toContain('***123456**')
    expect(JSON.stringify(d)).not.toContain('cnpj_cpf_do_socio')
  })

  it('situação que não é ativa carrega descrição e motivo', () => {
    const d = normalizarRespostaDaReceita(
      falsa({
        situacao_cadastral: 8,
        descricao_situacao_cadastral: 'BAIXADA',
        descricao_motivo_situacao_cadastral: 'EXTINCAO POR ENCERRAMENTO LIQUIDACAO VOLUNTARIA',
        data_situacao_cadastral: '2021-05-04',
      }),
    )
    expect(d.situacao).toEqual({
      codigo: 8,
      descricao: 'BAIXADA',
      motivo: 'EXTINCAO POR ENCERRAMENTO LIQUIDACAO VOLUNTARIA',
      desde: '2021-05-04',
      ativa: false,
    })
  })

  it('o regime vem de MEI, depois Simples, depois da última forma de tributação', () => {
    const regime = (extra: Record<string, unknown>) =>
      normalizarRespostaDaReceita(falsa(extra)).regimeTributario
    expect(regime({ opcao_pelo_mei: true })).toBe('mei')
    expect(regime({ opcao_pelo_mei: false, opcao_pelo_simples: true })).toBe('simples_nacional')
    const sem = { opcao_pelo_mei: false, opcao_pelo_simples: false }
    expect(
      regime({
        ...sem,
        regime_tributario: [
          { ano: 2019, forma_de_tributacao: 'LUCRO REAL' },
          { ano: 2022, forma_de_tributacao: 'LUCRO PRESUMIDO' },
        ],
      }),
    ).toBe('lucro_presumido')
    expect(
      regime({ ...sem, regime_tributario: [{ ano: 2022, forma_de_tributacao: 'LUCRO REAL' }] }),
    ).toBe('lucro_real')
    expect(
      regime({ ...sem, regime_tributario: [{ ano: 2022, forma_de_tributacao: 'IMUNE' }] }),
    ).toBe('imune_isenta')
    expect(
      regime({ ...sem, regime_tributario: [{ ano: 2022, forma_de_tributacao: 'ARBITRADO' }] }),
    ).toBe('nao_informado')
    expect(regime({ ...sem, regime_tributario: null })).toBe('nao_informado')
  })

  it('campos vazios viram nulo; CEP de 7 dígitos ganha o zero; telefone vazio ou inválido some', () => {
    const d = normalizarRespostaDaReceita(
      falsa({
        nome_fantasia: '',
        complemento: '   ',
        cep: '9100001',
        ddd_telefone_1: '',
        ddd_telefone_2: '123',
        codigo_municipio_ibge: 0,
        cnaes_secundarios: null,
        qsa: null,
        cnae_fiscal: null,
      }),
    )
    expect(d.nomeFantasia).toBeNull()
    expect(d.endereco.complemento).toBeNull()
    expect(d.endereco.cep).toBe('09100001')
    expect(d.endereco.municipioCodigoIbge).toBeNull()
    expect(d.telefones).toEqual([])
    expect(d.cnaes).toEqual({ principal: null, secundarios: [] })
    expect(d.socios).toEqual([])
  })

  it('estabelecimento no exterior traz o código do país; Brasil (105) vira nulo', () => {
    expect(normalizarRespostaDaReceita(falsa({ codigo_pais: 249 })).endereco.paisCodigo).toBe(249)
    expect(normalizarRespostaDaReceita(falsa({ codigo_pais: 105 })).endereco.paisCodigo).toBeNull()
  })

  it('matriz ou filial vem do identificador; sem ele, da ordem do CNPJ', () => {
    expect(
      normalizarRespostaDaReceita(falsa({ identificador_matriz_filial: 2 })).matrizFilial,
    ).toBe('filial')
    const semIdentificador = falsa({ cnpj: CNPJ_FILIAL, identificador_matriz_filial: null })
    expect(normalizarRespostaDaReceita(semIdentificador).matrizFilial).toBe('filial')
    expect(matrizOuFilialDoCnpj(CNPJ_MATRIZ)).toBe('matriz')
    expect(matrizOuFilialDoCnpj(CNPJ_FILIAL)).toBe('filial')
    expect(matrizOuFilialDoCnpj('12.345.678/0001-95'.replace(/\D/g, ''))).toBe('matriz')
  })

  it('aceita números como texto (a BrasilAPI e outras fontes variam)', () => {
    const d = normalizarRespostaDaReceita(
      falsa({ situacao_cadastral: '2', codigo_porte: '5', cnae_fiscal: '2539001' }),
    )
    expect(d.situacao.ativa).toBe(true)
    expect(d.porteCodigo).toBe(5)
    expect(d.cnaes.principal?.codigo).toBe(2539001)
  })

  it('resposta fora do formato lança erro com o campo (nunca devolve dado pela metade)', () => {
    for (const ruim of [
      null,
      'texto',
      [],
      {},
      falsa({ razao_social: '' }),
      falsa({ situacao_cadastral: null }),
      falsa({ cnpj: 12 }),
    ]) {
      expect(() => normalizarRespostaDaReceita(ruim), JSON.stringify(ruim)).toThrow(
        RespostaDaReceitaInvalida,
      )
    }
  })
})

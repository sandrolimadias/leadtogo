import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'

import { ErroApi } from '../http/erro-api.js'
import { LIMITE_DESCOMPACTADO, lerPlanilha, tamanhoDescompactado } from './planilha.js'

// Todas as planilhas são geradas aqui, com dados inventados: nenhum dado real de cliente.

async function xlsx(linhas: unknown[][], nomeDaFolha = 'Empresas'): Promise<Buffer> {
  const livro = new ExcelJS.Workbook()
  const folha = livro.addWorksheet(nomeDaFolha)
  for (const l of linhas) folha.addRow(l)
  return Buffer.from(await livro.xlsx.writeBuffer())
}
const csv = (texto: string, codificacao: 'utf8' | 'latin1' = 'utf8') =>
  Buffer.from(texto, codificacao)

const erroDe = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    if (e instanceof ErroApi) return { codigo: e.codigo, status: e.getStatus() }
    throw e
  }
  throw new Error('deveria ter falhado')
}

describe('lerPlanilha: Excel (.xlsx)', () => {
  it('lê títulos e linhas na ordem; número, data, fórmula e texto rico viram texto', async () => {
    const livro = new ExcelJS.Workbook()
    const folha = livro.addWorksheet('Empresas')
    folha.addRow(['CNPJ', 'Razão social', 'Telefone', 'Desde', 'Total'])
    folha.addRow([
      11222333000181,
      'Metalúrgica Teste Ltda',
      '(27) 3000-0000',
      new Date('2020-03-04'),
      { formula: '1+1', result: 2 },
    ])
    folha.addRow([
      '11.222.333/0002-62',
      { richText: [{ text: 'Usinagem ' }, { text: 'Fictícia' }] },
      null,
      null,
      null,
    ])
    const p = await lerPlanilha(Buffer.from(await livro.xlsx.writeBuffer()))
    expect(p.formato).toBe('xlsx')
    expect(p.colunas).toEqual(['CNPJ', 'Razão social', 'Telefone', 'Desde', 'Total'])
    expect(p.linhas).toEqual([
      ['11222333000181', 'Metalúrgica Teste Ltda', '(27) 3000-0000', '2020-03-04', '2'],
      ['11.222.333/0002-62', 'Usinagem Fictícia', '', '', ''],
    ])
  })

  it('tira linhas em branco, apara espaços e dá nome a coluna sem título', async () => {
    const p = await lerPlanilha(
      await xlsx([['  CNPJ ', '', 'Cidade'], ['1', 'x', ' Vitória '], [], ['', '', ''], ['2']]),
    )
    expect(p.colunas).toEqual(['CNPJ', 'Coluna 2', 'Cidade'])
    expect(p.linhas).toEqual([
      ['1', 'x', 'Vitória'],
      ['2', '', ''],
    ])
  })

  it('usa a primeira folha que tem dados', async () => {
    const livro = new ExcelJS.Workbook()
    livro.addWorksheet('Vazia')
    const dados = livro.addWorksheet('Dados')
    dados.addRow(['CNPJ'])
    dados.addRow(['1'])
    const p = await lerPlanilha(Buffer.from(await livro.xlsx.writeBuffer()))
    expect(p.linhas).toEqual([['1']])
  })

  it('aceita exatamente 10.000 linhas e recusa 10.001', async () => {
    const dez = Array.from({ length: 10_000 }, (_, i) => [String(i + 1)])
    expect((await lerPlanilha(await xlsx([['CNPJ'], ...dez]))).linhas).toHaveLength(10_000)
    expect(await erroDe(lerPlanilha(await xlsx([['CNPJ'], ...dez, ['x']])))).toEqual({
      codigo: 'limite_de_linhas',
      status: 413,
    })
  }, 60_000)

  it('só o cabeçalho, título repetido e arquivo que não é xlsx dão erro claro', async () => {
    expect(await erroDe(lerPlanilha(await xlsx([['CNPJ']])))).toMatchObject({
      codigo: 'arquivo_sem_linhas',
    })
    expect(
      await erroDe(
        lerPlanilha(
          await xlsx([
            ['CNPJ', 'cnpj'],
            ['1', '2'],
          ]),
        ),
      ),
    ).toMatchObject({
      codigo: 'colunas_repetidas',
    })
    expect(
      await erroDe(
        lerPlanilha(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('lixo')])),
      ),
    ).toMatchObject({ codigo: 'arquivo_invalido' })
  })

  it('recusa mais de 100 colunas', async () => {
    const titulos = Array.from({ length: 101 }, (_, i) => `C${i}`)
    expect(await erroDe(lerPlanilha(await xlsx([titulos, titulos])))).toMatchObject({
      codigo: 'colunas_demais',
    })
  })

  it('recusa o que fica grande demais depois de aberto (bomba de zip declarada no diretório central)', async () => {
    const bom = await xlsx([['CNPJ'], ['1']])
    expect(tamanhoDescompactado(bom)).toBeGreaterThan(0)
    expect(tamanhoDescompactado(bom)).toBeLessThan(LIMITE_DESCOMPACTADO)
    const adulterado = Buffer.from(bom)
    for (let i = 0; i + 46 <= adulterado.length; i++) {
      if (adulterado.readUInt32LE(i) === 0x02014b50) adulterado.writeUInt32LE(0xffffffff, i + 24)
    }
    expect(await erroDe(lerPlanilha(adulterado))).toEqual({
      codigo: 'arquivo_grande_demais',
      status: 413,
    })
  })
})

describe('lerPlanilha: CSV', () => {
  it('detecta o separador: ponto e vírgula, vírgula e tabulação', async () => {
    for (const sep of [';', ',', '\t']) {
      const p = await lerPlanilha(csv(`CNPJ${sep}Nome\n1${sep}Fulano\n2${sep}Beltrano\n`))
      expect(p.colunas).toEqual(['CNPJ', 'Nome'])
      expect(p.linhas).toEqual([
        ['1', 'Fulano'],
        ['2', 'Beltrano'],
      ])
    }
  })

  it('lê UTF-8 com BOM e Windows-1252 (CSV do Excel em português) com os acentos certos', async () => {
    const texto = 'Razão social;Município\nIndústria Teste;São Mateus\n'
    const utf8 = await lerPlanilha(csv(`\uFEFF${texto}`))
    expect(utf8.colunas).toEqual(['Razão social', 'Município'])
    expect(utf8.linhas).toEqual([['Indústria Teste', 'São Mateus']])
    const latin = await lerPlanilha(csv(texto, 'latin1'))
    expect(latin.colunas).toEqual(['Razão social', 'Município'])
    expect(latin.linhas).toEqual([['Indústria Teste', 'São Mateus']])
  })

  it('campo entre aspas com separador e quebra de linha, linha curta completada, linha vazia ignorada', async () => {
    const p = await lerPlanilha(
      csv('CNPJ;Obs;Cidade\r\n1;"texto; com ponto e vírgula\nem duas linhas";Vitória\r\n\r\n2\r\n'),
    )
    expect(p.linhas).toEqual([
      ['1', 'texto; com ponto e vírgula\nem duas linhas', 'Vitória'],
      ['2', '', ''],
    ])
  })

  it('aceita 10.000 linhas e recusa 10.001 sem ler o arquivo todo', async () => {
    const corpo = (n: number) => `CNPJ\n${Array.from({ length: n }, (_, i) => i + 1).join('\n')}\n`
    expect((await lerPlanilha(csv(corpo(10_000)))).linhas).toHaveLength(10_000)
    expect(await erroDe(lerPlanilha(csv(corpo(10_001))))).toEqual({
      codigo: 'limite_de_linhas',
      status: 413,
    })
    expect(await erroDe(lerPlanilha(csv(corpo(50_000))))).toMatchObject({
      codigo: 'limite_de_linhas',
    })
  })

  it('texto de célula muito longo é cortado e o resto da linha segue valendo', async () => {
    const p = await lerPlanilha(csv(`CNPJ;Obs\n1;${'x'.repeat(5000)}\n`))
    expect(p.linhas[0]?.[1]).toHaveLength(2000)
  })

  it('só cabeçalho, título repetido e título vazio', async () => {
    expect(await erroDe(lerPlanilha(csv('CNPJ;Nome\n')))).toMatchObject({
      codigo: 'arquivo_sem_linhas',
    })
    expect(await erroDe(lerPlanilha(csv('CNPJ;CNPJ\n1;2\n')))).toMatchObject({
      codigo: 'colunas_repetidas',
    })
    expect(await erroDe(lerPlanilha(csv(';;\n1;2;3\n')))).toMatchObject({ codigo: 'sem_cabecalho' })
  })
})

describe('lerPlanilha: arquivo que não é planilha', () => {
  it('vazio, só espaços, .xls antigo e binário qualquer', async () => {
    expect(await erroDe(lerPlanilha(Buffer.alloc(0)))).toMatchObject({ codigo: 'arquivo_vazio' })
    expect(await erroDe(lerPlanilha(csv('  \n \n')))).toMatchObject({ codigo: 'arquivo_vazio' })
    expect(
      await erroDe(lerPlanilha(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))),
    ).toEqual({ codigo: 'formato_nao_suportado', status: 415 })
    expect(await erroDe(lerPlanilha(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])))).toEqual({
      codigo: 'formato_nao_suportado',
      status: 415,
    })
  })

  it('passa de 10 MB: 413 arquivo_grande_demais', async () => {
    expect(await erroDe(lerPlanilha(Buffer.alloc(10 * 1024 * 1024 + 1, 0x41)))).toEqual({
      codigo: 'arquivo_grande_demais',
      status: 413,
    })
  })
})

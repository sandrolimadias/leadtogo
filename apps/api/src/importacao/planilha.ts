import { LIMITE_BYTES_DA_IMPORTACAO, LIMITE_LINHAS_DA_IMPORTACAO } from '@leadtogo/shared'
import { parse } from 'csv-parse/sync'
import ExcelJS from 'exceljs'

import { ErroApi } from '../http/erro-api.js'

/** Mais colunas que isto não é planilha de carteira: protege a memória do mapeamento e da prévia. */
export const LIMITE_DE_COLUNAS = 100
/** Tamanho que o .xlsx pode ter descompactado (um .xlsx é um zip: protege contra "bomba de zip"). */
export const LIMITE_DESCOMPACTADO = 100 * 1024 * 1024
/** Tamanho de uma célula de texto; o que passar é cortado (o resto da linha segue valendo). */
const LIMITE_DA_CELULA = 2000

export type FormatoDaPlanilha = 'xlsx' | 'csv'

export interface Planilha {
  formato: FormatoDaPlanilha
  /** Títulos da primeira linha, aparados e sem repetição */
  colunas: string[]
  /** Uma lista de valores por linha, na ordem das colunas (sempre do tamanho de `colunas`) */
  linhas: string[][]
}

const erro = (codigo: string, mensagem: string, status = 400) =>
  new ErroApi(codigo, mensagem, status)

const ZIP = [0x50, 0x4b, 0x03, 0x04]
const OLE = [0xd0, 0xcf, 0x11, 0xe0] // .xls antigo (BIFF)
const comeca = (b: Buffer, assinatura: number[]) => assinatura.every((v, i) => b[i] === v)

/** Soma os tamanhos descompactados declarados no diretório central do zip. */
export function tamanhoDescompactado(b: Buffer): number {
  let total = 0
  for (let i = 0; i + 46 <= b.length; i++) {
    if (b.readUInt32LE(i) === 0x02014b50) {
      total += b.readUInt32LE(i + 24)
      i += 45
    }
  }
  return total
}

function textoDaCelula(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'string') return valor
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor)
  if (valor instanceof Date) return valor.toISOString().slice(0, 10)
  if (typeof valor === 'object') {
    if ('richText' in valor) return valor.richText.map((t) => t.text).join('')
    if ('text' in valor) return String(valor.text)
    if ('result' in valor) return valor.result === undefined ? '' : textoDaCelula(valor.result)
    if ('error' in valor) return ''
  }
  return ''
}

const limpar = (t: string) => t.trim().slice(0, LIMITE_DA_CELULA)

/** Dá nome às colunas (vazia vira "Coluna N") e recusa título repetido. */
function conferirColunas(titulos: string[]): string[] {
  while (titulos.length > 0 && titulos[titulos.length - 1] === '') titulos.pop()
  if (titulos.length === 0) {
    throw erro(
      'sem_cabecalho',
      'A primeira linha da planilha precisa trazer os títulos das colunas.',
    )
  }
  if (titulos.length > LIMITE_DE_COLUNAS) {
    throw erro('colunas_demais', `A planilha tem colunas demais (o limite é ${LIMITE_DE_COLUNAS}).`)
  }
  const colunas = titulos.map((t, i) => (t === '' ? `Coluna ${i + 1}` : t))
  const vistos = new Set<string>()
  const repetidas = new Set<string>()
  for (const c of colunas) {
    const chave = c.toLocaleLowerCase('pt-BR')
    if (vistos.has(chave)) repetidas.add(c)
    vistos.add(chave)
  }
  if (repetidas.size > 0) {
    throw erro(
      'colunas_repetidas',
      `Há títulos de coluna repetidos: ${[...repetidas].join(', ')}. Deixe um título diferente em cada coluna.`,
    )
  }
  return colunas
}

/** As linhas sem nenhum valor saem; as demais ficam do tamanho das colunas. */
function conferirLinhas(colunas: string[], brutas: string[][]): string[][] {
  const linhas = brutas
    .map((l) => colunas.map((_, i) => limpar(l[i] ?? '')))
    .filter((l) => l.some((v) => v !== ''))
  if (linhas.length === 0) {
    throw erro(
      'arquivo_sem_linhas',
      'A planilha não tem nenhuma linha de dados abaixo dos títulos.',
    )
  }
  if (linhas.length > LIMITE_LINHAS_DA_IMPORTACAO) {
    throw erro(
      'limite_de_linhas',
      `A planilha passa do limite de ${LIMITE_LINHAS_DA_IMPORTACAO.toLocaleString('pt-BR')} linhas. Divida o arquivo em partes.`,
      413,
    )
  }
  return linhas
}

async function lerXlsx(buffer: Buffer): Promise<Planilha> {
  if (tamanhoDescompactado(buffer) > LIMITE_DESCOMPACTADO) {
    throw erro('arquivo_grande_demais', 'O arquivo, depois de aberto, é grande demais.', 413)
  }
  const livro = new ExcelJS.Workbook()
  try {
    await livro.xlsx.load(buffer as unknown as ExcelJS.Buffer)
  } catch {
    throw erro('arquivo_invalido', 'Não foi possível abrir o arquivo: ele não é um .xlsx válido.')
  }
  const folha = livro.worksheets.find((f) => f.actualRowCount > 0)
  if (!folha) throw erro('arquivo_vazio', 'A planilha está vazia.')
  // Margem de 1 (o cabeçalho) e de linhas em branco que o Excel conta: o limite exato vem depois
  if (folha.actualRowCount > LIMITE_LINHAS_DA_IMPORTACAO + 1) {
    throw erro(
      'limite_de_linhas',
      `A planilha passa do limite de ${LIMITE_LINHAS_DA_IMPORTACAO.toLocaleString('pt-BR')} linhas. Divida o arquivo em partes.`,
      413,
    )
  }
  const largura = Math.min(folha.columnCount, LIMITE_DE_COLUNAS + 1)
  const matriz: string[][] = []
  folha.eachRow({ includeEmpty: false }, (linha) => {
    const valores: string[] = []
    for (let c = 1; c <= largura; c++) valores.push(limpar(textoDaCelula(linha.getCell(c).value)))
    matriz.push(valores)
  })
  const [titulos, ...dados] = matriz
  if (!titulos) throw erro('arquivo_vazio', 'A planilha está vazia.')
  const colunas = conferirColunas(titulos)
  return { formato: 'xlsx', colunas, linhas: conferirLinhas(colunas, dados) }
}

function decodificarCsv(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // CSV salvo pelo Excel em português costuma ser Windows-1252
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

/** O separador mais frequente na primeira linha (`;` do Excel em português, `,` ou tabulação). */
function separadorDe(texto: string): string {
  const primeira = texto.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  const contagens = [';', ',', '\t'].map((s) => [s, primeira.split(s).length - 1] as const)
  const [melhor] = [...contagens].sort((a, b) => b[1] - a[1])
  return melhor && melhor[1] > 0 ? melhor[0] : ','
}

function lerCsv(buffer: Buffer): Planilha {
  const texto = decodificarCsv(buffer)
  if (texto.trim() === '') throw erro('arquivo_vazio', 'O arquivo está vazio.')
  let registros: string[][]
  try {
    registros = parse(texto, {
      bom: true,
      delimiter: separadorDe(texto.replace(/^\uFEFF/, '')),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      // Corta a leitura logo depois do limite (cabeçalho + limite + 1 para detectar o excesso)
      to: LIMITE_LINHAS_DA_IMPORTACAO + 2,
      max_record_size: 64 * 1024,
    })
  } catch {
    throw erro(
      'arquivo_invalido',
      'Não foi possível ler o arquivo CSV (aspas ou linhas malformadas).',
    )
  }
  const [titulos, ...dados] = registros
  if (!titulos) throw erro('arquivo_vazio', 'O arquivo está vazio.')
  const colunas = conferirColunas(titulos.map(limpar))
  return { formato: 'csv', colunas, linhas: conferirLinhas(colunas, dados) }
}

/**
 * Lê a planilha enviada (Excel .xlsx ou CSV). O formato vem do conteúdo, não da extensão.
 * Não grava nada; só valida os limites (tamanho, linhas, colunas) e devolve títulos e linhas.
 */
export async function lerPlanilha(buffer: Buffer): Promise<Planilha> {
  if (buffer.length === 0) throw erro('arquivo_vazio', 'O arquivo está vazio.')
  if (buffer.length > LIMITE_BYTES_DA_IMPORTACAO) {
    throw erro('arquivo_grande_demais', 'O arquivo passa do limite de 10 MB.', 413)
  }
  if (comeca(buffer, ZIP)) return lerXlsx(buffer)
  if (comeca(buffer, OLE)) {
    throw erro(
      'formato_nao_suportado',
      'Arquivo .xls antigo não é aceito. Abra no Excel e salve como .xlsx ou CSV.',
      415,
    )
  }
  if (buffer.includes(0)) {
    throw erro(
      'formato_nao_suportado',
      'Formato não suportado: envie um arquivo .xlsx ou .csv.',
      415,
    )
  }
  return lerCsv(buffer)
}

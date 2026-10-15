import { cnpjValido, normalizarCnpj } from './cnpj.js'
import type { DadosDaReceita } from './receita.js'
import { CAMPOS_DA_EMPRESA_NA_IMPORTACAO, type FonteDosDados } from './importacao.js'

// Regras puras da importação de empresas (sem banco, sem rede): ler o CNPJ da planilha, sugerir e
// validar o mapeamento de colunas e decidir, com os dados da Receita, se a empresa entra.

type ChaveDoCampo = (typeof CAMPOS_DA_EMPRESA_NA_IMPORTACAO)[number]['chave']

/**
 * O CNPJ de uma célula da planilha, só os caracteres e válido, ou `null`. O Excel guarda CNPJ
 * numérico como número e perde os zeros à esquerda (`00000000000191` vira `191`): números de até
 * 13 dígitos são completados a 14 antes de conferir os dígitos verificadores (que barram o lixo).
 * CPF e texto qualquer não passam. Notação científica (`1.12E+13`) não tem como recuperar: inválido.
 */
export function documentoDaPlanilha(valor: string): string | null {
  const texto = normalizarCnpj(valor.trim())
  if (texto === '') return null
  const candidato = /^\d{1,13}$/.test(texto) ? texto.padStart(14, '0') : texto
  return cnpjValido(candidato) ? candidato : null
}

/** Minúsculas, sem acento e com um espaço entre palavras: "Razão  Social" → "razao social". */
const semAcento = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Títulos de coluna que costumam ser cada campo, do mais específico ao mais genérico. */
const SINONIMOS: Record<ChaveDoCampo, string[]> = {
  documento: ['cnpj', 'cnpj cpf', 'documento', 'cnpj da empresa', 'cnpj empresa'],
  razaoSocial: ['razao social', 'razao', 'nome da empresa', 'empresa', 'cliente', 'nome'],
  nomeFantasia: ['nome fantasia', 'fantasia'],
  telefone: ['telefone', 'fone', 'tel', 'celular', 'whatsapp', 'contato'],
  website: ['site', 'website', 'url', 'pagina web'],
  cep: ['cep'],
  logradouro: ['logradouro', 'endereco', 'rua'],
  numero: ['numero', 'n', 'no', 'num'],
  complemento: ['complemento'],
  bairro: ['bairro'],
  municipio: ['municipio', 'cidade'],
  uf: ['uf', 'estado'],
  observacoes: ['observacoes', 'observacao', 'obs'],
}

/** O campo de cada coluna que o título indica; uma coluna serve a um campo só e o que não casa fica de fora. */
export function sugerirMapeamento(colunas: string[]): Partial<Record<ChaveDoCampo, string>> {
  const normalizadas = colunas.map((c) => [c, semAcento(c)] as const)
  const usadas = new Set<string>()
  const sugestao: Partial<Record<ChaveDoCampo, string>> = {}
  for (const { chave } of CAMPOS_DA_EMPRESA_NA_IMPORTACAO) {
    for (const sinonimo of SINONIMOS[chave]) {
      const achada = normalizadas.find(
        ([coluna, n]) =>
          !usadas.has(coluna) &&
          (n === sinonimo || (sinonimo.length > 3 && n.startsWith(`${sinonimo} `))),
      )
      if (achada) {
        sugestao[chave] = achada[0]
        usadas.add(achada[0])
        break
      }
    }
  }
  return sugestao
}

export interface ErroDoMapeamento {
  campo: string
  mensagem: string
}

/**
 * Confere o mapeamento (campo → título da coluna). O CNPJ é sempre obrigatório; a razão social
 * também quando os dados vêm da planilha. Uma coluna só pode alimentar um campo.
 */
export function validarMapeamento(
  campos: Partial<Record<string, string | null>>,
  colunas: string[],
  fonte: FonteDosDados,
): ErroDoMapeamento[] {
  const erros: ErroDoMapeamento[] = []
  const conhecidos = new Set<string>(CAMPOS_DA_EMPRESA_NA_IMPORTACAO.map((c) => c.chave))
  const usadas = new Map<string, string>()
  for (const [campo, coluna] of Object.entries(campos)) {
    if (!conhecidos.has(campo)) {
      erros.push({ campo, mensagem: 'Campo desconhecido.' })
    } else if (coluna) {
      if (!colunas.includes(coluna)) {
        erros.push({ campo, mensagem: `A coluna "${coluna}" não existe na planilha.` })
      } else if (usadas.has(coluna)) {
        erros.push({
          campo,
          mensagem: `A coluna "${coluna}" já alimenta o campo ${usadas.get(coluna)}.`,
        })
      } else {
        usadas.set(coluna, rotuloDoCampo(campo))
      }
    }
  }
  if (!campos['documento'])
    erros.push({ campo: 'documento', mensagem: 'Indique a coluna do CNPJ.' })
  if (fonte === 'planilha' && !campos['razaoSocial']) {
    erros.push({
      campo: 'razaoSocial',
      mensagem: 'Indique a coluna da razão social (ou busque os dados na Receita).',
    })
  }
  return erros
}

export const rotuloDoCampo = (chave: string): string =>
  CAMPOS_DA_EMPRESA_NA_IMPORTACAO.find((c) => c.chave === chave)?.rotulo ?? chave

/** Regras de um perfil, como a decisão as usa (e como o lote as guarda: cópia, não referência). */
export interface RegrasDeImportacao {
  exigeSituacaoAtiva: boolean
  estabelecimento: 'ambas' | 'matriz' | 'filial'
  excluirMei: boolean
  cnaes: number[]
  aceitarCnaeSecundario: boolean
  acaoForaDoPerfil: 'pular' | 'importar_com_tag'
}

export type DecisaoDaEmpresa =
  | { tipo: 'importar' }
  /** Não passou no perfil e a ação é importar com a tag "Fora do perfil" */
  | { tipo: 'importar_fora_do_perfil'; motivos: string[] }
  /** Não passou no perfil e a ação é pular e listar no relatório ("importar mesmo assim" depois) */
  | { tipo: 'fora_do_perfil'; motivos: string[] }
  /** Bloqueio de empresa não ativa (Configurações → Carteira): vence o perfil */
  | { tipo: 'nao_ativa'; motivo: string }

const codigoDoCnae = (c: number): string => {
  const d = String(c).padStart(7, '0')
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`
}

/**
 * Decide, com os dados da Receita, o que fazer com a empresa. PRECEDÊNCIA: o bloqueio de empresa
 * não ativa vence o perfil. Com o bloqueio ligado, empresa não ativa na Receita nunca entra, mesmo
 * que o perfil tenha "situação ativa" desligado (e mesmo na ação "importar com a tag"). Sem perfil
 * ("Sem regras") só o bloqueio vale.
 */
export function decidirPelaReceita(
  dados: DadosDaReceita,
  regras: RegrasDeImportacao | null,
  bloquearNaoAtiva: boolean,
): DecisaoDaEmpresa {
  if (bloquearNaoAtiva && !dados.situacao.ativa) {
    return {
      tipo: 'nao_ativa',
      motivo: `Situação na Receita: ${dados.situacao.descricao}${dados.situacao.motivo ? ` (${dados.situacao.motivo})` : ''}.`,
    }
  }
  if (!regras) return { tipo: 'importar' }

  const motivos: string[] = []
  if (regras.exigeSituacaoAtiva && !dados.situacao.ativa) {
    motivos.push(`situação ${dados.situacao.descricao} (o perfil pede ativa)`)
  }
  if (regras.estabelecimento !== 'ambas' && dados.matrizFilial !== regras.estabelecimento) {
    motivos.push(
      `é ${dados.matrizFilial} (o perfil aceita só ${regras.estabelecimento === 'matriz' ? 'matriz' : 'filiais'})`,
    )
  }
  if (regras.excluirMei && dados.mei) motivos.push('é MEI (o perfil exclui MEI)')
  if (regras.cnaes.length > 0) {
    const lista = new Set(regras.cnaes)
    const principal = dados.cnaes.principal?.codigo
    const passa =
      (principal !== undefined && lista.has(principal)) ||
      (regras.aceitarCnaeSecundario && dados.cnaes.secundarios.some((c) => lista.has(c.codigo)))
    if (!passa) {
      motivos.push(
        `CNAE ${principal === undefined ? 'principal não informado' : `principal ${codigoDoCnae(principal)}`} fora da lista${regras.aceitarCnaeSecundario ? ' (nem entre os secundários)' : ''}`,
      )
    }
  }
  if (motivos.length === 0) return { tipo: 'importar' }
  return regras.acaoForaDoPerfil === 'importar_com_tag'
    ? { tipo: 'importar_fora_do_perfil', motivos }
    : { tipo: 'fora_do_perfil', motivos }
}

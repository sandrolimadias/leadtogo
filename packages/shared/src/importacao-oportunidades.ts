import { diaNoFuso, FUSO_PADRAO, inicioDoDiaNoFuso } from './atividades.js'
import { INVALIDO, type Invalido, lerData, paraComparar } from './importacao-leitura.js'
import {
  MESES_MAXIMOS,
  type StatusDaOportunidade,
  type StatusDeFechamento,
  VALOR_MAXIMO,
} from './oportunidades.js'

// Importação de oportunidades por planilha (docs/plano_importacao_oportunidades.md).
// Funções puras, usadas pela prévia e pelo executor.

/** Os campos que o mapeamento aceita para oportunidades; `*` = obrigatório. */
export const CAMPOS_DA_OPORTUNIDADE_NA_IMPORTACAO = [
  { chave: 'documento', rotulo: 'CNPJ da empresa', obrigatorio: true },
  { chave: 'titulo', rotulo: 'Título', obrigatorio: false },
  { chave: 'fase', rotulo: 'Fase', obrigatorio: false },
  { chave: 'status', rotulo: 'Status', obrigatorio: false },
  { chave: 'motivo', rotulo: 'Motivo', obrigatorio: false },
  { chave: 'motivoDetalhe', rotulo: 'Detalhe do motivo', obrigatorio: false },
  { chave: 'retomarEm', rotulo: 'Retomar em (dd/mm/aaaa)', obrigatorio: false },
  { chave: 'dataFechamento', rotulo: 'Data de fechamento (dd/mm/aaaa)', obrigatorio: false },
  { chave: 'valorUnico', rotulo: 'Valor único', obrigatorio: false },
  { chave: 'valorMensal', rotulo: 'Valor mensal', obrigatorio: false },
  { chave: 'meses', rotulo: 'Meses', obrigatorio: false },
  { chave: 'probabilidade', rotulo: 'Probabilidade (%)', obrigatorio: false },
  { chave: 'dataPrevista', rotulo: 'Data prevista de fechamento', obrigatorio: false },
  { chave: 'origem', rotulo: 'Origem', obrigatorio: false },
  { chave: 'solucao', rotulo: 'Solução', obrigatorio: false },
  { chave: 'emailContato', rotulo: 'E-mail do contato', obrigatorio: false },
  { chave: 'emailResponsavel', rotulo: 'E-mail do responsável', obrigatorio: false },
  { chave: 'observacoes', rotulo: 'Observações', obrigatorio: false },
] as const

/**
 * As colunas cujos valores a pessoa aponta para um cadastro no passo Mapear (como o Tipo das atividades).
 * Fase: as fases ativas do funil do lote; Motivo: os motivos ativos; Origem e Solução: os cadastros ativos.
 */
export const CAMPOS_COM_VALORES_DA_OPORTUNIDADE = ['fase', 'motivo', 'origem', 'solucao'] as const
export type CampoComValores = (typeof CAMPOS_COM_VALORES_DA_OPORTUNIDADE)[number]

/** O status como a planilha escreve; `null` = em branco (Ativo). */
export function lerStatus(valor: string): StatusDaOportunidade | null | Invalido {
  const t = paraComparar(valor)
  if (t === '') return null
  if (['ativo', 'ativa', 'aberto', 'aberta', 'em andamento', 'andamento'].includes(t))
    return 'ativo'
  if (
    [
      'conquistado',
      'conquistada',
      'ganho',
      'ganha',
      'vendido',
      'vendida',
      'fechado ganho',
    ].includes(t)
  )
    return 'conquistado'
  if (['perdido', 'perdida', 'fechado perdido'].includes(t)) return 'perdido'
  if (['cancelado', 'cancelada'].includes(t)) return 'cancelado'
  if (['suspenso', 'suspensa', 'pausado', 'pausada'].includes(t)) return 'suspenso'
  return INVALIDO
}

/**
 * Um valor em reais: "R$ 1.234,56", "1234,56", "1.234" (milhar), "1234.56" e "1,234.56". Mais de duas casas
 * decimais, negativo ou acima de `VALOR_MAXIMO` é inválido. Em branco → `null`.
 */
export function lerDinheiro(valor: string): number | null | Invalido {
  const t = valor.replace(/R\$/gi, '').replace(/\s/g, '')
  if (t === '') return null
  if (!/^\d[\d.,]*$/.test(t)) return INVALIDO
  const pontos = (t.match(/\./g) ?? []).length
  const virgulas = (t.match(/,/g) ?? []).length
  let decimal: '.' | ',' | null
  if (pontos > 0 && virgulas > 0) decimal = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ','
  // "1234,5" é decimal; "1,234,567" é milhar
  else if (virgulas > 0) decimal = virgulas === 1 ? ',' : null
  // "1.234" e "1.234.567" são milhar (o costume no Brasil); "1234.5" e "0.75" são decimais
  else if (pontos === 1) decimal = /^\d{1,3}\.\d{3}$/.test(t) ? null : '.'
  else decimal = null
  const milhar = decimal === ',' ? '.' : decimal === '.' ? ',' : pontos > 0 ? '.' : ','
  const [inteira = '', fracao, sobra] = decimal ? t.split(decimal) : [t]
  if (sobra !== undefined) return INVALIDO
  if (fracao !== undefined && !/^\d{1,2}$/.test(fracao)) return INVALIDO
  // separador de milhar só entre grupos de três dígitos
  const grupos = inteira.split(milhar)
  if (!/^\d{1,}$/.test(grupos[0] ?? '') || grupos.slice(1).some((g) => !/^\d{3}$/.test(g))) {
    return INVALIDO
  }
  if (grupos.length > 1 && (grupos[0] ?? '').length > 3) return INVALIDO
  const numero = Number(`${grupos.join('')}.${fracao ?? '0'}`)
  return numero > VALOR_MAXIMO ? INVALIDO : numero
}

/** Um inteiro de `min` a `max` ("40", "40%", "12 meses"); em branco → `null`. */
function lerInteiro(
  valor: string,
  min: number,
  max: number,
  sufixo: RegExp,
): number | null | Invalido {
  const t = valor.trim().replace(sufixo, '').trim()
  if (t === '') return null
  if (!/^\d+$/.test(t)) return INVALIDO
  const n = Number(t)
  return n < min || n > max ? INVALIDO : n
}

export const lerPercentual = (valor: string) => lerInteiro(valor, 0, 100, /\s*%$/)
export const lerMeses = (valor: string) => lerInteiro(valor, 0, MESES_MAXIMOS, /\s*mes(es)?$/i)

export interface OportunidadeDaLinha {
  titulo: string | null
  /** Como veio (o executor resolve pelo mapeamento de valores); nulo = a primeira fase ativa */
  fase: string | null
  status: StatusDaOportunidade
  /** Como veio; só conta em Perdido, Cancelado e Suspenso */
  motivo: string | null
  motivoDetalhe: string | null
  /** AAAA-MM-DD; só em Suspenso */
  retomarEm: string | null
  /** AAAA-MM-DD; só fora de Ativo */
  dataFechamento: string | null
  valorUnico: number
  valorMensal: number
  /** Nulo: 12 com valor mensal, senão 0 */
  meses: number | null
  /** Nulo: a da fase */
  probabilidade: number | null
  dataPrevista: string | null
  origem: string | null
  solucao: string | null
  emailContato: string | null
  emailResponsavel: string | null
  observacoes: string | null
}

export type LeituraDaOportunidade =
  { ok: true; oportunidade: OportunidadeDaLinha; avisos: string[] } | { ok: false; motivo: string }

const celula = (dados: Record<string, string>, campos: Record<string, string>, campo: string) =>
  (campos[campo] ? (dados[campos[campo]] ?? '') : '').trim()
const vazioParaNulo = (v: string): string | null => (v === '' ? null : v)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Lê uma linha da planilha de oportunidades. Pula a linha (com o motivo) o que o cadastro manual recusaria:
 * status desconhecido, valor, meses, probabilidade ou data inválidos e Suspenso sem "Retomar em". E-mails
 * inválidos e campos que não valem para o status (data de fechamento em Ativo, por exemplo) viram aviso.
 */
export function lerLinhaDeOportunidade(
  dados: Record<string, string>,
  campos: Record<string, string>,
): LeituraDaOportunidade {
  const c = (campo: string) => celula(dados, campos, campo)
  const avisos: string[] = []

  const status = lerStatus(c('status'))
  if (status === INVALIDO) {
    return {
      ok: false,
      motivo: `Status desconhecido: ${c('status').slice(0, 30)}. Use Ativo, Conquistado, Perdido, Cancelado ou Suspenso.`,
    }
  }
  const valor = (campo: string): number | Invalido => lerDinheiro(c(campo)) ?? 0
  const valorUnico = valor('valorUnico')
  if (valorUnico === INVALIDO) {
    return { ok: false, motivo: `Valor único inválido: ${c('valorUnico').slice(0, 30)}.` }
  }
  const valorMensal = valor('valorMensal')
  if (valorMensal === INVALIDO) {
    return { ok: false, motivo: `Valor mensal inválido: ${c('valorMensal').slice(0, 30)}.` }
  }
  const meses = lerMeses(c('meses'))
  if (meses === INVALIDO) {
    return {
      ok: false,
      motivo: `Meses inválido: ${c('meses').slice(0, 20)}. Use um número inteiro de 0 a ${MESES_MAXIMOS}.`,
    }
  }
  const probabilidade = lerPercentual(c('probabilidade'))
  if (probabilidade === INVALIDO) {
    return {
      ok: false,
      motivo: `Probabilidade inválida: ${c('probabilidade').slice(0, 20)}. Use um número inteiro de 0 a 100.`,
    }
  }
  const data = (campo: string, rotulo: string): string | null | { invalida: string } => {
    const bruto = c(campo)
    const dia = lerData(bruto)
    if (dia === INVALIDO) {
      return { invalida: `${rotulo} inválida: ${bruto.slice(0, 30)}. Use dd/mm/aaaa.` }
    }
    return dia
  }
  const dataPrevista = data('dataPrevista', 'Data prevista de fechamento')
  if (typeof dataPrevista === 'object' && dataPrevista)
    return { ok: false, motivo: dataPrevista.invalida }
  let retomarEm = data('retomarEm', 'Data de retomada')
  if (typeof retomarEm === 'object' && retomarEm) return { ok: false, motivo: retomarEm.invalida }
  let dataFechamento = data('dataFechamento', 'Data de fechamento')
  if (typeof dataFechamento === 'object' && dataFechamento) {
    return { ok: false, motivo: dataFechamento.invalida }
  }

  const statusFinal: StatusDaOportunidade = status ?? 'ativo'
  let motivo = vazioParaNulo(c('motivo').slice(0, 200))
  let motivoDetalhe = vazioParaNulo(c('motivoDetalhe').slice(0, 2000))
  if (statusFinal === 'suspenso' && !retomarEm) {
    return { ok: false, motivo: 'Oportunidade Suspensa exige a data em "Retomar em".' }
  }
  if (statusFinal !== 'suspenso' && retomarEm) {
    avisos.push('"Retomar em" só vale para Suspensa: ignorado.')
    retomarEm = null
  }
  if (statusFinal === 'ativo' && dataFechamento) {
    avisos.push('Data de fechamento em oportunidade Ativa: ignorada.')
    dataFechamento = null
  }
  if ((statusFinal === 'ativo' || statusFinal === 'conquistado') && motivo) {
    avisos.push(`Motivo só vale para Perdida, Cancelada ou Suspensa: ignorado.`)
    motivo = null
  }
  if (statusFinal === 'ativo' && motivoDetalhe) {
    avisos.push('Detalhe do motivo em oportunidade Ativa: ignorado.')
    motivoDetalhe = null
  }

  const email = (campo: string, rotulo: string): string | null => {
    const bruto = c(campo).toLowerCase()
    if (bruto === '') return null
    if (!EMAIL.test(bruto) || bruto.length > 254) {
      avisos.push(`${rotulo} inválido (${bruto.slice(0, 40)}): ignorado.`)
      return null
    }
    return bruto
  }

  return {
    ok: true,
    oportunidade: {
      titulo: vazioParaNulo(c('titulo').slice(0, 200)),
      fase: vazioParaNulo(c('fase')),
      status: statusFinal,
      motivo,
      motivoDetalhe,
      retomarEm,
      dataFechamento,
      valorUnico,
      valorMensal,
      meses,
      probabilidade,
      dataPrevista,
      origem: vazioParaNulo(c('origem')),
      solucao: vazioParaNulo(c('solucao')),
      emailContato: email('emailContato', 'E-mail do contato'),
      emailResponsavel: email('emailResponsavel', 'E-mail do responsável'),
      observacoes: vazioParaNulo(c('observacoes').slice(0, 5000)),
    },
    avisos,
  }
}

export type DecisaoDaOportunidade =
  | {
      ok: true
      /** Fora de Ativo: o início do dia da data de fechamento no fuso, ou nulo = agora */
      dataFechamento: Date | null
      avisos: string[]
    }
  | { ok: false; motivo: string }

/**
 * O que depende de "hoje", no fuso da empresa: "Retomar em" no passado e data de fechamento no futuro pulam
 * a linha (o fechamento manual também não aceita); fechada sem data de fechamento fica com a data da
 * importação, com aviso.
 */
export function decidirOportunidade(
  o: OportunidadeDaLinha,
  agora: Date,
  fuso: string = FUSO_PADRAO,
): DecisaoDaOportunidade {
  const hoje = diaNoFuso(agora, fuso)
  if (o.retomarEm && o.retomarEm < hoje) {
    return { ok: false, motivo: 'A data de retomada não pode ser no passado.' }
  }
  if (o.dataFechamento && o.dataFechamento > hoje) {
    return { ok: false, motivo: 'A data de fechamento não pode ser no futuro.' }
  }
  const avisos: string[] = []
  if (o.status !== 'ativo' && !o.dataFechamento) {
    avisos.push('Sem data de fechamento: ficou a data da importação.')
  }
  return {
    ok: true,
    dataFechamento:
      o.status !== 'ativo' && o.dataFechamento ? inicioDoDiaNoFuso(o.dataFechamento, fuso) : null,
    avisos,
  }
}

/** Perdido, Cancelado e Suspenso exigem o motivo. */
export const statusExigeMotivo = (
  s: StatusDaOportunidade,
): s is Exclude<StatusDeFechamento, 'conquistado'> =>
  s === 'perdido' || s === 'cancelado' || s === 'suspenso'

/** O título quando a planilha não traz: "Empresa – Solução", ou só a empresa (como sugere o cadastro). */
export const tituloSugerido = (empresa: string, solucao: string | null): string =>
  (solucao ? `${empresa} – ${solucao}` : empresa).slice(0, 200)

import {
  diaNoFuso,
  estaNoFuturo,
  FUSO_PADRAO,
  instanteNoFuso,
  inicioDoDiaNoFuso,
  type SituacaoDaAtividade,
} from './atividades.js'
import {
  horaDaData,
  INVALIDO,
  lerData,
  lerHora,
  lerSimNao,
  paraComparar,
} from './importacao-leitura.js'

// Importação de atividades por planilha (docs/funcionalidades.md, "Importação de contatos e de atividades").
// Funções puras, usadas pela prévia e pelo executor.

/** Os campos que o mapeamento aceita para atividades; `*` = obrigatório. */
export const CAMPOS_DA_ATIVIDADE_NA_IMPORTACAO = [
  { chave: 'documento', rotulo: 'CNPJ da empresa', obrigatorio: true },
  { chave: 'tipo', rotulo: 'Tipo de atividade', obrigatorio: true },
  { chave: 'titulo', rotulo: 'Título', obrigatorio: false },
  { chave: 'data', rotulo: 'Data (dd/mm/aaaa)', obrigatorio: true },
  { chave: 'hora', rotulo: 'Hora', obrigatorio: false },
  { chave: 'situacao', rotulo: 'Situação', obrigatorio: false },
  { chave: 'resultado', rotulo: 'Resultado', obrigatorio: false },
  { chave: 'emailContato', rotulo: 'E-mail do contato', obrigatorio: false },
  { chave: 'emailResponsavel', rotulo: 'E-mail do responsável', obrigatorio: false },
  { chave: 'importante', rotulo: 'Importante (sim/não)', obrigatorio: false },
  { chave: 'urgente', rotulo: 'Urgente (sim/não)', obrigatorio: false },
  { chave: 'observacoes', rotulo: 'Observações', obrigatorio: false },
] as const

export type SituacaoImportavel = Extract<
  SituacaoDaAtividade,
  'pendente' | 'realizada' | 'cancelada'
>

/** A situação como a planilha escreve; `null` = em branco (decide a data). */
export function lerSituacao(valor: string): SituacaoImportavel | null | typeof INVALIDO {
  const t = paraComparar(valor)
  if (t === '') return null
  if (['realizada', 'realizado', 'feita', 'feito', 'concluida', 'concluido'].includes(t))
    return 'realizada'
  if (['pendente', 'agendada', 'agendado', 'aberta', 'aberto'].includes(t)) return 'pendente'
  if (['cancelada', 'cancelado'].includes(t)) return 'cancelada'
  return INVALIDO
}

export interface AtividadeDaLinha {
  /** O nome do tipo como veio (o executor o resolve pelo mapeamento de valores) */
  tipo: string
  titulo: string | null
  /** AAAA-MM-DD */
  dia: string
  /** HH:mm, ou `null` = dia inteiro */
  hora: string | null
  situacao: SituacaoImportavel | null
  resultado: string | null
  emailContato: string | null
  emailResponsavel: string | null
  importante: boolean
  urgente: boolean
  observacoes: string | null
}

export type LeituraDaAtividade =
  { ok: true; atividade: AtividadeDaLinha; avisos: string[] } | { ok: false; motivo: string }

const celula = (dados: Record<string, string>, campos: Record<string, string>, campo: string) =>
  (campos[campo] ? (dados[campos[campo]] ?? '') : '').trim()
const vazioParaNulo = (v: string): string | null => (v === '' ? null : v)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Lê uma linha da planilha de atividades: o que é inválido pula a linha; e-mails ruins viram aviso. */
export function lerLinhaDeAtividade(
  dados: Record<string, string>,
  campos: Record<string, string>,
): LeituraDaAtividade {
  const tipo = celula(dados, campos, 'tipo')
  if (tipo === '') return { ok: false, motivo: 'Tipo de atividade em branco.' }

  const dataBruta = celula(dados, campos, 'data')
  if (dataBruta === '') return { ok: false, motivo: 'Data em branco.' }
  const dia = lerData(dataBruta)
  if (dia === null || dia === INVALIDO) {
    return { ok: false, motivo: `Data inválida: ${dataBruta.slice(0, 30)}. Use dd/mm/aaaa.` }
  }
  const horaBruta = celula(dados, campos, 'hora')
  const hora = horaBruta === '' ? horaDaData(dataBruta) : lerHora(horaBruta)
  if (hora === INVALIDO)
    return { ok: false, motivo: `Hora inválida: ${horaBruta.slice(0, 20)}. Use hh:mm.` }

  const situacao = lerSituacao(celula(dados, campos, 'situacao'))
  if (situacao === INVALIDO) {
    return {
      ok: false,
      motivo: `Situação desconhecida: ${celula(dados, campos, 'situacao').slice(0, 30)}. Use Realizada, Pendente ou Cancelada.`,
    }
  }

  const avisos: string[] = []
  const flag = (campo: string, rotulo: string): boolean => {
    const v = lerSimNao(celula(dados, campos, campo))
    if (v === INVALIDO) {
      avisos.push(
        `${rotulo}: "${celula(dados, campos, campo).slice(0, 20)}" não é sim nem não; tratado como não.`,
      )
      return false
    }
    return v === true
  }
  const importante = flag('importante', 'Importante')
  const urgente = flag('urgente', 'Urgente')

  const email = (campo: string, rotulo: string): string | null => {
    const bruto = celula(dados, campos, campo).toLowerCase()
    if (bruto === '') return null
    if (!EMAIL.test(bruto) || bruto.length > 254) {
      avisos.push(`${rotulo} inválido (${bruto.slice(0, 40)}): ignorado.`)
      return null
    }
    return bruto
  }

  return {
    ok: true,
    atividade: {
      tipo,
      titulo: vazioParaNulo(celula(dados, campos, 'titulo').slice(0, 200)),
      dia,
      hora,
      situacao,
      resultado: vazioParaNulo(celula(dados, campos, 'resultado').slice(0, 5000)),
      emailContato: email('emailContato', 'E-mail do contato'),
      emailResponsavel: email('emailResponsavel', 'E-mail do responsável'),
      importante,
      urgente,
      observacoes: vazioParaNulo(celula(dados, campos, 'observacoes').slice(0, 5000)),
    },
    avisos,
  }
}

export type DecisaoDaAtividade =
  | {
      ok: true
      situacao: SituacaoImportavel
      dataInicio: Date
      diaInteiro: boolean
      realizadaEm: Date | null
      resultado: string | null
      avisos: string[]
    }
  | { ok: false; resultado: 'pulada_no_futuro' | 'pulada_invalida'; motivo: string }

/**
 * Decide a situação e as datas da atividade, no fuso da empresa, pelas mesmas regras do registro manual:
 *  - sem hora = dia inteiro (a meia-noite do dia, no fuso); com hora, o instante daquele relógio;
 *  - situação em branco: data passada = Realizada; futura = Pendente (o dia inteiro de HOJE é Pendente);
 *  - Realizada no futuro, passada a tolerância de 5 minutos, é pulada (`pulada_no_futuro`);
 *  - Realizada exige o resultado (a mesma regra do cadastro, que o banco também confere);
 *  - Pendente com resultado: o resultado é ignorado, com aviso.
 */
export function decidirAtividade(
  a: AtividadeDaLinha,
  agora: Date,
  fuso: string = FUSO_PADRAO,
): DecisaoDaAtividade {
  const diaInteiro = a.hora === null
  const dataInicio = diaInteiro
    ? inicioDoDiaNoFuso(a.dia, fuso)
    : instanteNoFuso(a.dia, a.hora as string, fuso)
  let situacao = a.situacao
  if (situacao === null) {
    const passou = diaInteiro
      ? dataInicio.getTime() < inicioDoDiaNoFuso(diaNoFuso(agora, fuso), fuso).getTime()
      : dataInicio.getTime() <= agora.getTime()
    situacao = passou ? 'realizada' : 'pendente'
  }
  const avisos: string[] = []
  if (situacao === 'realizada') {
    if (estaNoFuturo(dataInicio, agora)) {
      return {
        ok: false,
        resultado: 'pulada_no_futuro',
        motivo: 'Atividade Realizada com data no futuro. Corrija a data ou a situação.',
      }
    }
    if (!a.resultado) {
      return {
        ok: false,
        resultado: 'pulada_invalida',
        motivo: 'Atividade Realizada exige o Resultado (como no registro pela tela).',
      }
    }
  }
  let resultado = a.resultado
  if (situacao === 'pendente' && resultado) {
    avisos.push('Resultado ignorado: a atividade está Pendente.')
    resultado = null
  }
  return {
    ok: true,
    situacao,
    dataInicio,
    diaInteiro,
    realizadaEm: situacao === 'realizada' ? dataInicio : null,
    resultado,
    avisos,
  }
}

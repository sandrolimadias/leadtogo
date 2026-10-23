import type { FaixaDeExpediente } from './chamados-config.js'

// Horas úteis dos chamados (Fase 2): metas de resposta e de resolução contam só dentro do expediente
// da empresa, no fuso dela, sem feriados. Funções puras: a API junta com os intervalos "ativos" do
// chamado (o estado "Aguardando cliente" pausa o prazo).

export interface CalendarioUtil {
  faixas: readonly FaixaDeExpediente[]
  feriados: readonly { data: string; recorrente: boolean }[]
  /** Fuso IANA da empresa */
  fusoHorario: string
}

const MS_MINUTO = 60_000
const LIMITE_DE_DIAS = 3_700

const formatadores = new Map<string, Intl.DateTimeFormat>()
function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatadores.set(fuso, f)
  }
  return f
}

interface DataLocal {
  ano: number
  mes: number
  dia: number
}

function partes(instante: Date, fuso: string) {
  const mapa: Record<string, number> = {}
  for (const p of formatador(fuso).formatToParts(instante)) {
    if (p.type !== 'literal') mapa[p.type] = Number(p.value)
  }
  return mapa as {
    year: number
    month: number
    day: number
    hour: number
    minute: number
    second: number
  }
}

/** Dia (no fuso) em que o instante cai. */
export function dataLocal(instante: Date, fuso: string): DataLocal {
  const p = partes(instante, fuso)
  return { ano: p.year, mes: p.month, dia: p.day }
}

/** Deslocamento do fuso em relação ao UTC, em ms, no instante dado. */
function deslocamento(instante: Date, fuso: string): number {
  const p = partes(instante, fuso)
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000
}

/** O instante em que o relógio do fuso marca `dia` às `minutosDoDia` (0 a 1440). */
export function instanteLocal(dia: DataLocal, minutosDoDia: number, fuso: string): Date {
  const alvo = Date.UTC(dia.ano, dia.mes - 1, dia.dia, 0, minutosDoDia)
  let chute = alvo - deslocamento(new Date(alvo), fuso)
  // Na virada do horário de verão o primeiro chute pode errar por uma hora: confere de novo
  chute = alvo - deslocamento(new Date(chute), fuso)
  return new Date(chute)
}

const minutosDe = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))
const doisDigitos = (n: number) => String(n).padStart(2, '0')

function proximoDia(d: DataLocal): DataLocal {
  const t = new Date(Date.UTC(d.ano, d.mes - 1, d.dia + 1))
  return { ano: t.getUTCFullYear(), mes: t.getUTCMonth() + 1, dia: t.getUTCDate() }
}

const diaDaSemana = (d: DataLocal) => new Date(Date.UTC(d.ano, d.mes - 1, d.dia)).getUTCDay()

function ehFeriado(d: DataLocal, cal: CalendarioUtil): boolean {
  const exata = `${d.ano}-${doisDigitos(d.mes)}-${doisDigitos(d.dia)}`
  const mesDia = exata.slice(5)
  return cal.feriados.some((f) => (f.recorrente ? f.data.slice(5) === mesDia : f.data === exata))
}

/** As janelas de expediente do dia, em instantes, na ordem. Feriado = nenhuma. */
function janelasDoDia(d: DataLocal, cal: CalendarioUtil): { inicio: Date; fim: Date }[] {
  if (ehFeriado(d, cal)) return []
  const dia = diaDaSemana(d)
  return cal.faixas
    .filter((f) => f.diaSemana === dia)
    .sort((a, b) => a.inicio.localeCompare(b.inicio))
    .map((f) => ({
      inicio: instanteLocal(d, minutosDe(f.inicio), cal.fusoHorario),
      fim: instanteLocal(d, minutosDe(f.fim), cal.fusoHorario),
    }))
}

/** Há expediente configurado? Sem ele, não há como contar prazo em horas úteis. */
export const temExpediente = (cal: CalendarioUtil): boolean => cal.faixas.length > 0

/** Minutos de expediente entre dois instantes (pode ser fracionário). */
export function minutosUteisEntre(de: Date, ate: Date, cal: CalendarioUtil): number {
  if (ate.getTime() <= de.getTime() || !temExpediente(cal)) return 0
  let total = 0
  let dia = dataLocal(de, cal.fusoHorario)
  const ultimo = dataLocal(ate, cal.fusoHorario)
  for (let i = 0; i < LIMITE_DE_DIAS; i += 1) {
    for (const j of janelasDoDia(dia, cal)) {
      const inicio = Math.max(j.inicio.getTime(), de.getTime())
      const fim = Math.min(j.fim.getTime(), ate.getTime())
      if (fim > inicio) total += (fim - inicio) / MS_MINUTO
    }
    if (dia.ano === ultimo.ano && dia.mes === ultimo.mes && dia.dia === ultimo.dia) break
    dia = proximoDia(dia)
  }
  return total
}

/** Soma `minutos` de expediente a partir de `inicio`. Nulo se não há expediente que chegue. */
export function adicionarMinutosUteis(
  inicio: Date,
  minutos: number,
  cal: CalendarioUtil,
): Date | null {
  if (minutos <= 0) return inicio
  if (!temExpediente(cal)) return null
  let restante = minutos
  let dia = dataLocal(inicio, cal.fusoHorario)
  for (let i = 0; i < LIMITE_DE_DIAS; i += 1) {
    for (const j of janelasDoDia(dia, cal)) {
      const de = Math.max(j.inicio.getTime(), inicio.getTime())
      if (de >= j.fim.getTime()) continue
      const disponivel = (j.fim.getTime() - de) / MS_MINUTO
      if (restante <= disponivel) return new Date(de + restante * MS_MINUTO)
      restante -= disponivel
    }
    dia = proximoDia(dia)
  }
  return null
}

/** Soma os minutos úteis de vários intervalos (os trechos em que o prazo correu). */
export function minutosUteisDosIntervalos(
  intervalos: readonly { de: Date; ate: Date }[],
  cal: CalendarioUtil,
): number {
  return intervalos.reduce((soma, i) => soma + minutosUteisEntre(i.de, i.ate, cal), 0)
}

/** Expediente padrão: segunda a sexta, 8h às 18h (os feriados vêm do cadastro da empresa). */
export const EXPEDIENTE_PADRAO: Pick<CalendarioUtil, 'faixas'> = {
  faixas: [1, 2, 3, 4, 5].map((diaSemana) => ({ diaSemana, inicio: '08:00', fim: '18:00' })),
}

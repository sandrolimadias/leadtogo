import { z } from 'zod'

import { contaComoSchema, corDeTagSchema } from './cadastros.js'
import { porPaginaSchema } from './paginacao.js'

// Atividades (Módulo 5): regras de data e fuso, schemas de entrada e saída de /v1/carteira/atividades.
// Especificação: docs/funcionalidades.md (seção 5) e docs/escopo_mvp.md (Módulo 5).

// ---------- Fuso e datas (regras puras, usadas pela API e pelo web) ----------

/** Fuso padrão da empresa (`tenant_configuracoes.fuso_horario`): "hoje" e "atrasada" nunca valem em UTC. */
export const FUSO_PADRAO = 'America/Sao_Paulo'

/**
 * Quanto uma atividade realizada pode estar à frente do relógio do servidor: o celular de quem registra
 * pode estar um pouco adiantado. Passou disso, a API recusa (`atividade_no_futuro`).
 */
export const TOLERANCIA_RELOGIO_MINUTOS = 5

export function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fuso })
    return true
  } catch {
    return false
  }
}

/** O dia (AAAA-MM-DD) em que o instante cai no fuso. */
export function diaNoFuso(instante: Date | string, fuso: string = FUSO_PADRAO): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instante))
}

/** Quanto o fuso está à frente de UTC naquele instante, em milissegundos (negativo a oeste). */
function deslocamentoDoFuso(instante: number, fuso: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(new Date(instante))
      .map((x) => [x.type, Number(x.value)]),
  ) as Record<string, number>
  const comoUtc = Date.UTC(
    p['year']!,
    p['month']! - 1,
    p['day'],
    p['hour'],
    p['minute'],
    p['second'],
  )
  return comoUtc - Math.floor(instante / 1000) * 1000
}

/** O instante da meia-noite (início) do dia AAAA-MM-DD no fuso. */
export function inicioDoDiaNoFuso(dia: string, fuso: string = FUSO_PADRAO): Date {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number]
  const nominal = Date.UTC(a, m - 1, d)
  let instante = nominal - deslocamentoDoFuso(nominal, fuso)
  // Ajuste fino quando o deslocamento muda (horário de verão) entre o palpite e o instante real
  const depois = deslocamentoDoFuso(instante, fuso)
  if (nominal - depois !== instante) instante = nominal - depois
  return new Date(instante)
}

export const situacaoDaAtividadeSchema = z.enum([
  'pendente',
  'em_execucao',
  'realizada',
  'cancelada',
])
export type SituacaoDaAtividade = z.infer<typeof situacaoDaAtividadeSchema>

/** Aberta = ainda por fazer (pendente ou em execução). */
export const estaAberta = (situacao: SituacaoDaAtividade): boolean =>
  situacao === 'pendente' || situacao === 'em_execucao'

/**
 * Atrasada (calculada, nunca gravada): aberta e com a data já passada. Atividade de dia inteiro só
 * atrasa quando o DIA acabou no fuso da empresa (a de hoje ainda não está atrasada).
 */
export function estaAtrasada(
  a: { situacao: SituacaoDaAtividade; dataInicio: Date | string; diaInteiro: boolean },
  agora: Date,
  fuso: string = FUSO_PADRAO,
): boolean {
  if (!estaAberta(a.situacao)) return false
  if (a.diaInteiro) return diaNoFuso(a.dataInicio, fuso) < diaNoFuso(agora, fuso)
  return new Date(a.dataInicio).getTime() < agora.getTime()
}

/** Uma data de atividade realizada passa da tolerância do relógio (está no futuro de verdade). */
export function estaNoFuturo(data: Date | string, agora: Date): boolean {
  return new Date(data).getTime() > agora.getTime() + TOLERANCIA_RELOGIO_MINUTOS * 60_000
}

// ---------- Entrada ----------

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()

const dataEHora = z.iso.datetime({ offset: true })

export const ABAS_DE_ATIVIDADES = ['agendadas', 'atrasadas', 'realizadas'] as const
export const abaDeAtividadesSchema = z.enum(ABAS_DE_ATIVIDADES)
export type AbaDeAtividades = z.infer<typeof abaDeAtividadesSchema>

/**
 * As janelas do Dashboard (sem sobreposição com as abas): `hoje` = abertas de hoje que ainda não venceram
 * (mais as de dia inteiro de hoje); `proximos7` = abertas de amanhã até daqui a 7 dias. "Atrasadas" é a aba
 * de sempre. Todas no fuso da empresa.
 */
export const JANELAS_DO_DASHBOARD = ['hoje', 'proximos7'] as const
export const abaDaConsultaSchema = z.enum([...ABAS_DE_ATIVIDADES, ...JANELAS_DO_DASHBOARD])
export type AbaDaConsulta = z.infer<typeof abaDaConsultaSchema>

export const origemDaAtividadeSchema = z.enum([
  'manual',
  'whatsapp',
  'email',
  'agenda',
  'api',
  'recorrencia',
])

/**
 * Registrar atividade. A situação da criação é Realizada ("já aconteceu", com resultado) ou Pendente
 * ("agendar"). Realizada: `dataInicio` é QUANDO aconteceu e não passa de 5 minutos no futuro.
 */
export const criarAtividadeSchema = z
  .object({
    tipoAtividadeId: z.uuid(),
    titulo: z.string().trim().min(1, 'informe o título').max(200),
    /** Obrigatória, exceto no tipo Tarefa */
    empresaId: z.uuid().nullable().optional(),
    /** Um contato da empresa */
    contatoId: z.uuid().nullable().optional(),
    /** Uma oportunidade da empresa (opcional) */
    oportunidadeId: z.uuid().nullable().optional(),
    /** Quem executa; sem ele, o próprio usuário. O vendedor só escolhe a si mesmo */
    responsavelId: z.uuid().optional(),
    dataInicio: dataEHora,
    dataFim: dataEHora.nullable().optional(),
    diaInteiro: z.boolean().default(false),
    situacao: z.enum(['pendente', 'realizada']).default('realizada'),
    /** Obrigatório quando Realizada */
    resultado: texto(5000),
    importante: z.boolean().default(false),
    urgente: z.boolean().default(false),
    observacoes: texto(5000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.situacao === 'realizada' && !v.resultado) {
      ctx.addIssue({ code: 'custom', path: ['resultado'], message: 'informe o resultado' })
    }
    if (v.dataFim && new Date(v.dataFim) < new Date(v.dataInicio)) {
      ctx.addIssue({ code: 'custom', path: ['dataFim'], message: 'o fim vem depois do início' })
    }
  })
  .meta({ id: 'CriarAtividadeEntrada' })
export type CriarAtividade = z.output<typeof criarAtividadeSchema>
export type CriarAtividadeEntrada = z.input<typeof criarAtividadeSchema>

/**
 * Editar. Só o que vier muda. Numa atividade Realizada, `dataInicio` é a data em que aconteceu
 * (a data do fato, que alimenta última visita e último contato); `resultado` não pode ficar vazio.
 */
export const alterarAtividadeSchema = z
  .object({
    tipoAtividadeId: z.uuid(),
    titulo: z.string().trim().min(1, 'informe o título').max(200),
    empresaId: z.uuid().nullable(),
    contatoId: z.uuid().nullable(),
    oportunidadeId: z.uuid().nullable(),
    responsavelId: z.uuid(),
    dataInicio: dataEHora,
    dataFim: dataEHora.nullable(),
    diaInteiro: z.boolean(),
    resultado: texto(5000),
    importante: z.boolean(),
    urgente: z.boolean(),
    observacoes: texto(5000),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarAtividadeEntrada' })
export type AlterarAtividade = z.output<typeof alterarAtividadeSchema>
export type AlterarAtividadeEntrada = z.input<typeof alterarAtividadeSchema>

/** Concluir uma atividade aberta: o resultado é obrigatório; sem `realizadaEm`, vale agora. */
export const concluirAtividadeSchema = z
  .object({
    resultado: z.string().trim().min(1, 'informe o resultado').max(5000),
    realizadaEm: dataEHora.optional(),
  })
  .strict()
  .meta({ id: 'ConcluirAtividadeEntrada' })
export type ConcluirAtividade = z.output<typeof concluirAtividadeSchema>
export type ConcluirAtividadeEntrada = z.input<typeof concluirAtividadeSchema>

export const consultaDeAtividadesSchema = z
  .object({
    /** Sem aba, a linha do tempo (as abertas primeiro, depois o histórico) */
    aba: abaDaConsultaSchema.optional(),
    empresaId: z.uuid().optional(),
    contatoId: z.uuid().optional(),
    oportunidadeId: z.uuid().optional(),
    tipoAtividadeId: z.uuid().optional(),
    responsavelId: z.uuid().optional(),
    /** Só as do usuário (responsável) */
    minhas: z.enum(['true', 'false']).default('false'),
    /** Título, empresa ou contato; sem acento nem diferença de caixa */
    busca: z
      .string()
      .trim()
      .max(100)
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: porPaginaSchema(),
  })
  .strict()
export type ConsultaDeAtividades = z.output<typeof consultaDeAtividadesSchema>
export type ConsultaDeAtividadesEntrada = z.input<typeof consultaDeAtividadesSchema>

// ---------- Saída ----------

export const atividadeSchema = z
  .object({
    id: z.uuid(),
    tipo: z.object({
      id: z.uuid(),
      nome: z.string(),
      icone: z.string(),
      cor: corDeTagSchema,
      contaComo: contaComoSchema,
    }),
    titulo: z.string(),
    empresa: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    contato: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    oportunidade: z.object({ id: z.uuid(), nome: z.string() }).nullable(),
    responsavel: z.object({ id: z.uuid(), nome: z.string() }),
    dataInicio: z.string(),
    dataFim: z.string().nullable(),
    diaInteiro: z.boolean(),
    situacao: situacaoDaAtividadeSchema,
    /** Calculada no fuso da empresa: aberta e com a data passada */
    atrasada: z.boolean(),
    realizadaEm: z.string().nullable(),
    resultado: z.string().nullable(),
    importante: z.boolean(),
    urgente: z.boolean(),
    observacoes: z.string().nullable(),
    origem: origemDaAtividadeSchema,
    criadaEm: z.string(),
    /** O usuário pode editar, concluir, cancelar e excluir */
    editavel: z.boolean(),
  })
  .meta({ id: 'Atividade' })
export type Atividade = z.infer<typeof atividadeSchema>

export const listaDeAtividadesSchema = z
  .object({
    itens: z.array(atividadeSchema),
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
    /** Contagem de cada aba com os mesmos filtros (menos a aba) */
    contagens: z.object({
      agendadas: z.number().int(),
      atrasadas: z.number().int(),
      realizadas: z.number().int(),
      hoje: z.number().int(),
      proximos7: z.number().int(),
    }),
  })
  .meta({ id: 'ListaDeAtividades' })
export type ListaDeAtividades = z.infer<typeof listaDeAtividadesSchema>

import { z } from 'zod'

import { corDeTagSchema } from './cadastros.js'
import { porPaginaSchema } from './paginacao.js'

// Oportunidades (Módulo 6): schemas de entrada e saída de /v1/carteira/oportunidades.
// Especificação: docs/funcionalidades.md (seção 7) e docs/escopo_mvp.md (Módulo 6).

/** Duração padrão do valor mensal, em meses, quando há valor mensal e nenhuma duração foi dita. */
export const MESES_PADRAO = 12
export const MESES_MAXIMOS = 600
/** Teto de cada valor digitado (R$): o total (único + mensal × meses) cabe com folga em numeric(15,2). */
export const VALOR_MAXIMO = 1_000_000_000

export const statusDaOportunidadeSchema = z.enum([
  'ativo',
  'conquistado',
  'perdido',
  'cancelado',
  'suspenso',
])
export type StatusDaOportunidade = z.infer<typeof statusDaOportunidadeSchema>

/** Os status de fechamento (qualquer um que não seja Ativo). */
export const statusDeFechamentoSchema = z.enum(['conquistado', 'perdido', 'cancelado', 'suspenso'])
export type StatusDeFechamento = z.infer<typeof statusDeFechamentoSchema>

/** Os motivos são obrigatórios em todo fechamento, exceto Conquistado. */
export const exigeMotivo = (status: StatusDeFechamento): boolean => status !== 'conquistado'

export const ROTULO_DO_STATUS: Record<StatusDaOportunidade, string> = {
  ativo: 'Ativa',
  conquistado: 'Conquistada',
  perdido: 'Perdida',
  cancelado: 'Cancelada',
  suspenso: 'Suspensa',
}

const centavos = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6

/** Dinheiro digitado: de 0 até o teto, com até 2 casas. */
export const dinheiroSchema = z
  .number()
  .min(0, 'não pode ser negativo')
  .max(VALOR_MAXIMO, 'valor alto demais')
  .refine(centavos, 'use até 2 casas decimais')

const mesesSchema = z.number().int().min(0).max(MESES_MAXIMOS)

/** Total = único + mensal × meses. A conta que o banco faz (coluna gerada), repetida só para mostrar na hora, no formulário. */
export const totalDaOportunidade = (unico: number, mensal: number, meses: number): number =>
  Math.round((unico + mensal * meses) * 100) / 100

/** Ponderado = total × probabilidade (%). */
export const ponderadoDaOportunidade = (total: number, probabilidade: number): number =>
  Math.round(total * probabilidade) / 100

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()

const dia = z.iso.date()

/**
 * Nova oportunidade. Sem funil, vale o funil padrão; sem fase, a primeira fase ativa dele; sem responsável,
 * o vendedor da empresa. Sem `meses` e com valor mensal, valem 12. Sem `probabilidade`, vale a da fase.
 */
export const criarOportunidadeSchema = z
  .object({
    titulo: z.string().trim().min(1, 'informe o nome da oportunidade').max(200),
    empresaId: z.uuid(),
    /** Contato principal, só da empresa escolhida */
    contatoId: z.uuid().nullable().optional(),
    solucaoId: z.uuid().nullable().optional(),
    origemId: z.uuid().nullable().optional(),
    funilId: z.uuid().optional(),
    faseId: z.uuid().optional(),
    responsavelId: z.uuid().optional(),
    valorUnico: dinheiroSchema.default(0),
    valorMensal: dinheiroSchema.default(0),
    meses: mesesSchema.optional(),
    probabilidade: z.number().int().min(0).max(100).optional(),
    /** Opcional: sem data é "sem previsão" e fica fora da previsão do mês */
    dataPrevistaFechamento: dia.nullable().optional(),
    observacoes: texto(5000),
    /** Id da oportunidade de que esta é cópia ("Duplicar"): só vai para a auditoria, nada é copiado por ele */
    duplicadaDeId: z.uuid().optional(),
  })
  .strict()
  .meta({ id: 'CriarOportunidadeEntrada' })
export type CriarOportunidade = z.output<typeof criarOportunidadeSchema>
export type CriarOportunidadeEntrada = z.input<typeof criarOportunidadeSchema>

/** Editar (só o que vier muda). Fase e status mudam por `mover` e `fechar`. */
export const alterarOportunidadeSchema = z
  .object({
    titulo: z.string().trim().min(1, 'informe o nome da oportunidade').max(200),
    contatoId: z.uuid().nullable(),
    solucaoId: z.uuid().nullable(),
    origemId: z.uuid().nullable(),
    responsavelId: z.uuid(),
    valorUnico: dinheiroSchema,
    valorMensal: dinheiroSchema,
    meses: mesesSchema,
    probabilidade: z.number().int().min(0).max(100),
    dataPrevistaFechamento: dia.nullable(),
    observacoes: texto(5000),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarOportunidadeEntrada' })
export type AlterarOportunidade = z.output<typeof alterarOportunidadeSchema>
export type AlterarOportunidadeEntrada = z.input<typeof alterarOportunidadeSchema>

export const moverOportunidadeSchema = z
  .object({ faseId: z.uuid() })
  .strict()
  .meta({ id: 'MoverOportunidadeEntrada' })
export type MoverOportunidade = z.output<typeof moverOportunidadeSchema>

/**
 * Fechar: Conquistado, Perdido, Cancelado ou Suspenso. Perdido, Cancelado e Suspenso exigem o motivo (da
 * lista do status); Suspenso exige "retomar em", que cria a atividade de retomada nessa data. Conquistado
 * pode mudar a empresa para Cliente (`empresaViraCliente`; sem o campo, vale a configuração da empresa).
 */
export const fecharOportunidadeSchema = z
  .object({
    status: statusDeFechamentoSchema,
    motivoId: z.uuid().nullable().optional(),
    detalhe: texto(2000),
    retomarEm: dia.nullable().optional(),
    empresaViraCliente: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (exigeMotivo(v.status) && !v.motivoId) {
      ctx.addIssue({ code: 'custom', path: ['motivoId'], message: 'escolha o motivo' })
    }
    if (v.status === 'suspenso' && !v.retomarEm) {
      ctx.addIssue({ code: 'custom', path: ['retomarEm'], message: 'informe quando retomar' })
    }
  })
  .meta({ id: 'FecharOportunidadeEntrada' })
export type FecharOportunidade = z.output<typeof fecharOportunidadeSchema>
export type FecharOportunidadeEntrada = z.input<typeof fecharOportunidadeSchema>

// ---------- Consultas ----------

const textoDeBusca = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === '' ? undefined : v))
  .optional()

/** O Kanban de um funil (sem `funilId`, o funil padrão): só as oportunidades Ativas. */
export const consultaDoKanbanSchema = z
  .object({
    funilId: z.uuid().optional(),
    responsavelId: z.uuid().optional(),
    busca: textoDeBusca,
  })
  .strict()
export type ConsultaDoKanban = z.output<typeof consultaDoKanbanSchema>
export type ConsultaDoKanbanEntrada = z.input<typeof consultaDoKanbanSchema>

export const ORDENS_DE_OPORTUNIDADES = ['criada', 'titulo', 'total', 'previsao'] as const

export const consultaDeOportunidadesSchema = z
  .object({
    /** Sem status, todas (a lista simples) */
    status: statusDaOportunidadeSchema.optional(),
    funilId: z.uuid().optional(),
    faseId: z.uuid().optional(),
    empresaId: z.uuid().optional(),
    responsavelId: z.uuid().optional(),
    busca: textoDeBusca,
    motivoId: z.uuid().optional(),
    /** `perdas` = Perdidas e Canceladas (o que o Dashboard soma em "Perdidas e canceladas") */
    grupo: z.enum(['perdas']).optional(),
    /** Fechadas dentro do período (datas AAAA-MM-DD no fuso da empresa; o fim vale o dia todo) */
    fechadaDe: z.iso.date().optional(),
    fechadaAte: z.iso.date().optional(),
    ordem: z.enum(ORDENS_DE_OPORTUNIDADES).default('criada'),
    sentido: z.enum(['asc', 'desc']).default('desc'),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: porPaginaSchema(),
  })
  .strict()
export type ConsultaDeOportunidades = z.output<typeof consultaDeOportunidadesSchema>
export type ConsultaDeOportunidadesEntrada = z.input<typeof consultaDeOportunidadesSchema>

// ---------- Saída ----------

const referencia = z.object({ id: z.uuid(), nome: z.string() })

export const oportunidadeSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    empresa: referencia,
    contato: referencia.nullable(),
    solucao: referencia.nullable(),
    origem: referencia.nullable(),
    funil: referencia,
    fase: z.object({ id: z.uuid(), nome: z.string(), cor: corDeTagSchema }),
    status: statusDaOportunidadeSchema,
    /** A fase em que estava ao sair de Ativo */
    faseParouEm: z.object({ id: z.uuid(), nome: z.string(), cor: corDeTagSchema }).nullable(),
    motivo: referencia.nullable(),
    motivoDetalhe: z.string().nullable(),
    suspensaAte: z.string().nullable(),
    responsavel: referencia,
    valorUnico: z.number(),
    valorMensal: z.number(),
    meses: z.number().int(),
    /** Calculado pelo banco: único + mensal × meses */
    valorTotal: z.number(),
    /** Calculado pelo banco: total × probabilidade */
    valorPonderado: z.number(),
    probabilidade: z.number().int(),
    /** A pessoa editou a probabilidade à mão (mover de fase não a troca) */
    probabilidadeManual: z.boolean(),
    dataPrevistaFechamento: z.string().nullable(),
    dataFechamento: z.string().nullable(),
    faseDesde: z.string(),
    /** Dias na fase sem atividade (a contar da entrada na fase ou da última atividade realizada) */
    diasParada: z.number().int(),
    /** Ativa, com alerta configurado na fase e já passou dele */
    parada: z.boolean(),
    ultimaAtividadeEm: z.string().nullable(),
    proximaAtividade: z
      .object({
        id: z.uuid(),
        titulo: z.string(),
        em: z.string(),
        diaInteiro: z.boolean(),
        tipoIcone: z.string(),
        tipoCor: corDeTagSchema,
      })
      .nullable(),
    observacoes: z.string().nullable(),
    criadaEm: z.string(),
    /** O usuário pode editar, mover, fechar e reabrir (a empresa é da carteira dele) */
    editavel: z.boolean(),
    /** Só admin e gestor excluem */
    excluivel: z.boolean(),
    /** Configuração da empresa: ao conquistar, a empresa vira Cliente (o fechamento pode desligar) */
    empresaViraClientePadrao: z.boolean(),
  })
  .meta({ id: 'Oportunidade' })
export type Oportunidade = z.infer<typeof oportunidadeSchema>

export const entradaDoHistoricoDaOportunidadeSchema = z
  .object({
    id: z.uuid(),
    em: z.string(),
    por: referencia.nullable(),
    acao: z.enum(['criada', 'fase', 'status', 'reaberta']),
    /** Já em palavras: "Criada na fase Proposta", "Fase: Proposta → Negociação", "Perdida (Preço)"... */
    titulo: z.string(),
    detalhe: z.string().nullable(),
  })
  .meta({ id: 'EntradaDoHistoricoDaOportunidade' })

export const oportunidadeDetalhadaSchema = oportunidadeSchema
  .extend({ historico: z.array(entradaDoHistoricoDaOportunidadeSchema) })
  .meta({ id: 'OportunidadeDetalhada' })
export type OportunidadeDetalhada = z.infer<typeof oportunidadeDetalhadaSchema>

export const listaDeOportunidadesSchema = z
  .object({
    itens: z.array(oportunidadeSchema),
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
    /** Somas do que a consulta filtrou (todas as páginas) */
    somas: z.object({ total: z.number(), mensal: z.number(), ponderado: z.number() }),
  })
  .meta({ id: 'ListaDeOportunidades' })
export type ListaDeOportunidades = z.infer<typeof listaDeOportunidadesSchema>

/** Quantas oportunidades cada coluna do Kanban traz; o resto é só contado ("e mais N"). */
export const LIMITE_POR_FASE_NO_KANBAN = 100

export const kanbanSchema = z
  .object({
    funil: referencia,
    fases: z.array(
      z.object({
        id: z.uuid(),
        nome: z.string(),
        cor: corDeTagSchema,
        probabilidadePadrao: z.number().int(),
        diasAlertaParada: z.number().int().nullable(),
        quantidade: z.number().int(),
        total: z.number(),
        itens: z.array(oportunidadeSchema),
        /** Quantas ficaram de fora dos `itens` (passou do limite da coluna) */
        semMostrar: z.number().int(),
      }),
    ),
    resumo: z.object({
      ativas: z.number().int(),
      total: z.number(),
      mensal: z.number(),
      ponderado: z.number(),
    }),
    /** Quantas oportunidades Suspensas o funil tem (o botão "Suspensas · N") */
    suspensas: z.number().int(),
  })
  .meta({ id: 'KanbanDeOportunidades' })
export type KanbanDeOportunidades = z.infer<typeof kanbanSchema>

/** Mover de fase: a oportunidade e, se a probabilidade foi editada à mão, o aviso com a sugestão da nova fase. */
export const resultadoDoMovimentoSchema = z
  .object({
    oportunidade: oportunidadeSchema,
    avisoDeProbabilidade: z
      .object({ atual: z.number().int(), sugerida: z.number().int() })
      .nullable(),
  })
  .meta({ id: 'ResultadoDoMovimento' })
export type ResultadoDoMovimento = z.infer<typeof resultadoDoMovimentoSchema>

import { z } from 'zod'

// Central de chamados — configuração (Fase 2): áreas, triagem, expediente e feriados
// (docs/funcionalidades.md, seção 3E, e docs/modelagem_banco.md, "Chamados").

export const nomeDaAreaSchema = z
  .string()
  .trim()
  .min(1, 'informe o nome')
  .max(80, 'use até 80 caracteres')

/** Meta em minutos úteis; nula = sem meta e sem alerta de prazo. Até 90 dias úteis de 24 h. */
const metaSchema = z.number().int().min(1, 'use pelo menos 1 minuto').max(129_600).nullable()

export const membroDaAreaSchema = z
  .object({
    id: z.uuid(),
    membroId: z.uuid().nullable(),
    membroNome: z.string().nullable(),
    perfilId: z.uuid().nullable(),
    perfilNome: z.string().nullable(),
    /** Gestor da área: pode atribuir os chamados dela (só membro, nunca perfil) */
    gestor: z.boolean(),
  })
  .meta({ id: 'MembroDaArea' })
export type MembroDaArea = z.infer<typeof membroDaAreaSchema>

export const areaDeAtendimentoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    descricao: z.string().nullable(),
    visivelNoPortal: z.boolean(),
    metaRespostaMin: z.number().int().nullable(),
    metaResolucaoMin: z.number().int().nullable(),
    /** Com a triagem ligada, a área recebe o chamado direto */
    pulaTriagem: z.boolean(),
    ativa: z.boolean(),
    ordem: z.number().int(),
    /** Áreas padrão (juridico, financeiro, comercial, administrativo) */
    chaveSistema: z.string().nullable(),
    membros: z.array(membroDaAreaSchema),
    /** Chamados ainda abertos na área (quem tem uso só inativa) */
    chamadosAbertos: z.number().int(),
  })
  .meta({ id: 'AreaDeAtendimento' })
export type AreaDeAtendimento = z.infer<typeof areaDeAtendimentoSchema>

export const criarAreaSchema = z
  .object({
    nome: nomeDaAreaSchema,
    descricao: z.string().trim().max(500).nullable().optional(),
    visivelNoPortal: z.boolean().default(false),
    metaRespostaMin: metaSchema.default(null),
    metaResolucaoMin: metaSchema.default(null),
    pulaTriagem: z.boolean().default(false),
  })
  .strict()
  .meta({ id: 'CriarAreaEntrada' })
export type CriarAreaEntrada = z.infer<typeof criarAreaSchema>

export const alterarAreaSchema = z
  .object({
    nome: nomeDaAreaSchema,
    descricao: z.string().trim().max(500).nullable(),
    visivelNoPortal: z.boolean(),
    metaRespostaMin: metaSchema,
    metaResolucaoMin: metaSchema,
    pulaTriagem: z.boolean(),
    ativa: z.boolean(),
  })
  .partial()
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'informe ao menos um campo')
  .meta({ id: 'AlterarAreaEntrada' })
export type AlterarAreaEntrada = z.infer<typeof alterarAreaSchema>

/** Quem atende a área: troca a lista inteira (membros, com o gestor marcado, e perfis). */
export const definirMembrosDaAreaSchema = z
  .object({
    membros: z
      .array(z.object({ membroId: z.uuid(), gestor: z.boolean().default(false) }).strict())
      .max(200),
    perfilIds: z.array(z.uuid()).max(50),
  })
  .strict()
  .refine(
    (d) => new Set(d.membros.map((m) => m.membroId)).size === d.membros.length,
    'membro repetido',
  )
  .meta({ id: 'DefinirMembrosDaAreaEntrada' })
export type DefinirMembrosDaAreaEntrada = z.infer<typeof definirMembrosDaAreaSchema>

// ---- Triagem ----

export const configuracaoDeTriagemSchema = z
  .object({
    ativa: z.boolean(),
    perfilId: z.uuid().nullable(),
    perfilNome: z.string().nullable(),
    membros: z.array(z.object({ membroId: z.uuid(), nome: z.string() })),
  })
  .meta({ id: 'ConfiguracaoDeTriagem' })
export type ConfiguracaoDeTriagem = z.infer<typeof configuracaoDeTriagemSchema>

export const alterarTriagemSchema = z
  .object({
    ativa: z.boolean(),
    perfilId: z.uuid().nullable(),
    membroIds: z.array(z.uuid()).max(100),
  })
  .strict()
  .meta({ id: 'AlterarTriagemEntrada' })
export type AlterarTriagemEntrada = z.infer<typeof alterarTriagemSchema>

// ---- Expediente e feriados ----

export const DIAS_DA_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const

/** Hora do dia, `HH:MM` (24 h). */
export const horaDoExpedienteSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use o formato HH:MM')

export const faixaDeExpedienteSchema = z
  .object({
    /** 0 = domingo ... 6 = sábado */
    diaSemana: z.number().int().min(0).max(6),
    inicio: horaDoExpedienteSchema,
    fim: horaDoExpedienteSchema,
  })
  .strict()
  .refine((f) => f.fim > f.inicio, 'o fim precisa ser depois do início')
  .meta({ id: 'FaixaDeExpediente' })
export type FaixaDeExpediente = z.infer<typeof faixaDeExpedienteSchema>

/** Troca o expediente inteiro; faixas do mesmo dia não podem se sobrepor. Lista vazia = sem expediente. */
export const definirExpedienteSchema = z
  .object({ faixas: z.array(faixaDeExpedienteSchema).max(70) })
  .strict()
  .superRefine((d, ctx) => {
    const porDia = new Map<number, FaixaDeExpediente[]>()
    for (const f of d.faixas) porDia.set(f.diaSemana, [...(porDia.get(f.diaSemana) ?? []), f])
    for (const faixas of porDia.values()) {
      const ordenadas = [...faixas].sort((a, b) => a.inicio.localeCompare(b.inicio))
      for (let i = 1; i < ordenadas.length; i += 1) {
        if ((ordenadas[i]?.inicio ?? '') < (ordenadas[i - 1]?.fim ?? '')) {
          ctx.addIssue({ code: 'custom', message: 'as faixas do mesmo dia não podem se sobrepor' })
          return
        }
      }
    }
  })
  .meta({ id: 'DefinirExpedienteEntrada' })
export type DefinirExpedienteEntrada = z.infer<typeof definirExpedienteSchema>

export const feriadoSchema = z
  .object({
    id: z.uuid(),
    data: z.iso.date(),
    nome: z.string(),
    /** Vale todo ano no mesmo dia e mês */
    recorrente: z.boolean(),
  })
  .meta({ id: 'Feriado' })
export type Feriado = z.infer<typeof feriadoSchema>

export const expedienteSchema = z
  .object({
    faixas: z.array(faixaDeExpedienteSchema),
    feriados: z.array(feriadoSchema),
    /** Fuso da empresa (IANA), em que o expediente vale */
    fusoHorario: z.string(),
  })
  .meta({ id: 'Expediente' })
export type Expediente = z.infer<typeof expedienteSchema>

export const criarFeriadoSchema = z
  .object({
    data: z.iso.date(),
    nome: z.string().trim().min(1, 'informe o nome').max(80),
    recorrente: z.boolean().default(false),
  })
  .strict()
  .meta({ id: 'CriarFeriadoEntrada' })
export type CriarFeriadoEntrada = z.infer<typeof criarFeriadoSchema>

export const gerarFeriadosSchema = z
  .object({ ano: z.number().int().min(2024).max(2100) })
  .strict()
  .meta({ id: 'GerarFeriadosEntrada' })
export type GerarFeriadosEntrada = z.infer<typeof gerarFeriadosSchema>

import { z } from 'zod'

import { midiaDaPublicacaoSchema, midiaDoPortalSchema } from './midias.js'
import { TAMANHO_MAXIMO_DE_PAGINA } from './paginacao.js'

// Portal do cliente, Fase 3B: publicações (docs/plano_portal_cliente.md, seção 7). A equipe publica no feed;
// o cliente lê, reage, comenta e denuncia. Os formatos do cliente são listas de permissão (nada de quem reagiu,
// de empresa de outro cliente, de motivo de denúncia dos outros...).

export const TAMANHO_MAXIMO_DO_TITULO = 160
export const TAMANHO_MAXIMO_DA_PUBLICACAO = 10_000
export const TAMANHO_MAXIMO_DO_COMENTARIO = 1000
export const TAMANHO_MAXIMO_DO_MOTIVO_DE_OCULTAR = 300
export const MAXIMO_DE_EMPRESAS_NO_ALCANCE = 500
/** Quantas publicações de uma vez o cliente marca como lidas */
export const MAXIMO_DE_LEITURAS_POR_PEDIDO = 50

export const SITUACOES_DA_PUBLICACAO = ['rascunho', 'agendada', 'publicada'] as const
export const situacaoDaPublicacaoSchema = z
  .enum(SITUACOES_DA_PUBLICACAO)
  .meta({ id: 'SituacaoDaPublicacao' })
export type SituacaoDaPublicacao = z.infer<typeof situacaoDaPublicacaoSchema>
export const ROTULO_DA_SITUACAO_DA_PUBLICACAO: Record<SituacaoDaPublicacao, string> = {
  rascunho: 'Rascunho',
  agendada: 'Agendada',
  publicada: 'Publicada',
}

// Fase 4C: "tags" = só quem tem alguma das tags de contato escolhidas (vale para publicações, eventos,
// documentos e avisos, que usam este mesmo alcance)
export const ALCANCES_DA_PUBLICACAO = ['todos', 'empresas', 'tags'] as const
export const MAXIMO_DE_TAGS_NO_ALCANCE = 50
export const tagIdsDoAlcanceSchema = z.array(z.uuid()).max(MAXIMO_DE_TAGS_NO_ALCANCE)

/** Confere a lista que acompanha o alcance: empresas só em "empresas", tags só em "tags" (e obrigatórias neles). */
export function validarAudiencia(
  d: {
    alcance?: string | undefined
    empresaIds?: string[] | undefined
    tagIds?: string[] | undefined
  },
  ctx: z.RefinementCtx,
): void {
  const empresas = d.empresaIds?.length ?? 0
  const tags = d.tagIds?.length ?? 0
  if (d.alcance === 'empresas' && empresas === 0) {
    ctx.addIssue({ code: 'custom', path: ['empresaIds'], message: 'escolha ao menos uma empresa' })
  }
  if (d.alcance === 'tags' && tags === 0) {
    ctx.addIssue({ code: 'custom', path: ['tagIds'], message: 'escolha ao menos uma tag' })
  }
  if (d.alcance !== 'empresas' && empresas > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['empresaIds'],
      message: 'a lista de empresas só vale no alcance "empresas"',
    })
  }
  if (d.alcance !== 'tags' && tags > 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['tagIds'],
      message: 'a lista de tags só vale no alcance "tags"',
    })
  }
}

/** As tags do alcance, como a equipe vê no detalhe. */
export const tagDoAlcanceSchema = z.object({ id: z.uuid(), nome: z.string(), grupo: z.string() })
export const alcanceDaPublicacaoSchema = z
  .enum(ALCANCES_DA_PUBLICACAO)
  .meta({ id: 'AlcanceDaPublicacao' })
export type AlcanceDaPublicacao = z.infer<typeof alcanceDaPublicacaoSchema>

// "Apoiar" saiu na Fase 4A (só Curtir e Parabéns); o valor continua no enum do banco até a contração
export const TIPOS_DE_REACAO = ['curtir', 'parabens'] as const
export const tipoDeReacaoSchema = z.enum(TIPOS_DE_REACAO).meta({ id: 'TipoDeReacao' })
export type TipoDeReacao = z.infer<typeof tipoDeReacaoSchema>
export const ROTULO_DA_REACAO: Record<TipoDeReacao, string> = {
  curtir: 'Curtir',
  parabens: 'Parabéns',
}

export const MOTIVOS_DE_DENUNCIA = ['spam', 'ofensivo', 'outro'] as const
export const motivoDeDenunciaSchema = z.enum(MOTIVOS_DE_DENUNCIA).meta({ id: 'MotivoDeDenuncia' })
export type MotivoDeDenuncia = z.infer<typeof motivoDeDenunciaSchema>
export const ROTULO_DO_MOTIVO_DE_DENUNCIA: Record<MotivoDeDenuncia, string> = {
  spam: 'Propaganda ou spam',
  ofensivo: 'Ofensivo',
  outro: 'Outro motivo',
}

const reacoesSchema = z.object({
  curtir: z.number().int().nonnegative(),
  parabens: z.number().int().nonnegative(),
})

// ---------------------------------------------------------------------------------------- equipe (CRM)

export const metricasDaPublicacaoSchema = z
  .object({
    /** Pessoas que leram / pessoas com acesso ativo dentro do alcance */
    leitores: z.number().int().nonnegative(),
    alvo: z.number().int().nonnegative(),
    empresasAlcancadas: z.number().int().nonnegative(),
    reacoes: reacoesSchema,
    comentarios: z.number().int().nonnegative(),
    comentariosOcultos: z.number().int().nonnegative(),
    denunciasAbertas: z.number().int().nonnegative(),
  })
  .meta({ id: 'MetricasDaPublicacao' })
export type MetricasDaPublicacao = z.infer<typeof metricasDaPublicacaoSchema>

export const itemDePublicacaoSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    situacao: situacaoDaPublicacaoSchema,
    alcance: alcanceDaPublicacaoSchema,
    fixada: z.boolean(),
    agendadaPara: z.iso.datetime({ offset: true }).nullable(),
    publicadaEm: z.iso.datetime({ offset: true }).nullable(),
    atualizadoEm: z.iso.datetime({ offset: true }),
    comentariosBloqueados: z.boolean(),
    metricas: metricasDaPublicacaoSchema,
  })
  .meta({ id: 'ItemDePublicacao' })
export type ItemDePublicacao = z.infer<typeof itemDePublicacaoSchema>

export const publicacaoSchema = itemDePublicacaoSchema
  .extend({
    corpo: z.string(),
    autorNome: z.string().nullable(),
    criadoEm: z.iso.datetime({ offset: true }),
    empresas: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    tags: z.array(tagDoAlcanceSchema),
    /** Imagens e vídeo (Fase 4D), na ordem */
    midias: z.array(midiaDaPublicacaoSchema),
  })
  .meta({ id: 'Publicacao' })
export type Publicacao = z.infer<typeof publicacaoSchema>

export const ABAS_DE_PUBLICACOES = ['todas', 'publicadas', 'agendadas', 'rascunhos'] as const
export const consultaDePublicacoesSchema = z
  .object({
    aba: z.enum(ABAS_DE_PUBLICACOES).default('todas'),
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_DE_PAGINA).default(25),
  })
  .strict()
export type ConsultaDePublicacoes = z.infer<typeof consultaDePublicacoesSchema>

export const listaDePublicacoesSchema = z
  .object({
    itens: z.array(itemDePublicacaoSchema),
    total: z.number().int().nonnegative(),
    abas: z.object({
      todas: z.number().int().nonnegative(),
      publicadas: z.number().int().nonnegative(),
      agendadas: z.number().int().nonnegative(),
      rascunhos: z.number().int().nonnegative(),
    }),
    /** Denúncias de comentários ainda sem tratamento, na empresa toda (o aviso vermelho da lista) */
    denunciasAbertas: z.number().int().nonnegative(),
  })
  .meta({ id: 'ListaDePublicacoes' })
export type ListaDePublicacoes = z.infer<typeof listaDePublicacoesSchema>

const tituloSchema = z
  .string()
  .trim()
  .min(3, 'informe o título')
  .max(TAMANHO_MAXIMO_DO_TITULO, `no máximo ${TAMANHO_MAXIMO_DO_TITULO} caracteres`)
const corpoSchema = z
  .string()
  .trim()
  .min(1, 'escreva o texto')
  .max(TAMANHO_MAXIMO_DA_PUBLICACAO, `no máximo ${TAMANHO_MAXIMO_DA_PUBLICACAO} caracteres`)

const camposDaPublicacao = {
  titulo: tituloSchema,
  corpo: corpoSchema,
  alcance: alcanceDaPublicacaoSchema,
  /** Só no alcance "empresas" (e obrigatório nele) */
  empresaIds: z.array(z.uuid()).max(MAXIMO_DE_EMPRESAS_NO_ALCANCE).default([]),
  /** Só no alcance "tags" (e obrigatório nele): tags de contato; basta ter uma */
  tagIds: tagIdsDoAlcanceSchema.default([]),
  /** O que fazer ao salvar: guardar rascunho, publicar agora ou agendar (exige `agendadaPara`) */
  situacao: situacaoDaPublicacaoSchema,
  agendadaPara: z.iso.datetime({ offset: true }).nullable().default(null),
}

const validarAlcanceEAgenda = (
  d: {
    alcance?: string
    empresaIds?: string[]
    tagIds?: string[]
    situacao?: string
    agendadaPara?: string | null
  },
  ctx: z.RefinementCtx,
) => {
  validarAudiencia(d, ctx)
  if (d.situacao === 'agendada' && !d.agendadaPara) {
    ctx.addIssue({ code: 'custom', path: ['agendadaPara'], message: 'informe quando publicar' })
  }
  if (d.situacao !== 'agendada' && d.agendadaPara) {
    ctx.addIssue({
      code: 'custom',
      path: ['agendadaPara'],
      message: 'a data só vale para publicação agendada',
    })
  }
}

export const salvarPublicacaoSchema = z
  .object(camposDaPublicacao)
  .strict()
  .superRefine(validarAlcanceEAgenda)
  .meta({ id: 'SalvarPublicacaoEntrada' })
export type SalvarPublicacaoEntrada = z.infer<typeof salvarPublicacaoSchema>

export const fixarPublicacaoSchema = z
  .object({ fixada: z.boolean() })
  .strict()
  .meta({ id: 'FixarPublicacaoEntrada' })
export type FixarPublicacaoEntrada = z.infer<typeof fixarPublicacaoSchema>

export const bloquearComentariosSchema = z
  .object({ bloqueados: z.boolean() })
  .strict()
  .meta({ id: 'BloquearComentariosEntrada' })
export type BloquearComentariosEntrada = z.infer<typeof bloquearComentariosSchema>

export const comentarioParaModeracaoSchema = z
  .object({
    id: z.uuid(),
    autorNome: z.string(),
    empresaNome: z.string(),
    corpo: z.string(),
    criadoEm: z.iso.datetime({ offset: true }),
    oculto: z.boolean(),
    ocultoMotivo: z.string().nullable(),
    ocultoPorNome: z.string().nullable(),
    denunciasAbertas: z.number().int().nonnegative(),
    /** Motivo mais citado nas denúncias abertas */
    motivoDaDenuncia: motivoDeDenunciaSchema.nullable(),
  })
  .meta({ id: 'ComentarioParaModeracao' })
export type ComentarioParaModeracao = z.infer<typeof comentarioParaModeracaoSchema>

export const listaDeComentariosParaModeracaoSchema = z
  .object({ itens: z.array(comentarioParaModeracaoSchema) })
  .meta({ id: 'ListaDeComentariosParaModeracao' })
export type ListaDeComentariosParaModeracao = z.infer<typeof listaDeComentariosParaModeracaoSchema>

/** Manter dispensa as denúncias; Ocultar esconde dos outros clientes (com motivo, sem apagar); Reexibir desfaz. */
export const moderarComentarioSchema = z
  .object({
    acao: z.enum(['manter', 'ocultar', 'reexibir']),
    motivo: z.string().trim().min(1).max(TAMANHO_MAXIMO_DO_MOTIVO_DE_OCULTAR).optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.acao === 'ocultar' && !d.motivo) {
      ctx.addIssue({ code: 'custom', path: ['motivo'], message: 'informe o motivo de ocultar' })
    }
  })
  .meta({ id: 'ModerarComentarioEntrada' })
export type ModerarComentarioEntrada = z.infer<typeof moderarComentarioSchema>

// -------------------------------------------------------------------------------------------- cliente

export const publicacaoDoPortalSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    corpo: z.string(),
    publicadaEm: z.iso.datetime({ offset: true }),
    fixada: z.boolean(),
    /** Totais de todas as empresas-clientes (nunca quem reagiu) */
    reacoes: reacoesSchema,
    minhasReacoes: z.array(tipoDeReacaoSchema),
    /** Comentários visíveis */
    comentarios: z.number().int().nonnegative(),
    comentariosAbertos: z.boolean(),
    /** Imagens limpas e vídeo (Fase 4D) */
    midias: z.array(midiaDoPortalSchema),
  })
  .meta({ id: 'PublicacaoDoPortal' })
export type PublicacaoDoPortal = z.infer<typeof publicacaoDoPortalSchema>

export const consultaDoFeedSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict()
export type ConsultaDoFeed = z.infer<typeof consultaDoFeedSchema>

export const feedDoPortalSchema = z
  .object({
    itens: z.array(publicacaoDoPortalSchema),
    total: z.number().int().nonnegative(),
  })
  .meta({ id: 'FeedDoPortal' })
export type FeedDoPortal = z.infer<typeof feedDoPortalSchema>

export const comentarioDoPortalSchema = z
  .object({
    id: z.uuid(),
    /** "Nome S.": o cliente nunca vê o nome completo nem a empresa de outro cliente */
    autorNome: z.string(),
    corpo: z.string(),
    criadoEm: z.iso.datetime({ offset: true }),
    meu: z.boolean(),
    /** Só o autor vê o próprio comentário oculto, com o motivo */
    oculto: z.boolean(),
    ocultoMotivo: z.string().nullable(),
    /** Já denunciei */
    denunciado: z.boolean(),
  })
  .meta({ id: 'ComentarioDoPortal' })
export type ComentarioDoPortal = z.infer<typeof comentarioDoPortalSchema>

export const listaDeComentariosDoPortalSchema = z
  .object({ itens: z.array(comentarioDoPortalSchema), comentariosAbertos: z.boolean() })
  .meta({ id: 'ListaDeComentariosDoPortal' })
export type ListaDeComentariosDoPortal = z.infer<typeof listaDeComentariosDoPortalSchema>

export const comentarNoPortalSchema = z
  .object({
    corpo: z
      .string()
      .trim()
      .min(1, 'escreva o comentário')
      .max(TAMANHO_MAXIMO_DO_COMENTARIO, `no máximo ${TAMANHO_MAXIMO_DO_COMENTARIO} caracteres`),
  })
  .strict()
  .meta({ id: 'ComentarNoPortalEntrada' })
export type ComentarNoPortalEntrada = z.infer<typeof comentarNoPortalSchema>

export const reagirNoPortalSchema = z
  .object({ tipo: tipoDeReacaoSchema })
  .strict()
  .meta({ id: 'ReagirNoPortalEntrada' })
export type ReagirNoPortalEntrada = z.infer<typeof reagirNoPortalSchema>

export const reacoesDaPublicacaoSchema = z
  .object({ reacoes: reacoesSchema, minhasReacoes: z.array(tipoDeReacaoSchema) })
  .meta({ id: 'ReacoesDaPublicacao' })
export type ReacoesDaPublicacao = z.infer<typeof reacoesDaPublicacaoSchema>

export const denunciarNoPortalSchema = z
  .object({ motivo: motivoDeDenunciaSchema })
  .strict()
  .meta({ id: 'DenunciarNoPortalEntrada' })
export type DenunciarNoPortalEntrada = z.infer<typeof denunciarNoPortalSchema>

export const marcarLeiturasSchema = z
  .object({ ids: z.array(z.uuid()).min(1).max(MAXIMO_DE_LEITURAS_POR_PEDIDO) })
  .strict()
  .meta({ id: 'MarcarLeiturasEntrada' })
export type MarcarLeiturasEntrada = z.infer<typeof marcarLeiturasSchema>

import { z } from 'zod'

import { origemGeoSchema, precisaoGeoSchema } from './geolocalizacao.js'

// Mapa (G2): contratos da API entre o web e a API (docs/plano_geolocalizacao.md, seção 4).

/**
 * A paleta de cores dos pins (docs/design_system.md, seção Mapa): 12 cores dos tokens, com contraste
 * garantido no tema claro e no escuro (o web lê o token do tema que está valendo). O admin escolhe uma
 * por estado da legenda; nunca uma cor livre.
 */
export const PALETA_DO_MAPA = [
  { chave: 'verde', rotulo: 'Verde', token: '--tag-green-fg' },
  { chave: 'azul', rotulo: 'Azul', token: '--tag-blue-fg' },
  { chave: 'ambar', rotulo: 'Âmbar', token: '--tag-amber-fg' },
  { chave: 'laranja', rotulo: 'Laranja', token: '--tag-orange-fg' },
  { chave: 'vermelho', rotulo: 'Vermelho', token: '--tag-red-fg' },
  { chave: 'rosa', rotulo: 'Rosa', token: '--tag-pink-fg' },
  { chave: 'roxo', rotulo: 'Roxo', token: '--tag-purple-fg' },
  { chave: 'indigo', rotulo: 'Índigo', token: '--tag-indigo-fg' },
  { chave: 'verde-agua', rotulo: 'Verde-água', token: '--tag-teal-fg' },
  { chave: 'cinza', rotulo: 'Cinza', token: '--tag-gray-fg' },
  { chave: 'alerta', rotulo: 'Alerta', token: '--danger' },
  { chave: 'destaque', rotulo: 'Destaque', token: '--accent' },
] as const
export type CorDoMapa = (typeof PALETA_DO_MAPA)[number]['chave']
export const CORES_DO_MAPA = PALETA_DO_MAPA.map((c) => c.chave) as [CorDoMapa, ...CorDoMapa[]]
export const corDoMapaSchema = z.enum(CORES_DO_MAPA)

/** A cor da paleta que corresponde a cada cor de tag (a padrão da legenda para as tags de Status). */
export const COR_DO_MAPA_DA_TAG: Record<string, CorDoMapa> = {
  gray: 'cinza',
  red: 'vermelho',
  orange: 'laranja',
  amber: 'ambar',
  green: 'verde',
  teal: 'verde-agua',
  blue: 'azul',
  indigo: 'indigo',
  purple: 'roxo',
  pink: 'rosa',
}

export const tokenDaCorDoMapa = (cor: string): string =>
  PALETA_DO_MAPA.find((c) => c.chave === cor)?.token ?? '--accent'

/** Estados fixos da legenda (além de uma entrada por tag de Status que aparece no mapa). */
export const CHAVE_VISITA_TENTADA = 'visita_tentada'
export const CHAVE_SEM_VISITA = 'sem_visita'
/** "Sem visita há 60+ dias": o limite do estado (só empresas da carteira). */
export const DIAS_SEM_VISITA_DO_ESTADO = 60
export const chaveDaTagNaLegenda = (tagId: string) => `tag:${tagId}`

export const entradaDaLegendaSchema = z
  .object({
    /** `tag:<id da tag de Status>`, `visita_tentada` ou `sem_visita` */
    chave: z.string(),
    /** Estado fixo (não é uma tag) */
    fixa: z.boolean(),
    nomePadrao: z.string(),
    corPadrao: corDoMapaSchema,
    /** O que vale agora (o configurado pelo admin ou o padrão) */
    nome: z.string(),
    cor: corDoMapaSchema,
    personalizada: z.boolean(),
    /** Regra do estado, em palavras (para a legenda explicar) */
    regra: z.string(),
  })
  .meta({ id: 'EntradaDaLegenda' })
export type EntradaDaLegenda = z.infer<typeof entradaDaLegendaSchema>

export const legendaDoMapaSchema = z
  .object({ entradas: z.array(entradaDaLegendaSchema) })
  .meta({ id: 'LegendaDoMapa' })
export type LegendaDoMapa = z.infer<typeof legendaDoMapaSchema>

export const alterarEntradaDaLegendaSchema = z
  .object({
    cor: corDoMapaSchema.optional(),
    /** Nome livre; vazio ou nulo volta ao padrão */
    nome: z.string().trim().max(40).nullable().optional(),
  })
  .strict()
  .refine((d) => d.cor !== undefined || d.nome !== undefined, 'informe a cor ou o nome')
  .meta({ id: 'AlterarEntradaDaLegenda' })
export type AlterarEntradaDaLegenda = z.infer<typeof alterarEntradaDaLegendaSchema>

// ---- Chips (as tags de Status) ----

export const chipDoMapaSchema = z
  .object({
    tagId: z.uuid(),
    chave: z.string(),
    nome: z.string(),
    cor: corDoMapaSchema,
    /** O chip já vem ligado ao abrir o mapa (flag "visível ao abrir" da tag) */
    ligadoAoAbrir: z.boolean(),
    /** Quantas empresas com coordenada têm essa tag (as que o usuário vê) */
    total: z.number().int(),
    /** Chip dos leads: só aparecem por lote de importação */
    porLote: z.boolean(),
  })
  .meta({ id: 'ChipDoMapa' })
export type ChipDoMapa = z.infer<typeof chipDoMapaSchema>

export const loteDeLeadsSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  /** Leads desse lote com coordenada */
  comCoordenada: z.number().int(),
})

export const opcoesDoMapaSchema = z
  .object({
    uf: z.string(),
    chips: z.array(chipDoMapaSchema),
    legenda: z.array(entradaDaLegendaSchema),
    vendedores: z.array(z.object({ id: z.uuid(), nome: z.string() })),
    cidades: z.array(z.object({ codigoIbge: z.number().int(), nome: z.string() })),
    regioes: z.array(z.object({ id: z.string(), nome: z.string() })),
    lotesDeLeads: z.array(loteDeLeadsSchema),
    /** Máximo de leads mostrados por vez */
    limiteDeLeads: z.number().int(),
    /** Para onde o mapa abre: o centro dos pontos da carteira, ou do estado */
    centroInicial: z.object({ latitude: z.number(), longitude: z.number(), zoom: z.number() }),
    mapaInstalado: z.boolean(),
  })
  .meta({ id: 'OpcoesDoMapa' })
export type OpcoesDoMapa = z.infer<typeof opcoesDoMapaSchema>

// ---- Pontos ----

const lista = (v: unknown) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v)
const numero = (v: unknown) => (v === '' || v === undefined ? undefined : v)

/** Os filtros do mapa (query string); `statusTagIds` e `lotes` vão separados por vírgula. */
export const filtrosDoMapaSchema = z
  .object({
    busca: z.string().trim().max(80).optional(),
    statusTagIds: z.preprocess(lista, z.array(z.uuid()).max(20)).default([]),
    /** `alguma_vez` (visitada alguma vez), `90_dias`, `periodo` (com `visitaDe` e `visitaAte`), `nunca` */
    visitada: z.enum(['alguma_vez', '90_dias', 'periodo', 'nunca']).optional(),
    visitaDe: z.iso.date().optional(),
    visitaAte: z.iso.date().optional(),
    vendedorId: z.uuid().optional(),
    /** Só a carteira (Cliente e Prospect) sem visita há N dias */
    semVisitaDias: z.preprocess(numero, z.coerce.number().int().min(1).max(3650).optional()),
    municipioCodigo: z.preprocess(numero, z.coerce.number().int().optional()),
    regiaoId: z.string().max(60).optional(),
    precisao: precisaoGeoSchema.optional(),
    /** Leads por lote de importação (até o limite) */
    lotes: z.preprocess(lista, z.array(z.uuid()).max(10)).default([]),
  })
  .strict()
export type FiltrosDoMapa = z.infer<typeof filtrosDoMapaSchema>

export const consultaDePontosSchema = filtrosDoMapaSchema
  .extend({
    oeste: z.coerce.number().min(-180).max(180),
    sul: z.coerce.number().min(-90).max(90),
    leste: z.coerce.number().min(-180).max(180),
    norte: z.coerce.number().min(-90).max(90),
    zoom: z.coerce.number().min(0).max(24),
  })
  .strict()
export type ConsultaDePontos = z.infer<typeof consultaDePontosSchema>

export const pontoDoMapaSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  /** Entrada da legenda que pinta o pin (`tag:<id>`, `sem_visita` ou `visita_tentada`) */
  estado: z.string(),
  /** Visitada alguma vez: o pin ganha o visto */
  visitada: z.boolean(),
  precisao: precisaoGeoSchema,
  /** De onde veio a coordenada (a atribuição do CNEFE aparece quando algum pin vem dele) */
  origem: origemGeoSchema.nullable(),
  cidade: z.string().nullable(),
})
export type PontoDoMapa = z.infer<typeof pontoDoMapaSchema>

export const agrupamentoDoMapaSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  total: z.number().int(),
})
export type AgrupamentoDoMapa = z.infer<typeof agrupamentoDoMapaSchema>

export const pontosDoMapaSchema = z
  .object({
    /** Quantas empresas há na área, com os filtros */
    total: z.number().int(),
    /** Pontos individuais (poucos o bastante para desenhar) */
    pontos: z.array(pontoDoMapaSchema),
    /** No zoom afastado, com muitos pontos: bolhas com o total */
    agrupamentos: z.array(agrupamentoDoMapaSchema),
    /** Leads: quantos aparecem e quantos o lote tem (o limite é por vez) */
    leads: z.object({
      mostrados: z.number().int(),
      total: z.number().int(),
      limite: z.number().int(),
    }),
  })
  .meta({ id: 'PontosDoMapa' })
export type PontosDoMapa = z.infer<typeof pontosDoMapaSchema>

// ---- Painel da empresa, próximas, seleção e cobertura ----

export const consultaDeProximasSchema = z
  .object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
    raioKm: z.coerce.number().min(0.1).max(100),
    /** Por padrão, as já visitadas ficam de fora */
    incluirVisitadas: z.enum(['true', 'false']).default('false'),
    excluirEmpresaId: z.uuid().optional(),
  })
  .extend(filtrosDoMapaSchema.omit({ busca: true }).shape)
  .strict()
export type ConsultaDeProximas = z.infer<typeof consultaDeProximasSchema>

export const itemDeSelecaoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  cidade: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  estado: z.string(),
  visitada: z.boolean(),
  /** Distância até o centro da seleção (só na seleção por raio e nas próximas) */
  distanciaM: z.number().int().nullable(),
})
export type ItemDeSelecao = z.infer<typeof itemDeSelecaoSchema>

export const listaDeSelecaoSchema = z
  .object({
    total: z.number().int(),
    /** A lista tem no máximo `limite` itens; o total diz quantas há de fato */
    limite: z.number().int(),
    itens: z.array(itemDeSelecaoSchema),
  })
  .meta({ id: 'SelecaoDoMapa' })
export type ListaDeSelecao = z.infer<typeof listaDeSelecaoSchema>

export const selecaoDoMapaSchema = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('retangulo'),
      oeste: z.number().min(-180).max(180),
      sul: z.number().min(-90).max(90),
      leste: z.number().min(-180).max(180),
      norte: z.number().min(-90).max(90),
    }),
    z.object({
      tipo: z.literal('raio'),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      raioKm: z.number().min(0.1).max(100),
    }),
  ])
  .and(
    z.object({
      incluirVisitadas: z.boolean().default(false),
      filtros: filtrosDoMapaSchema.omit({ busca: true }).partial().default({}),
    }),
  )
  .meta({ id: 'SelecaoDoMapaEntrada' })
export type SelecaoDoMapa = z.infer<typeof selecaoDoMapaSchema>

export const coberturaDoMunicipioSchema = z.object({
  codigoIbge: z.number().int(),
  nome: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  /** Empresas da carteira (Cliente e Prospect) com coordenada no município */
  total: z.number().int(),
  visitadas: z.number().int(),
  faltam: z.number().int(),
})
export type CoberturaDoMunicipio = z.infer<typeof coberturaDoMunicipioSchema>

export const coberturaDoMapaSchema = z
  .object({ municipios: z.array(coberturaDoMunicipioSchema) })
  .meta({ id: 'CoberturaDoMapa' })
export type CoberturaDoMapa = z.infer<typeof coberturaDoMapaSchema>

/** GET /v1/mapa/base: de onde o app lê o mapa base (PMTiles). */
export const baseDoMapaSchema = z
  .object({
    /** URL absoluta do bucket público (com o nome versionado) ou o caminho da API (transitório) */
    url: z.string().min(1),
    origem: z.enum(['publica', 'api']),
  })
  .meta({ id: 'BaseDoMapa' })
export type BaseDoMapa = z.infer<typeof baseDoMapaSchema>

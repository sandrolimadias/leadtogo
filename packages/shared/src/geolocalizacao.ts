import { z } from 'zod'

import { porPaginaSchema } from './paginacao.js'

// Geolocalização (G1): contratos da API entre o web e a API (docs/plano_geolocalizacao.md).

export const precisaoGeoSchema = z.enum(['exata', 'aproximada'])
export type PrecisaoGeo = z.infer<typeof precisaoGeoSchema>
export const aproximacaoGeoSchema = z.enum(['interpolada', 'rua', 'cep_cidade'])
export type AproximacaoGeo = z.infer<typeof aproximacaoGeoSchema>
export const origemGeoSchema = z.enum(['cnefe', 'nominatim', 'cep', 'manual', 'checkin'])
export type OrigemGeo = z.infer<typeof origemGeoSchema>

/** Raio de incerteza (metros) que o mapa mostra em volta do pin, por tipo de precisão. */
export const RAIO_DE_INCERTEZA_M = {
  exata: 100,
  interpolada: 300,
  rua: 1000,
  cep_cidade: 5000,
} as const

/** O que o selo da ficha diz da posição da empresa. */
export const estadoDaPosicaoSchema = z.enum([
  'exata',
  'aproximada',
  'sem_coordenada',
  'a_confirmar',
])
export type EstadoDaPosicao = z.infer<typeof estadoDaPosicaoSchema>

export const posicaoDaEmpresaSchema = z
  .object({
    estado: estadoDaPosicaoSchema,
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    precisao: precisaoGeoSchema.nullable(),
    aproximacao: aproximacaoGeoSchema.nullable(),
    origem: origemGeoSchema.nullable(),
    /** Raio de incerteza em metros (nulo sem coordenada) */
    raioM: z.number().int().nullable(),
    atualizadoEm: z.string().nullable(),
    /** O usuário moveu o pin (preservado até ele confirmar a troca) */
    ajusteManual: z.boolean(),
    /** O endereço mudou depois do ajuste manual: perguntar se mantém a posição ou refaz */
    enderecoMudouDepoisDoAjuste: z.boolean(),
    /** O que falta no endereço (rua, número, bairro, cidade) quando está "a confirmar" */
    faltas: z.array(z.enum(['logradouro', 'numero', 'bairro', 'cidade'])),
  })
  .meta({ id: 'PosicaoDaEmpresa' })
export type PosicaoDaEmpresa = z.infer<typeof posicaoDaEmpresaSchema>

// ---- Ajustar a posição ----

export const ajustarPosicaoSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict()
  .meta({ id: 'AjustarPosicao' })
export type AjustarPosicao = z.infer<typeof ajustarPosicaoSchema>

/** Confirma o endereço atual (a posição fica como está) ou manda refazer a geocodificação. */
export const confirmarEnderecoSchema = z
  .object({ acao: z.enum(['manter_posicao', 'refazer']) })
  .strict()
  .meta({ id: 'ConfirmarEndereco' })
export type ConfirmarEndereco = z.infer<typeof confirmarEnderecoSchema>

// ---- Regiões ----

export const municipioDaRegiaoSchema = z.object({
  codigoIbge: z.number().int(),
  nome: z.string(),
  uf: z.string(),
})

export const regiaoSchema = z
  .object({
    /** `micro:<código>` (oficial, só leitura) ou o id da região do admin */
    id: z.string(),
    tipo: z.enum(['microrregiao', 'personalizada']),
    nome: z.string(),
    uf: z.string().nullable(),
    municipios: z.array(municipioDaRegiaoSchema),
  })
  .meta({ id: 'RegiaoGeo' })
export type RegiaoGeo = z.infer<typeof regiaoSchema>

export const salvarRegiaoSchema = z
  .object({
    nome: z.string().trim().min(1, 'Informe o nome.').max(80),
    municipios: z.array(z.number().int()).min(1, 'Escolha ao menos um município.').max(200),
  })
  .strict()
  .meta({ id: 'SalvarRegiao' })
export type SalvarRegiao = z.infer<typeof salvarRegiaoSchema>

export const consultaDeRegioesSchema = z.object({ uf: z.string().length(2).optional() }).strict()
export type ConsultaDeRegioes = z.infer<typeof consultaDeRegioesSchema>

// ---- Lotes por cidade ou região ----

export const escopoDoLoteSchema = z
  .object({
    tipo: z.enum(['municipio', 'regiao']),
    /** Código IBGE (município) ou `micro:<código>` / id da região do admin */
    id: z.string().min(1),
  })
  .strict()
export type EscopoDoLote = z.infer<typeof escopoDoLoteSchema>

export const previaDoLoteSchema = z
  .object({
    escopo: z.string(),
    municipios: z.number().int(),
    /** Empresas ativas no escopo (fora as do exterior e as com a posição ajustada à mão) */
    total: z.number().int(),
    /** Quantas dessas já têm coordenada */
    comCoordenada: z.number().int(),
    /** Quantas o lote vai processar (sem coordenada; com a opção "refazer", todas) */
    aProcessar: z.number().int(),
    /** Quantas têm a posição ajustada à mão (nunca mudam) */
    ajustadasAMao: z.number().int(),
  })
  .meta({ id: 'PreviaDoLoteGeo' })
export type PreviaDoLote = z.infer<typeof previaDoLoteSchema>

export const criarLoteGeoSchema = z
  .object({
    escopo: escopoDoLoteSchema,
    refazerComCoordenada: z.boolean().default(false),
  })
  .strict()
  .meta({ id: 'CriarLoteGeo' })
export type CriarLoteGeo = z.infer<typeof criarLoteGeoSchema>

export const situacaoDoLoteGeoSchema = z.enum(['em_andamento', 'concluido', 'falhou', 'cancelado'])
export type SituacaoDoLoteGeo = z.infer<typeof situacaoDoLoteGeoSchema>

export const resultadoGeoEmpresaSchema = z.enum([
  'pendente',
  'exata',
  'aproximada',
  'a_confirmar',
  'ja_tinha',
  'falhou',
])
export type ResultadoGeoEmpresa = z.infer<typeof resultadoGeoEmpresaSchema>

export const loteGeoSchema = z
  .object({
    id: z.uuid(),
    nome: z.string(),
    escopo: z.string(),
    municipios: z.number().int(),
    refazerComCoordenada: z.boolean(),
    situacao: situacaoDoLoteGeoSchema,
    totalEmpresas: z.number().int(),
    /** Empresas que já têm resultado (todas menos as pendentes) */
    processadas: z.number().int(),
    /** Quantas há em cada resultado (só os que têm alguma) */
    porResultado: z.record(z.string(), z.number().int()),
    iniciadoEm: z.string().nullable(),
    concluidoEm: z.string().nullable(),
    criadoEm: z.string(),
    criadoPor: z.string().nullable(),
  })
  .meta({ id: 'LoteGeo' })
export type LoteGeo = z.infer<typeof loteGeoSchema>

export const consultaDeLotesGeoSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: porPaginaSchema(),
  })
  .strict()
export type ConsultaDeLotesGeo = z.infer<typeof consultaDeLotesGeoSchema>

export const listaDeLotesGeoSchema = z
  .object({
    itens: z.array(loteGeoSchema),
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
  })
  .meta({ id: 'ListaDeLotesGeo' })
export type ListaDeLotesGeo = z.infer<typeof listaDeLotesGeoSchema>

// ---- Resumo e fila "Confirmar endereço" ----

export const resumoDaGeolocalizacaoSchema = z
  .object({
    /** O CNEFE está carregado em `referencia_geo`? */
    cnefeCarregado: z.boolean(),
    /** UF padrão do mapa e das regiões (configuração `GEO_UF`) */
    uf: z.string(),
    /** Há Nominatim configurado (só produção)? */
    nominatimConfigurado: z.boolean(),
    totalEmpresas: z.number().int(),
    exatas: z.number().int(),
    aproximadas: z.number().int(),
    semCoordenada: z.number().int(),
    aConfirmar: z.number().int(),
    ajustadasAMao: z.number().int(),
  })
  .meta({ id: 'ResumoDaGeolocalizacao' })
export type ResumoDaGeolocalizacao = z.infer<typeof resumoDaGeolocalizacaoSchema>

export const consultaDaFilaSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: porPaginaSchema(),
  })
  .strict()
export type ConsultaDaFila = z.infer<typeof consultaDaFilaSchema>

export const itemDaFilaSchema = z.object({
  empresaId: z.uuid(),
  nome: z.string(),
  endereco: z.string(),
  municipio: z.string().nullable(),
  cep: z.string().nullable(),
  faltas: z.array(z.enum(['logradouro', 'numero', 'bairro', 'cidade'])),
  vendedor: z.string().nullable(),
})
export type ItemDaFila = z.infer<typeof itemDaFilaSchema>

export const listaDaFilaSchema = z
  .object({
    itens: z.array(itemDaFilaSchema),
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
  })
  .meta({ id: 'FilaConfirmarEndereco' })
export type ListaDaFila = z.infer<typeof listaDaFilaSchema>

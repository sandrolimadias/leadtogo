import { z } from 'zod'

import { TAMANHO_MAXIMO_DA_BUSCA, TAMANHO_MINIMO_DA_BUSCA } from './avisos.js'
import { paraComparar } from './importacao-leitura.js'

// Busca global do CRM (docs/plano_busca_global.md): empresas, contatos e oportunidades da carteira que a pessoa
// alcança, e as últimas buscas dela. Os limites de tamanho são os da busca do portal.

const instante = z.iso.datetime({ offset: true })

export const TIPOS_DA_BUSCA_GLOBAL = ['empresas', 'contatos', 'oportunidades'] as const
export const tipoDaBuscaGlobalSchema = z.enum(TIPOS_DA_BUSCA_GLOBAL)
export type TipoDaBuscaGlobal = z.infer<typeof tipoDaBuscaGlobalSchema>
export const ROTULO_DO_TIPO_DA_BUSCA_GLOBAL: Record<TipoDaBuscaGlobal, string> = {
  empresas: 'Empresas',
  contatos: 'Contatos',
  oportunidades: 'Oportunidades',
}

/** Resultados por tipo: padrão nas sugestões e na tela `/busca` */
export const LIMITE_PADRAO_DA_BUSCA_GLOBAL = 5
export const LIMITE_MAXIMO_DA_BUSCA_GLOBAL = 20
/** Buscas recentes guardadas por pessoa */
export const MAXIMO_DE_BUSCAS_RECENTES = 10

const termoDaBusca = z
  .string()
  .trim()
  .min(TAMANHO_MINIMO_DA_BUSCA, `digite ao menos ${TAMANHO_MINIMO_DA_BUSCA} letras`)
  .max(TAMANHO_MAXIMO_DA_BUSCA)

/** `tipos` aceita a lista separada por vírgula (query string) */
export const consultaDaBuscaGlobalSchema = z
  .object({
    q: termoDaBusca,
    tipos: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.split(',').filter(Boolean) : v),
        z.array(tipoDaBuscaGlobalSchema).min(1),
      )
      .optional(),
    limite: z.coerce
      .number()
      .int()
      .min(1)
      .max(LIMITE_MAXIMO_DA_BUSCA_GLOBAL)
      .default(LIMITE_PADRAO_DA_BUSCA_GLOBAL),
  })
  .strict()
export type ConsultaDaBuscaGlobal = z.infer<typeof consultaDaBuscaGlobalSchema>

export const itemDaBuscaGlobalSchema = z
  .object({
    id: z.uuid(),
    titulo: z.string(),
    /** Linha de apoio: "Cidade/UF · vendedor", "Empresa · cargo" ou "Empresa · fase · valor" */
    subtitulo: z.string().nullable(),
    /** Status da empresa (Lead, Prospect, Cliente…), só nas empresas */
    status: z.object({ nome: z.string(), cor: z.string() }).nullable(),
    /** Rota do web a abrir */
    destino: z.string(),
  })
  .meta({ id: 'ItemDaBuscaGlobal' })
export type ItemDaBuscaGlobal = z.infer<typeof itemDaBuscaGlobalSchema>

export const resultadoDaBuscaGlobalSchema = z
  .object({
    empresas: z.array(itemDaBuscaGlobalSchema),
    contatos: z.array(itemDaBuscaGlobalSchema),
    oportunidades: z.array(itemDaBuscaGlobalSchema),
  })
  .meta({ id: 'ResultadoDaBuscaGlobal' })
export type ResultadoDaBuscaGlobal = z.infer<typeof resultadoDaBuscaGlobalSchema>

// ------------------------------------------------------------------------------------ buscas recentes

export const buscaRecenteSchema = z
  .object({ id: z.uuid(), termo: z.string(), buscadoEm: instante })
  .meta({ id: 'BuscaRecente' })
export type BuscaRecente = z.infer<typeof buscaRecenteSchema>

export const buscasRecentesSchema = z
  .object({ itens: z.array(buscaRecenteSchema) })
  .meta({ id: 'BuscasRecentes' })
export type BuscasRecentes = z.infer<typeof buscasRecentesSchema>

export const novaBuscaRecenteSchema = z
  .object({ termo: termoDaBusca })
  .strict()
  .meta({ id: 'NovaBuscaRecente' })
export type NovaBuscaRecente = z.infer<typeof novaBuscaRecenteSchema>

/**
 * A chave de "mesmo termo" do histórico: sem acento, minúsculo e só letras e números separados por um espaço
 * ("São José" e "sao  jose" são o mesmo). Sem letra nem número, vale o termo aparado e minúsculo.
 */
export const termoComparavel = (termo: string): string =>
  paraComparar(termo) || termo.trim().toLowerCase()

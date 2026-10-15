import { z } from 'zod'

import {
  TABELAS_PAGINADAS,
  type TabelaPaginada,
  tamanhoDePaginaSchema,
  type TamanhoDePagina,
} from './paginacao.js'

// Preferências de interface do membro (docs/modelagem_banco.md, seção 3.4: `membros.preferencias`):
// tema, menu recolhido, visão do Dashboard e filtro salvo padrão. São por membro, ou seja, por
// usuário em cada empresa. O schema é FECHADO: só estas chaves são aceitas e guardadas.

export const TEMAS = ['claro', 'escuro', 'sistema'] as const
export const VISOES_DASHBOARD = ['minha', 'equipe'] as const
/** Telas que têm filtro salvo padrão. */
export const TELAS_COM_FILTRO = ['empresas', 'contatos', 'oportunidades', 'tarefas'] as const

export const preferenciasSchema = z
  .object({
    tema: z.enum(TEMAS),
    menuRecolhido: z.boolean(),
    visaoDashboard: z.enum(VISOES_DASHBOARD),
    /** Id do filtro salvo (`filtros_salvos`) que abre por padrão em cada tela; ausente = nenhum */
    filtroPadrao: z.partialRecord(z.enum(TELAS_COM_FILTRO), z.uuid()),
    /** Quantas linhas por página em cada tabela de dados (25, 50 ou 100); ausente = 25 */
    porPagina: z.partialRecord(z.enum(TABELAS_PAGINADAS), tamanhoDePaginaSchema),
  })
  .strict()
  .meta({ id: 'Preferencias' })

/** O que a API devolve: sempre completo, com os padrões onde o membro ainda não escolheu. */
export type Preferencias = z.infer<typeof preferenciasSchema>

export const PREFERENCIAS_PADRAO: Preferencias = {
  tema: 'sistema',
  menuRecolhido: false,
  visaoDashboard: 'minha',
  filtroPadrao: {},
  porPagina: {},
}

/**
 * PATCH /v1/me/preferencias: só o que mudou. `null` volta uma chave ao padrão; em `filtroPadrao`,
 * `null` remove o filtro daquela tela. Chaves desconhecidas são recusadas.
 */
export const preferenciasPatchSchema = z
  .object({
    tema: z.enum(TEMAS).nullable(),
    menuRecolhido: z.boolean().nullable(),
    visaoDashboard: z.enum(VISOES_DASHBOARD).nullable(),
    filtroPadrao: z.partialRecord(z.enum(TELAS_COM_FILTRO), z.uuid().nullable()),
    /** `null` volta a tabela ao padrão (25) */
    porPagina: z.partialRecord(z.enum(TABELAS_PAGINADAS), tamanhoDePaginaSchema.nullable()),
  })
  .partial()
  .strict()
  .meta({ id: 'PreferenciasPatch' })
export type PreferenciasPatch = z.infer<typeof preferenciasPatchSchema>

/** Aplica um patch sobre o que está guardado e devolve só o que foge do padrão (o que vai para o banco). */
export function aplicarPatch(
  guardado: Partial<Preferencias>,
  patch: PreferenciasPatch,
): Partial<Preferencias> {
  const novo: Partial<Preferencias> = { ...guardado }
  for (const chave of ['tema', 'menuRecolhido', 'visaoDashboard'] as const) {
    if (!(chave in patch)) continue
    const valor = patch[chave]
    if (valor === null || valor === undefined) delete novo[chave]
    else (novo as Record<string, unknown>)[chave] = valor
  }
  if (patch.filtroPadrao) {
    const filtros: Partial<Record<(typeof TELAS_COM_FILTRO)[number], string>> = {
      ...guardado.filtroPadrao,
    }
    for (const [tela, id] of Object.entries(patch.filtroPadrao)) {
      if (id === null || id === undefined) delete filtros[tela as (typeof TELAS_COM_FILTRO)[number]]
      else filtros[tela as (typeof TELAS_COM_FILTRO)[number]] = id
    }
    if (Object.keys(filtros).length === 0) delete novo.filtroPadrao
    else novo.filtroPadrao = filtros
  }
  if (patch.porPagina) {
    const tamanhos: Partial<Record<TabelaPaginada, TamanhoDePagina>> = { ...guardado.porPagina }
    for (const [tabela, tamanho] of Object.entries(patch.porPagina)) {
      if (tamanho === null || tamanho === undefined) delete tamanhos[tabela as TabelaPaginada]
      else tamanhos[tabela as TabelaPaginada] = tamanho
    }
    if (Object.keys(tamanhos).length === 0) delete novo.porPagina
    else novo.porPagina = tamanhos
  }
  return novo
}

/**
 * Lê o que está guardado e completa com os padrões. Chave a chave: um valor inválido ou uma chave
 * antiga é descartado sozinho, sem levar junto as preferências válidas ao lado dele.
 */
export function lerPreferencias(guardado: unknown): Preferencias {
  const objeto =
    guardado !== null && typeof guardado === 'object' && !Array.isArray(guardado)
      ? (guardado as Record<string, unknown>)
      : {}
  const forma = preferenciasSchema.shape
  const lidas: Partial<Preferencias> = {}
  const tema = forma.tema.safeParse(objeto['tema'])
  if (tema.success) lidas.tema = tema.data
  const menu = forma.menuRecolhido.safeParse(objeto['menuRecolhido'])
  if (menu.success) lidas.menuRecolhido = menu.data
  const visao = forma.visaoDashboard.safeParse(objeto['visaoDashboard'])
  if (visao.success) lidas.visaoDashboard = visao.data
  const filtros: Preferencias['filtroPadrao'] = {}
  const bruto = objeto['filtroPadrao']
  if (bruto !== null && typeof bruto === 'object' && !Array.isArray(bruto)) {
    for (const tela of TELAS_COM_FILTRO) {
      const id = z.uuid().safeParse((bruto as Record<string, unknown>)[tela])
      if (id.success) filtros[tela] = id.data
    }
  }
  const tamanhos: Preferencias['porPagina'] = {}
  const brutoDePagina = objeto['porPagina']
  if (
    brutoDePagina !== null &&
    typeof brutoDePagina === 'object' &&
    !Array.isArray(brutoDePagina)
  ) {
    for (const tabela of TABELAS_PAGINADAS) {
      const tamanho = tamanhoDePaginaSchema.safeParse(
        (brutoDePagina as Record<string, unknown>)[tabela],
      )
      if (tamanho.success) tamanhos[tabela] = tamanho.data
    }
  }
  return { ...PREFERENCIAS_PADRAO, ...lidas, filtroPadrao: filtros, porPagina: tamanhos }
}

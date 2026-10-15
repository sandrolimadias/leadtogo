import { z } from 'zod'
import { porPaginaSchema } from './paginacao.js'

// Aba Histórico da ficha da empresa (GET /v1/carteira/empresas/{id}/historico): a auditoria em
// português, com nomes no lugar de ids, e as tags que o sistema aplicou ou tirou sozinho.

export const consultaDoHistoricoSchema = z
  .object({
    pagina: z.coerce.number().int().min(1).default(1),
    porPagina: porPaginaSchema(20),
  })
  .strict()
export type ConsultaDoHistorico = z.output<typeof consultaDoHistoricoSchema>

export const mudancaDoHistoricoSchema = z.object({
  /** Nome do campo no sistema (ex.: `razaoSocial`) */
  campo: z.string(),
  /** Nome para o usuário (ex.: "Razão social") */
  rotulo: z.string(),
  /** Valor antes e depois, já legíveis (nomes, datas e "Sim/Não"); nulo = vazio */
  de: z.string().nullable(),
  para: z.string().nullable(),
})

export const entradaDoHistoricoSchema = z
  .object({
    id: z.string(),
    em: z.string(),
    /** Quem fez; `id` nulo e nome "Sistema" para o que o sistema fez sozinho */
    por: z.object({ id: z.uuid().nullable(), nome: z.string() }),
    automatica: z.boolean(),
    /** Ex.: "Dados alterados", "Carteira transferida", "Tags alteradas" */
    titulo: z.string(),
    mudancas: z.array(mudancaDoHistoricoSchema),
  })
  .meta({ id: 'EntradaDoHistoricoDaEmpresa' })
export type EntradaDoHistorico = z.infer<typeof entradaDoHistoricoSchema>

export const historicoDaEmpresaSchema = z
  .object({
    itens: z.array(entradaDoHistoricoSchema),
    total: z.number().int(),
    pagina: z.number().int(),
    porPagina: z.number().int(),
  })
  .meta({ id: 'HistoricoDaEmpresa' })
export type HistoricoDaEmpresa = z.infer<typeof historicoDaEmpresaSchema>

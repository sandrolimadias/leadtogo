import { z } from 'zod'

// Quantas linhas por página tem toda tabela de dados (docs/design_system.md, "Tabelas e paginação"):
// 25 (padrão), 50 ou 100. A API nunca devolve mais que o máximo, e a escolha de cada pessoa em cada
// tabela é guardada nas preferências dela (`porPagina`), valendo em qualquer aparelho.

export const TAMANHOS_DE_PAGINA = [25, 50, 100] as const
export type TamanhoDePagina = (typeof TAMANHOS_DE_PAGINA)[number]
export const TAMANHO_DE_PAGINA_PADRAO: TamanhoDePagina = 25
export const TAMANHO_MAXIMO_DE_PAGINA = 100

/**
 * As tabelas que lembram o tamanho de página. Tabela nova de dados entra aqui (e usa o componente
 * `Paginacao` da web), para a escolha ser guardada por tabela.
 */
export const TABELAS_PAGINADAS = [
  'empresas',
  'contatos',
  'importacoes',
  'importacao_linhas',
  'atividades',
  'atividades_ficha',
] as const
export type TabelaPaginada = (typeof TABELAS_PAGINADAS)[number]

export const tamanhoDePaginaSchema = z.union([z.literal(25), z.literal(50), z.literal(100)])

/** `porPagina` das consultas de lista: de 1 até o máximo da API (100), com o padrão de cada lista. */
export const porPaginaSchema = (padrao: number = TAMANHO_DE_PAGINA_PADRAO) =>
  z.coerce.number().int().min(1).max(TAMANHO_MAXIMO_DE_PAGINA).default(padrao)

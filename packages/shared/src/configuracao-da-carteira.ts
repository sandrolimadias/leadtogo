import { z } from 'zod'

/**
 * Configurações → Carteira: duas regras da carteira de empresas da empresa ativa
 * (`tenant_configuracoes`). Só o administrador altera.
 */
export const configuracaoDaCarteiraSchema = z
  .object({
    /**
     * Não deixa cadastrar empresa (CNPJ) que não esteja ativa na Receita (baixada, inapta, suspensa
     * ou nula). Padrão: ligado. Vale só para cadastro novo: a empresa que já está na carteira fica.
     */
    bloquearEmpresaNaoAtiva: z.boolean(),
    /** O vendedor vê as empresas de todos os vendedores (mas edita só a própria). Padrão: desligado. */
    vendedorVeTodasEmpresas: z.boolean(),
  })
  .meta({ id: 'ConfiguracaoDaCarteira' })
export type ConfiguracaoDaCarteira = z.infer<typeof configuracaoDaCarteiraSchema>

export const configuracaoDaCarteiraPatchSchema = z
  .object({
    bloquearEmpresaNaoAtiva: z.boolean().optional(),
    vendedorVeTodasEmpresas: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos uma configuração')
  .meta({ id: 'ConfiguracaoDaCarteiraEntrada' })
export type ConfiguracaoDaCarteiraPatch = z.infer<typeof configuracaoDaCarteiraPatchSchema>

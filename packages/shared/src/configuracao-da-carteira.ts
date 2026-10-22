import { z } from 'zod'

/**
 * Configurações → Carteira: as regras da carteira de empresas da empresa ativa
 * (`tenant_configuracoes`). Altera quem tem `carteira.configurar`. O antigo "Vendedores podem ver
 * todas as empresas" virou o alcance de `ver` no perfil de acesso (Fase 1).
 */
export const configuracaoDaCarteiraSchema = z
  .object({
    /**
     * Não deixa cadastrar empresa (CNPJ) que não esteja ativa na Receita (baixada, inapta, suspensa
     * ou nula). Padrão: ligado. Vale só para cadastro novo: a empresa que já está na carteira fica.
     */
    bloquearEmpresaNaoAtiva: z.boolean(),
  })
  .meta({ id: 'ConfiguracaoDaCarteira' })
export type ConfiguracaoDaCarteira = z.infer<typeof configuracaoDaCarteiraSchema>

export const configuracaoDaCarteiraPatchSchema = z
  .object({
    bloquearEmpresaNaoAtiva: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'informe ao menos uma configuração')
  .meta({ id: 'ConfiguracaoDaCarteiraEntrada' })
export type ConfiguracaoDaCarteiraPatch = z.infer<typeof configuracaoDaCarteiraPatchSchema>

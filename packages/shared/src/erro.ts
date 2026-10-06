import { z } from 'zod'

/** Detalhe de um campo inválido (erro de validação). */
export const detalheDeErroSchema = z.object({ campo: z.string(), mensagem: z.string() })

/**
 * Formato único de erro da API. `erro` é um código estável (ex.: `validacao_invalida`,
 * `2fa_obrigatorio`, `sem_empresa_ativa`): o front trata por ele, não pela mensagem.
 */
export const erroSchema = z
  .object({
    statusCode: z.number().int(),
    erro: z.string(),
    mensagem: z.string(),
    request_id: z.string().optional(),
    detalhes: z.array(detalheDeErroSchema).optional(),
  })
  .meta({ id: 'Erro' })
export type ErroDaApi = z.infer<typeof erroSchema>

/** Resultado de uma verificação de dependência no /health. */
const verificacaoSchema = z.object({ status: z.enum(['ok', 'erro']), ms: z.number() })

/** GET /health: 200 com tudo saudável, 503 se alguma dependência falhar. */
export const saudeSchema = z
  .object({
    status: z.enum(['ok', 'erro']),
    version: z.string(),
    checks: z.object({
      database: verificacaoSchema,
      valkey: verificacaoSchema,
      garage: verificacaoSchema,
    }),
  })
  .meta({ id: 'Saude' })
export type Saude = z.infer<typeof saudeSchema>

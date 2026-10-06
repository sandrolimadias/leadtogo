import type { PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

import { type DetalheErro, ErroApi } from './erro-api.js'

/**
 * Valida corpo, query ou parâmetro com um schema Zod (os mesmos de `@leadtogo/shared`).
 * Devolve o valor já convertido; se inválido, responde 400 `validacao_invalida` com os campos.
 *   `@Body(new ZodPipe(meuSchema)) corpo: z.infer<typeof meuSchema>`
 */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodType<T>) {}

  transform(valor: unknown): T {
    const resultado = this.esquema.safeParse(valor)
    if (resultado.success) return resultado.data
    const detalhes: DetalheErro[] = resultado.error.issues.map((i) => ({
      campo: i.path.join('.') || '(corpo)',
      mensagem: i.message,
    }))
    throw new ErroApi('validacao_invalida', 'Dados inválidos.', 400, detalhes)
  }
}

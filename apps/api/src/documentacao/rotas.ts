import { RequestMethod, type INestApplication } from '@nestjs/common'
import { ModulesContainer } from '@nestjs/core'

import { CHAVE_PUBLICA } from '../acesso/acesso.decorators.js'

export interface RotaRegistrada {
  /** `METODO /caminho`, com os parâmetros como `:id` e o curinga do Better Auth como `{*caminho}` */
  rota: string
  metodo: 'get' | 'post' | 'put' | 'delete' | 'patch' | 'all'
  /** Caminho no formato do OpenAPI (`/v1/convites/{id}`) */
  caminhoOpenApi: string
  /** Caminho pronto para chamar (parâmetros trocados por um uuid) */
  url: string
  /** Marcada com `@Publica()` (sem login) */
  publica: boolean
}

const METODOS: Record<number, RotaRegistrada['metodo']> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.DELETE]: 'delete',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.ALL]: 'all',
}

const UUID_DE_EXEMPLO = '01a11111-1111-7111-8111-111111111111'

/** Todas as rotas HTTP registradas (lidas dos metadados dos controllers), com a marca de pública. */
export function listarRotas(app: INestApplication): RotaRegistrada[] {
  const achadas: RotaRegistrada[] = []
  for (const modulo of app.get(ModulesContainer).values()) {
    for (const wrapper of modulo.controllers.values()) {
      const classe = wrapper.metatype as (new (...args: never[]) => unknown) | null
      if (!classe) continue
      const prefixo = Reflect.getMetadata('path', classe) as string | undefined
      if (prefixo === undefined) continue
      const classePublica = Reflect.getMetadata(CHAVE_PUBLICA, classe) === true
      for (const nome of Object.getOwnPropertyNames(classe.prototype)) {
        const funcao = (classe.prototype as Record<string, unknown>)[nome]
        if (typeof funcao !== 'function') continue
        const numero = Reflect.getMetadata('method', funcao) as number | undefined
        const caminho = Reflect.getMetadata('path', funcao) as string | undefined
        const metodo = numero === undefined ? undefined : METODOS[numero]
        if (metodo === undefined || caminho === undefined) continue
        const sufixo = caminho === '/' ? '' : `/${caminho}`
        const base = prefixo === 'health' || prefixo === 'health/alertas' ? '' : '/v1'
        const bruto = `${base}/${prefixo}${sufixo}`.replace(/\/+/g, '/')
        achadas.push({
          rota: `${metodo.toUpperCase()} ${bruto}`,
          metodo,
          caminhoOpenApi: bruto.replace(/:([a-zA-Z]+)/g, '{$1}'),
          url: bruto.replace(/:[a-zA-Z]+/g, UUID_DE_EXEMPLO).replace('{*caminho}', 'x'),
          publica: classePublica || Reflect.getMetadata(CHAVE_PUBLICA, funcao) === true,
        })
      }
    }
  }
  return achadas.sort((a, b) => a.rota.localeCompare(b.rota))
}

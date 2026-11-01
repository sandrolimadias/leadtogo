import type { ResultadoDoEnvio } from '@leadtogo/ui/formulario'

import type { Resultado } from '@/servicos/resultado'

/** O erro da API vira o que o formulário mostra: erros por campo ou a mensagem geral. */
export function comoResultadoDoEnvio(r: Resultado<unknown>): ResultadoDoEnvio | undefined {
  if (r.ok) return undefined
  return {
    mensagem: r.erro.mensagem,
    ...(r.erro.detalhes
      ? { erros: Object.fromEntries(r.erro.detalhes.map((d) => [d.campo, d.mensagem])) }
      : {}),
  }
}

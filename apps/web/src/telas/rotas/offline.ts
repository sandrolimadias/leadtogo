import type { Rota } from '@leadtogo/api-client'

import { guardar, recuperar } from '@/lib/offline/banco'

const chave = (id: string) => `rota:${id}`

/** A rota guardada no aparelho (cifrada, 7 dias; `lgpd.md` 3.2 e 3.3), para abrir sem sinal. */
export const rotaOffline = (id: string) => recuperar<Rota>('apoio', chave(id))
export const guardarRotaOffline = (r: Rota) => guardar('apoio', chave(r.id), r)

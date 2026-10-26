import type { ItemDeChamadoDoPortal } from '@leadtogo/api-client'
import { Link } from '@tanstack/react-router'

import { tempoRelativo } from '@/casca/rotulos'

import { EstadoDoChamado } from './estado-do-chamado'

/** Linhas de chamados (início e lista): o código, o assunto, quem abriu e o estado. */
export function ListaDeChamados({ itens }: { itens: ItemDeChamadoDoPortal[] }) {
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
      {itens.map((c) => (
        <li key={c.id}>
          <Link
            to="/chamados/$chamadoId"
            params={{ chamadoId: c.id }}
            className="flex flex-col gap-1 px-4 py-3 text-ink no-underline hover:bg-surface-hover"
          >
            <span className="flex items-center gap-2 text-xs leading-4 text-ink-muted">
              <span className="font-mono">{c.codigo}</span>
              {c.area ? <span>· {c.area}</span> : null}
              <span className="ml-auto">{tempoRelativo(c.atualizadoEm)}</span>
            </span>
            <span className="text-sm leading-5 font-semibold">{c.assunto}</span>
            <span className="flex items-center gap-2 text-xs leading-4 text-ink-muted">
              <EstadoDoChamado estado={c.estado} />
              <span>aberto por {c.abertoPor}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

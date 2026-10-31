import type { EntradaDaLegenda } from '@leadtogo/shared'
import { tokenDaCorDoMapa } from '@leadtogo/shared'
import { Check, X } from 'lucide-react'

import { IconButton } from '@leadtogo/ui/button'
import { cn } from '@leadtogo/ui/cn'

/** Uma amostra de pin: gota na cor do estado, com o visto quando a empresa já foi visitada. */
export function AmostraDePin({ token, visitada }: { token: string; visitada?: boolean }) {
  return (
    <svg viewBox="0 0 30 30" width="18" height="18" aria-hidden="true" className="flex-none">
      <path
        d="M15 28C15 28 4 17.5 4 11a11 11 0 0 1 22 0c0 6.5-11 17-11 17z"
        fill={`var(${token})`}
        stroke="#fff"
        strokeWidth="1.5"
      />
      {visitada ? (
        <path
          d="M10 11.5l3.2 3.2L20 8"
          fill="none"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <circle cx="15" cy="11" r="3.6" fill="#fff" />
      )}
    </svg>
  )
}

/**
 * A legenda do mapa: cada estado com a cor e o nome do tenant (o administrador configura). O visto marca
 * "visitada alguma vez": o estado nunca depende só da cor.
 */
export function LegendaDoMapa({
  id,
  entradas,
  aoFechar,
  className,
}: {
  id?: string
  entradas: EntradaDaLegenda[]
  /** Mostra o "X" no cabeçalho da legenda */
  aoFechar?: () => void
  className?: string
}) {
  return (
    <section
      id={id}
      aria-label="Legenda do mapa"
      className={cn(
        'rounded-lg border border-border bg-surface/95 p-3 text-[13px] shadow-md backdrop-blur-sm',
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="m-0 text-[11px] leading-4 font-semibold tracking-wider text-ink-subtle uppercase">
          Legenda
        </h2>
        {aoFechar ? (
          <IconButton
            icon={X}
            size="sm"
            label="Fechar legenda"
            onClick={aoFechar}
            className="-my-1.5 -mr-1.5"
          />
        ) : null}
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-1.5 p-0 max-sm:grid-cols-1">
        {entradas.map((e) => (
          <li key={e.chave} className="flex items-center gap-2" title={e.regra}>
            <AmostraDePin token={tokenDaCorDoMapa(e.cor)} />
            <span>{e.nome}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-xs text-ink-muted">
        <Check size={13} aria-hidden="true" className="flex-none" />
        Visto no pin = já visitada alguma vez.
      </p>
    </section>
  )
}

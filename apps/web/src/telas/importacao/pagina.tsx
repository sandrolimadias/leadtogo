import { CircleCheck } from 'lucide-react'

import { useDispositivo } from '@/casca/dispositivo'
import { cn } from '@leadtogo/ui/cn'

import type { TipoDeImportacao } from '@leadtogo/shared'

import { nomesDosPassos, posicaoDoPasso } from './comum'

/** Indicador dos passos (7 em empresas, 5 nos outros tipos): barras no computador, "Passo N de M" e uma barra só no celular. */
export function Etapas({
  atual: passo,
  tipo = 'empresas',
}: {
  atual: number
  tipo?: TipoDeImportacao
}) {
  const celular = useDispositivo() === 'celular'
  const NOMES_DOS_PASSOS = nomesDosPassos(tipo)
  const atual = posicaoDoPasso(tipo, passo)
  if (celular) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-[13px] text-ink-muted">
          Passo {atual + 1} de {NOMES_DOS_PASSOS.length} · {NOMES_DOS_PASSOS[atual]}
        </span>
        <div className="h-1 overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full bg-brand"
            style={{ width: `${Math.round((100 * (atual + 1)) / NOMES_DOS_PASSOS.length)}%` }}
          />
        </div>
      </div>
    )
  }
  return (
    <ol
      aria-label="Passos da importação"
      className={cn(
        'm-0 grid list-none gap-2 p-0',
        NOMES_DOS_PASSOS.length === 7 ? 'grid-cols-7' : 'grid-cols-5',
      )}
    >
      {NOMES_DOS_PASSOS.map((nome, i) => (
        <li
          key={nome}
          aria-current={i === atual ? 'step' : undefined}
          className="flex flex-col gap-1.5"
        >
          <div className={cn('h-1 rounded-full', i <= atual ? 'bg-brand' : 'bg-surface-sunken')} />
          <span
            className={cn(
              'flex items-center gap-1.5 text-[13px]',
              i === atual
                ? 'font-semibold text-ink'
                : i < atual
                  ? 'font-medium text-ink-muted'
                  : 'font-medium text-ink-subtle',
            )}
          >
            {i < atual ? <CircleCheck size={14} strokeWidth={1.75} aria-hidden="true" /> : null}
            {nome}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** Casca das telas do assistente: largura, título, trilha e a barra de passos. */
export function Pagina({
  titulo,
  trilha,
  passo,
  children,
  rodape,
  tabela,
  tipo = 'empresas',
}: {
  titulo: string
  trilha?: string
  passo: number
  children: React.ReactNode
  rodape?: React.ReactNode
  /** A tela tem uma tabela ou lista: ocupa a altura da área central e só as linhas rolam */
  tabela?: boolean
  tipo?: TipoDeImportacao
}) {
  return (
    <main
      className={cn(
        'flex w-full max-w-[1080px] flex-1 flex-col',
        tabela ? 'min-h-0' : 'min-h-full',
      )}
    >
      <div className={cn('flex flex-1 flex-col gap-4 p-6 max-md:p-4', tabela && 'min-h-0')}>
        <div className="flex flex-col gap-1">
          {trilha ? <span className="text-[13px] text-ink-muted">{trilha}</span> : null}
          <h1 className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em] max-md:text-[22px] max-md:leading-7">
            {titulo}
          </h1>
        </div>
        <Etapas atual={passo} tipo={tipo} />
        {children}
      </div>
      {rodape ? (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-surface px-6 py-3 max-md:px-4">
          {rodape}
        </div>
      ) : null}
    </main>
  )
}

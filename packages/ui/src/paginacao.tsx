import { TAMANHOS_DE_PAGINA, type TamanhoDePagina } from '@leadtogo/shared'

import { Button } from './button'
import { Select } from './campos'
import { cn } from './cn'

/**
 * Paginação de toda tabela de dados (docs/design_system.md, "Tabelas e paginação"): "1–25 de 120",
 * linhas por página (25, 50 ou 100) e Anterior / Próxima. Fica colada embaixo da
 * tabela. A escolha do tamanho é guardada por tabela nas preferências da pessoa (`usePorPagina`).
 */
export function Paginacao({
  pagina,
  porPagina,
  total,
  aoMudarPagina,
  aoMudarPorPagina,
  className,
}: {
  pagina: number
  porPagina: number
  total: number
  aoMudarPagina: (pagina: number) => void
  aoMudarPorPagina: (porPagina: TamanhoDePagina) => void
  className?: string
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  const de = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const ate = Math.min(total, pagina * porPagina)
  return (
    <nav
      aria-label="Paginação"
      className={cn(
        'flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border bg-surface px-3 py-2 text-[13px]',
        className,
      )}
    >
      <span aria-live="polite" className="text-ink-muted tabular-nums">
        {de.toLocaleString('pt-BR')}–{ate.toLocaleString('pt-BR')} de{' '}
        {total.toLocaleString('pt-BR')}
      </span>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2 text-ink-muted">
          Linhas por página
          <Select
            aria-label="Linhas por página"
            className="w-[84px]"
            value={String(porPagina)}
            options={TAMANHOS_DE_PAGINA.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={(e) => aoMudarPorPagina(Number(e.target.value) as TamanhoDePagina)}
          />
        </label>
        <span className="text-ink-muted tabular-nums">
          Página {pagina} de {paginas}
        </span>
        <Button size="sm" disabled={pagina <= 1} onClick={() => aoMudarPagina(pagina - 1)}>
          Anterior
        </Button>
        <Button size="sm" disabled={pagina >= paginas} onClick={() => aoMudarPagina(pagina + 1)}>
          Próxima
        </Button>
      </div>
    </nav>
  )
}

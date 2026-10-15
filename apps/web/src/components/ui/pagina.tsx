import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/*
 * Regra de rolagem do app (docs/design_system.md, "Layout e rolagem"): a PÁGINA nunca rola. Ficam fixos o
 * menu lateral e a barra do topo; só a área central (`#conteudo`) rola por dentro.
 *  - Tela SEM tabela (ficha, formulário, Configurações): a área central rola inteira. Use um <main>
 *    comum, sem `flex-1`.
 *  - Tela COM tabela ou lista de dados: use `PaginaDeTabela`. Título, botões, chips e filtros ficam fixos
 *    e só as linhas rolam, com o cabeçalho das colunas fixo: `AreaDaTabela` guarda a tabela
 *    (`CorpoRolavel`) e a `Paginacao`, que fica fora da rolagem.
 */

/** Página que tem uma tabela ou lista: ocupa a altura toda e entrega o resto à `AreaDaTabela`. */
export function PaginaDeTabela({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <main
      className={cn(
        'flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-4 p-6 max-md:p-4',
        className,
      )}
    >
      {children}
    </main>
  )
}

/**
 * A caixa da tabela: ocupa o que sobra da página. Dentro, o `CorpoRolavel` (as linhas) e, embaixo, a
 * `Paginacao`. Numa janela muito baixa a área tem uma altura mínima, e a rolagem de reserva passa a ser
 * a da área central (a página continua sem rolar).
 */
export function AreaDaTabela({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex min-h-[240px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Onde as linhas rolam. O cabeçalho das colunas usa `sticky top-0` e fica no topo desta área. */
export function CorpoRolavel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('min-h-0 min-w-0 flex-1 overflow-auto', className)}>{children}</div>
}

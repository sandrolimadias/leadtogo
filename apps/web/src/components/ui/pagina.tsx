import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/*
 * Regra de rolagem do app (docs/design_system.md, "Layout e rolagem"): a PÁGINA nunca rola. Ficam fixos o
 * menu lateral e a barra do topo; só a área central (`#conteudo`, na casca) rola, com uma única barra, e
 * tudo dentro dela rola junto. A largura máxima (1440 px) e a centralização também são da casca: as telas
 * não repetem `mx-auto` nem largura máxima de página.
 *  - Tabelas NÃO têm rolagem vertical própria: crescem com as linhas (25, 50 ou 100) e o cabeçalho das
 *    colunas usa `sticky top-0`, que gruda no topo da área central.
 *  - Por isso nenhum ancestral do cabeçalho pode ser um contêiner de rolagem (`overflow: hidden/auto`):
 *    `AreaDaTabela` usa `overflow-clip` e o `CorpoDaTabela` só rola na horizontal abaixo de `lg`.
 */

/** Página que tem uma tabela ou lista: um <main> comum, que cresce com o conteúdo. */
export function PaginaDeTabela({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <main className={cn('flex w-full flex-1 flex-col gap-4 p-6 max-md:p-4', className)}>
      {children}
    </main>
  )
}

/**
 * Página de quadro (o Kanban de Oportunidades): exceção à largura de 1440 px e à rolagem da área central
 * (docs/design_system.md, "Layout e rolagem"). O marcador `data-quadro` faz a casca tirar o limite de largura
 * e dar ao conteúdo a altura toda da área central; o quadro ocupa o que sobra do cabeçalho e dos filtros e cada
 * coluna rola por dentro. O cabeçalho e os filtros ficam num contêiner de 1440 px (use `CabecalhoDoQuadro`).
 */
export function PaginaDeQuadro({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <main
      data-quadro=""
      className={cn('flex h-full min-h-0 w-full flex-1 flex-col gap-4 p-6 max-md:p-4', className)}
    >
      {children}
    </main>
  )
}

/** O topo da página de quadro (título, filtros, resumo): centralizado em até 1440 px, como nas outras telas. */
export function CabecalhoDoQuadro({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">{children}</div>
}

/** A caixa da tabela: borda e cantos arredondados, com a tabela e a `Paginacao` dentro. */
export function AreaDaTabela({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-clip rounded-lg border border-border bg-surface',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Onde fica a tabela. Sem rolagem vertical. A horizontal só existe abaixo de `lg`, quando as colunas não
 * cabem (com ela o cabeçalho deixa de grudar, porque o contêiner passa a ser o da rolagem); de `lg` para
 * cima a tabela cabe e o cabeçalho gruda no topo da área central.
 */
export function CorpoDaTabela({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={cn('min-w-0 max-lg:overflow-x-auto', className)}>{children}</div>
}

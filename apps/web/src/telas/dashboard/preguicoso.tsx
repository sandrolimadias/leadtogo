import { lazy, Suspense } from 'react'

import { Skeleton } from '@leadtogo/ui/feedback'

// A biblioteca de gráficos (Recharts) só é baixada na rota do Dashboard: as outras telas não pagam por ela.
const PaginaDoDashboard = lazy(() =>
  import('./pagina').then((m) => ({ default: m.PaginaDoDashboard })),
)

/** O Dashboard carregado sob demanda, com um esqueleto enquanto o pedaço da tela e dos gráficos chega. */
export function DashboardSobDemanda() {
  return (
    <Suspense
      fallback={
        <main className="flex w-full flex-1 flex-col gap-4 p-6 max-md:p-4">
          <h1 className="sr-only">Dashboard</h1>
          <div role="status" aria-label="Carregando o Dashboard">
            <Skeleton height={112} />
          </div>
        </main>
      }
    >
      <PaginaDoDashboard />
    </Suspense>
  )
}

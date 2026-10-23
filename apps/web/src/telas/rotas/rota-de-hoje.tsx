import { codigoDaRota } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Route as RotaIcone } from 'lucide-react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'

/** O card "Rota de hoje" do Dashboard (G4b): a rota do dia da própria pessoa e quantas paradas faltam. */
export function CardDaRotaDeHoje() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const hoje = useQuery({
    queryKey: ['rotas', 'hoje'],
    enabled: pode('rotas.ver'),
    retry: false,
    queryFn: async () => {
      const r = await servicos.rotas.hoje()
      return r.ok ? r.dados : []
    },
  })
  return (
    <>
      {(hoje.data ?? []).map((r) => {
        const faltam = r.paradas.filter((p) => p.situacao === 'pendente').length
        const visitadas = r.paradas.filter((p) => p.situacao === 'visitada').length
        return (
          <Link
            key={r.id}
            to="/rotas/$rotaId"
            params={{ rotaId: r.id }}
            className="flex items-center gap-3 rounded-lg border border-brand bg-brand-soft px-4 py-3 text-ink"
          >
            <RotaIcone size={18} aria-hidden="true" className="text-brand" />
            <span className="flex-1 text-sm">
              <strong>Rota de hoje</strong> · {codigoDaRota(r.codigo)} {r.nome}: {visitadas} de{' '}
              {r.paradas.length} visitadas
              {faltam && r.situacao !== 'concluida' ? `, faltam ${faltam}` : ''}
            </span>
            <span className="text-sm font-semibold text-brand">Abrir</span>
          </Link>
        )
      })}
    </>
  )
}

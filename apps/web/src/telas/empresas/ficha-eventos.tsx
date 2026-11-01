import type { EventoDaEmpresa } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Star } from 'lucide-react'

import { useServicos } from '@/auth/contexto'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'

import { dataEHora } from './formatos'

const PRESENCA: Record<EventoDaEmpresa['presenca'], string | null> = {
  nao_registrada: null,
  checkin_qr: 'Presente (QR)',
  manual: 'Presente',
}
const SITUACAO: Record<EventoDaEmpresa['situacao'], string> = {
  confirmado: 'Inscrito',
  lista_espera: 'Lista de espera',
  cancelado: 'Cancelou',
}

/** Aba Eventos da ficha (Fase 4G, B-21): quem da empresa se inscreveu nos eventos do portal, presença e nota. */
export function EventosDaEmpresaAba({ empresaId }: { empresaId: string }) {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: ['empresa', empresaId, 'eventos'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.portal.eventos.daEmpresa(empresaId)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (consulta.isError) return <Alert tone="danger">{consulta.error.message}</Alert>
  if (!consulta.data) return <Skeleton lines={3} />
  if (consulta.data.itens.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nenhuma inscrição em eventos"
        description="Quando alguém desta empresa se inscrever num evento do portal, aparece aqui."
      />
    )
  }
  return (
    <ul
      aria-label="Eventos da empresa"
      className="m-0 list-none overflow-hidden rounded-md border border-border bg-surface p-0"
    >
      {consulta.data.itens.map((i) => {
        const presenca = PRESENCA[i.presenca]
        return (
          <li
            key={`${i.eventoId}-${i.pessoa}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 basis-56 flex-col">
              <span className="truncate font-semibold">{i.titulo}</span>
              <span className="truncate text-xs text-ink-muted">
                {dataEHora(i.inicioEm)} · {i.pessoa}
              </span>
            </span>
            <Badge tone={i.situacao === 'cancelado' ? 'neutral' : 'info'}>
              {SITUACAO[i.situacao]}
            </Badge>
            {presenca ? <Badge tone="success">{presenca}</Badge> : null}
            {i.nota !== null ? (
              <span
                className="inline-flex items-center gap-1 text-sm tabular-nums"
                aria-label={`Nota ${i.nota}`}
              >
                <Star className="size-4 text-warning" aria-hidden="true" />
                {i.nota}
              </span>
            ) : i.avaliou ? (
              <Badge tone="neutral">Avaliou</Badge>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

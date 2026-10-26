import { useQuery } from '@tanstack/react-query'
import { CalendarDays } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { SegmentedControl } from '@leadtogo/ui/segmented-control'

import { CartaoDeEvento } from '@/components/cartao-de-evento'
import { useServicos } from '@/servicos/contexto'

const POR_PAGINA = 20

/** A agenda da empresa do cliente: próximos eventos e passados, com confirmação de presença. */
export function TelaAgenda() {
  const servicos = useServicos()
  const [aba, setAba] = useState<'proximos' | 'passados'>('proximos')
  const [pagina, setPagina] = useState(1)
  const consulta = useQuery({
    queryKey: ['eventos', 'lista', aba, pagina],
    queryFn: async () => {
      const r = await servicos.eventos.listar(aba, pagina)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const lista = consulta.data
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="m-0 text-2xl leading-8 font-semibold">Agenda</h1>
          <p className="mt-1 mb-0 text-sm leading-5 text-ink-muted">
            Eventos da equipe para a sua empresa. Confirme a presença para garantir a vaga.
          </p>
        </div>
        <SegmentedControl
          label="Mostrar"
          value={aba}
          onChange={(v) => {
            setAba(v as 'proximos' | 'passados')
            setPagina(1)
          }}
          options={[
            { value: 'proximos', label: 'Próximos' },
            { value: 'passados', label: 'Passados' },
          ]}
        />
      </header>
      {consulta.isError ? (
        <Alert tone="danger" title="Não foi possível carregar a agenda.">
          Tente de novo em instantes.
        </Alert>
      ) : null}
      {!lista ? (
        <Skeleton lines={4} />
      ) : lista.itens.length === 0 ? (
        <div className="rounded-md border border-border bg-surface">
          <EmptyState
            icon={CalendarDays}
            title={aba === 'proximos' ? 'Nenhum evento por vir' : 'Nenhum evento passado'}
            description={
              aba === 'proximos'
                ? 'Quando a equipe publicar um evento para a sua empresa, ele aparece aqui.'
                : 'Os eventos que já aconteceram ficam aqui.'
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {lista.itens.map((e) => (
            <CartaoDeEvento key={e.id} e={e} />
          ))}
        </div>
      )}
      {lista && lista.total > pagina * POR_PAGINA ? (
        <Button onClick={() => setPagina((p) => p + 1)}>Próxima página</Button>
      ) : null}
      {pagina > 1 ? (
        <Button variant="ghost" onClick={() => setPagina((p) => p - 1)}>
          Página anterior
        </Button>
      ) : null}
    </div>
  )
}

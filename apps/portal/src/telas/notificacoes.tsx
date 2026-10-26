import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell } from 'lucide-react'

import { Button } from '@leadtogo/ui/button'
import { cn } from '@leadtogo/ui/cn'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'

import { tempoRelativo } from '@/casca/rotulos'
import { useServicos } from '@/servicos/contexto'

const TELAS = ['/', '/chamados', '/documentos', '/agenda', '/notificacoes', '/perfil'] as const

/** O sino do cliente: chamados, agenda e avisos da equipe. */
export function TelaNotificacoes() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const consulta = useQuery({
    queryKey: ['notificacoes', 'lista'],
    queryFn: async () => {
      const r = await servicos.notificacoes.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const reler = () => void queryClient.invalidateQueries({ queryKey: ['notificacoes'] })

  const abrir = async (id: string, destino: string | null | undefined) => {
    await servicos.notificacoes.marcarLida(id)
    reler()
    if (!destino) return
    // o destino é uma tela conhecida do portal, um chamado ou (nos avisos) um endereço http(s) em outra aba;
    // qualquer outra coisa não é seguida
    const chamado = destino.match(/^\/chamados\/([0-9a-f-]{36})$/)
    if (chamado?.[1]) {
      await navegar({ to: '/chamados/$chamadoId', params: { chamadoId: chamado[1] } })
    } else if ((TELAS as readonly string[]).includes(destino)) {
      await navegar({ to: destino as (typeof TELAS)[number] })
    } else if (/^https?:\/\/\S+$/i.test(destino)) {
      window.open(destino, '_blank', 'noopener,noreferrer')
    }
  }
  const marcarTodas = async () => {
    await servicos.notificacoes.marcarTodas()
    reler()
  }
  const lista = consulta.data
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex items-center gap-3">
        <h1 className="m-0 mr-auto text-2xl leading-8 font-semibold">Notificações</h1>
        {lista && lista.naoLidas > 0 ? (
          <Button onClick={() => void marcarTodas()}>Marcar todas como lidas</Button>
        ) : null}
      </header>
      {consulta.isError ? (
        <Alert tone="danger" title="Não foi possível carregar as notificações." />
      ) : null}
      <div className="rounded-md border border-border bg-surface">
        {!lista ? (
          <div className="p-4">
            <Skeleton lines={3} />
          </div>
        ) : lista.itens.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nenhuma notificação"
            description="Quando a equipe responder um chamado ou enviar um aviso, ele aparece aqui."
          />
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {lista.itens.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void abrir(n.id, n.destino)}
                  className={cn(
                    'flex w-full cursor-pointer flex-col gap-0.5 border-0 bg-transparent px-4 py-3 text-left hover:bg-surface-hover',
                    !n.lida && 'bg-brand-soft',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm leading-5 font-semibold">
                    {n.titulo}
                    {!n.lida ? (
                      <span aria-label="não lida" className="size-2 rounded-full bg-brand" />
                    ) : null}
                  </span>
                  {n.corpo ? (
                    <span className="text-sm leading-5 text-ink-muted">{n.corpo}</span>
                  ) : null}
                  <span className="text-xs leading-4 text-ink-muted">
                    {tempoRelativo(n.criadaEm)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

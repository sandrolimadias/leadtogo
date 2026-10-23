import type { Notificacao } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell, CheckCheck } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button, IconButton } from '@/components/ui/button'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { cn } from '@/lib/cn'

import { useFluxoDoSino } from './fluxo-do-sino'

const chaveDoSino = ['notificacoes', 'sino'] as const

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** Sino de notificações (painel de 360 px): as do próprio membro, a mais nova primeiro. */
export function Notificacoes({ tamanho = 'md' }: { tamanho?: 'md' | 'lg' }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  const [aberto, setAberto] = useState(false)
  useFluxoDoSino()

  const lista = useQuery({
    queryKey: chaveDoSino,
    retry: false,
    queryFn: async () => {
      const r = await servicos.notificacoes.listar({ porPagina: 20 })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const naoLidas = lista.data?.naoLidas ?? 0

  const marcarELer = async (n: Notificacao) => {
    setAberto(false)
    if (!n.lida) {
      await servicos.notificacoes.marcarLida(n.id)
      void queryClient.invalidateQueries({ queryKey: ['notificacoes'] })
    }
    if (n.link) void navegar({ to: n.link })
  }
  const marcarTodas = async () => {
    await servicos.notificacoes.marcarTodas()
    void queryClient.invalidateQueries({ queryKey: ['notificacoes'] })
  }

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Popover.Trigger asChild>
        <span className="relative inline-flex">
          <IconButton
            icon={Bell}
            label={naoLidas > 0 ? `Notificações (${naoLidas} não lidas)` : 'Notificações'}
            size={tamanho}
          />
          {naoLidas > 0 ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-bold text-on-danger"
            >
              {naoLidas > 99 ? '99+' : naoLidas}
            </span>
          ) : null}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-[1000] w-[360px] max-w-[calc(100vw-24px)] rounded-md border border-border bg-surface p-1 text-ink shadow-md"
        >
          <div className="flex items-center gap-2 px-3 pt-2 pb-1">
            <span className="flex-1 text-[11px] font-semibold tracking-[.06em] text-ink-subtle uppercase">
              Notificações
            </span>
            {naoLidas > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                icon={CheckCheck}
                onClick={() => void marcarTodas()}
              >
                Marcar todas como lidas
              </Button>
            ) : null}
          </div>
          {lista.isPending ? (
            <div className="p-3">
              <Skeleton lines={3} />
            </div>
          ) : lista.isError ? (
            <div className="p-2">
              <Alert tone="danger">Não consegui carregar as notificações.</Alert>
            </div>
          ) : lista.data.itens.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Nenhuma notificação"
              description="Avisos dos chamados e do dia a dia aparecem aqui."
              className="py-6"
            />
          ) : (
            <ul
              aria-label="Notificações"
              className="m-0 max-h-[420px] list-none overflow-y-auto p-0"
            >
              {lista.data.itens.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void marcarELer(n)}
                    className={cn(
                      'flex w-full cursor-pointer flex-col gap-0.5 rounded-sm border-0 bg-transparent px-3 py-2 text-left text-ink hover:bg-surface-hover',
                      !n.lida && 'bg-surface-selected',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {!n.lida ? (
                        <span
                          aria-label="Não lida"
                          className="size-2 shrink-0 rounded-full bg-brand"
                        />
                      ) : null}
                      <span className={cn('text-sm', !n.lida && 'font-semibold')}>{n.titulo}</span>
                    </span>
                    {n.mensagem ? (
                      <span className="line-clamp-2 text-[13px] text-ink-muted">{n.mensagem}</span>
                    ) : null}
                    <span className="text-xs text-ink-subtle tabular-nums">
                      {quando(n.criadoEm)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

import { Link } from '@tanstack/react-router'
import { LifeBuoy, Plus } from 'lucide-react'
import { useState } from 'react'

import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'

import { AbrirChamado } from './abrir'
import { useChamadosAbertosDaEmpresa } from './da-empresa'
import { LinhaDoChamado } from './lista'

/**
 * Aba Chamados da ficha da empresa: os chamados abertos (nem resolvidos nem fechados) ligados a ela, com
 * "Abrir chamado" já com a empresa. Os resolvidos e fechados ficam na central de chamados.
 */
export function ChamadosDaEmpresa({ empresa }: { empresa: { id: string; nome: string } }) {
  const { pode } = usePermissoes()
  const [abrindo, setAbrindo] = useState(false)
  const lista = useChamadosAbertosDaEmpresa(empresa.id, true)
  const abrir = pode('chamados.criar') ? (
    <Button variant="primary" icon={Plus} onClick={() => setAbrindo(true)}>
      Abrir chamado
    </Button>
  ) : null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 text-[13px] text-ink-muted" aria-live="polite">
          {lista.data
            ? lista.data.total === 1
              ? '1 chamado aberto'
              : `${lista.data.total} chamados abertos`
            : ''}
        </span>
        <Link to="/chamados" className="text-[13px] font-semibold">
          Ver a central de chamados
        </Link>
        {abrir}
      </div>
      {lista.isPending ? (
        <div
          role="status"
          aria-label="Carregando os chamados"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <Skeleton lines={4} />
        </div>
      ) : lista.isError ? (
        <Alert
          tone="danger"
          title="Não foi possível carregar os chamados"
          actions={
            <Button size="sm" onClick={() => void lista.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {lista.error.message}
        </Alert>
      ) : lista.data.itens.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={LifeBuoy}
            title="Nenhum chamado aberto"
            description="Os chamados desta empresa que ainda não foram resolvidos aparecem aqui."
          />
        </div>
      ) : (
        <ul
          aria-label="Chamados abertos"
          className="m-0 list-none rounded-lg border border-border bg-surface p-0"
        >
          {lista.data.itens.map((c) => (
            <LinhaDoChamado key={c.id} c={c} />
          ))}
        </ul>
      )}
      <AbrirChamado aberto={abrindo} aoFechar={() => setAbrindo(false)} empresa={empresa} />
    </div>
  )
}

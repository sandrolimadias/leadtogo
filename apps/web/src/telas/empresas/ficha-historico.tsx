import type { EntradaDoHistorico, HistoricoDaEmpresa } from '@leadtogo/api-client'
import { useInfiniteQuery } from '@tanstack/react-query'
import {
  Bot,
  History,
  type LucideIcon,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Tags,
  Trash2,
  UserRoundCog,
} from 'lucide-react'

import { useServicos } from '@/auth/contexto'
import type { Resultado } from '@/auth/tipos'
import { Button } from '@/components/ui/button'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'

import { dataEHora } from './formatos'

const ICONES: Record<string, LucideIcon> = {
  'Empresa cadastrada': Plus,
  'Contato cadastrado': Plus,
  'Criado a partir de sócio': Plus,
  'Consentimento alterado': ShieldCheck,
  'Contato excluído': Trash2,
  'Dados alterados': Pencil,
  'Carteira transferida': UserRoundCog,
  'Tags alteradas': Tags,
  'Atualizado pela Receita': RefreshCw,
  'Consulta à Receita': RefreshCw,
  'Empresa excluída': Trash2,
}

function Entrada({ e }: { e: EntradaDoHistorico }) {
  const Icone = ICONES[e.titulo] ?? (e.automatica ? Bot : History)
  return (
    <li className="flex gap-3 border-b border-border py-3 last:border-b-0">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-muted"
      >
        <Icone size={14} strokeWidth={1.75} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold">{e.titulo}</span>
        {e.mudancas.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px]">
            {e.mudancas.map((m) => (
              <li key={m.campo} className="[overflow-wrap:anywhere]">
                <span className="text-ink-muted">{m.rotulo}: </span>
                {m.de !== null && m.para !== null ? (
                  <>
                    <span className="text-ink-muted line-through">{m.de}</span>
                    {' → '}
                    <span className="font-semibold">{m.para}</span>
                  </>
                ) : m.para !== null ? (
                  <span className="font-semibold">{m.para}</span>
                ) : (
                  <span className="text-ink-muted line-through">{m.de}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <span className="text-xs text-ink-muted tabular-nums">
          {dataEHora(e.em)} · {e.por.nome}
        </span>
      </div>
    </li>
  )
}

/**
 * Aba Histórico das fichas (empresa e contato): a auditoria em português; "Carregar mais" traz as páginas
 * antigas. Quem usa diz de onde vêm as páginas e o texto de cada situação.
 */
export function HistoricoAba({
  chave,
  buscar,
  rotulo,
  descricaoVazia,
}: {
  chave: readonly unknown[]
  buscar: (pagina: number) => Promise<Resultado<HistoricoDaEmpresa>>
  rotulo: string
  descricaoVazia: string
}) {
  const consulta = useInfiniteQuery({
    queryKey: chave,
    retry: false,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const r = await buscar(pageParam)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
    getNextPageParam: (ultima) =>
      ultima.pagina * ultima.porPagina < ultima.total ? ultima.pagina + 1 : undefined,
  })

  if (consulta.isPending) {
    return (
      <div role="status" aria-label="Carregando o histórico" className="p-4">
        <Skeleton lines={4} />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <Alert
        tone="danger"
        title="Não foi possível carregar o histórico"
        actions={
          <Button size="sm" onClick={() => void consulta.refetch()}>
            Tentar de novo
          </Button>
        }
      >
        {consulta.error.message}
      </Alert>
    )
  }
  const itens = consulta.data.pages.flatMap((p) => p.itens)
  if (itens.length === 0) {
    return (
      <EmptyState icon={History} title="Nada no histórico ainda" description={descricaoVazia} />
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4">
      <ul className="m-0 list-none p-0" aria-label={rotulo}>
        {itens.map((e) => (
          <Entrada key={e.id} e={e} />
        ))}
      </ul>
      {consulta.hasNextPage ? (
        <div className="flex justify-center pb-3">
          <Button
            loading={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Carregar mais
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Aba Histórico da ficha da empresa. */
export function HistoricoDaEmpresaAba({ empresaId }: { empresaId: string }) {
  const servicos = useServicos()
  return (
    <HistoricoAba
      chave={['carteira', 'historico', empresaId]}
      buscar={(pagina) => servicos.carteira.historico(empresaId, pagina)}
      rotulo="Histórico da empresa"
      descricaoVazia="As alterações da empresa vão aparecendo aqui."
    />
  )
}

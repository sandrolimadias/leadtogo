import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { MapPinOff, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'

import { useServicos } from '@/auth/contexto'
import { Badge } from '@/components/ui/exibicao'
import { Skeleton } from '@/components/ui/feedback'
import { guardarEmpresas } from '@/lib/offline/visitas'
import { Cartao } from '@/telas/empresas/ficha-resumo'

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/**
 * Relatórios de visita da empresa, na ficha (G3b): os mais novos primeiro, com os selos "sem check-in"
 * e "fora do limite" (este, só para quem vê a localização). Abrir a ficha também guarda a empresa no
 * aparelho (as "abertas recentemente" do offline).
 */
export function VisitasDaEmpresa({ empresaId }: { empresaId: string }) {
  const servicos = useServicos()
  const lista = useQuery({
    queryKey: ['visitas', 'da-empresa', empresaId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.visitas.campo.listar({ empresaId })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  useEffect(() => {
    void (async () => {
      const r = await servicos.visitas.campo.offline([empresaId])
      if (r.ok) await guardarEmpresas(r.dados.empresas).catch(() => undefined)
    })()
  }, [empresaId, servicos])

  const itens = lista.data ?? []
  if (lista.isSuccess && itens.length === 0) return null
  return (
    <Cartao titulo="Relatórios de visita" semMargem>
      {lista.isPending ? (
        <div className="p-4">
          <Skeleton lines={2} />
        </div>
      ) : lista.isError ? (
        <p className="m-0 p-4 text-sm text-ink-muted">{lista.error.message}</p>
      ) : (
        <ul aria-label="Relatórios de visita" className="m-0 flex list-none flex-col p-0">
          {itens.slice(0, 10).map((v) => (
            <li key={v.id} className="border-b border-border last:border-b-0">
              <Link
                to="/visitas/$relatorioId"
                params={{ relatorioId: v.id }}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 text-ink hover:bg-surface-hover"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">
                    {v.resultado?.nome ?? 'Relatório pendente'}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {dataCurta(v.concluidoEm ?? v.checkinEm ?? v.criadoEm)} · {v.responsavel.nome}
                  </span>
                </span>
                {v.situacao === 'rascunho' ? <Badge tone="warning">Pendente</Badge> : null}
                {v.semCheckin ? (
                  <Badge tone="neutral" icon={MapPinOff}>
                    Sem check-in
                  </Badge>
                ) : null}
                {v.foraDoLimite ? (
                  <Badge tone="danger" icon={TriangleAlert}>
                    Fora do limite
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  )
}

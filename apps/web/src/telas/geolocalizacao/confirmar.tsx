import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePorPagina } from '@/casca/preferencias'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Paginacao } from '@/components/ui/paginacao'

import { textoDasFaltas } from './rotulos'

/**
 * A fila "Confirmar endereço": as empresas com a tag de sistema "Endereço a confirmar", com o que falta
 * em cada uma e o atalho para a ficha (onde o endereço se completa ou o ponto se marca no mapa).
 */
export function FilaDeConfirmacao() {
  const servicos = useServicos()
  const [pagina, setPagina] = useState(1)
  const tamanho = usePorPagina('geo_fila')
  const fila = useQuery({
    queryKey: ['geolocalizacao', 'fila', pagina, tamanho.porPagina],
    enabled: tamanho.pronto,
    retry: false,
    queryFn: async () => {
      const r = await servicos.geolocalizacao.fila(pagina, tamanho.porPagina)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (fila.isPending) return <Skeleton className="h-24 w-full" />
  if (fila.isError) return <Alert tone="danger">Não consegui carregar a fila.</Alert>
  if (fila.data.total === 0) {
    return (
      <EmptyState
        title="Nenhum endereço para confirmar"
        description="Toda empresa com endereço completo já foi posicionada no mapa."
      />
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-ink-muted">
        {fila.data.total.toLocaleString('pt-BR')}{' '}
        {fila.data.total === 1 ? 'empresa precisa' : 'empresas precisam'} de endereço completo (rua,
        número, bairro e cidade) ou de um ponto marcado no mapa para aparecer nele.
      </p>
      <ul
        aria-label="Empresas com endereço a confirmar"
        className="m-0 flex list-none flex-col gap-2 p-0"
      >
        {fila.data.itens.map((i) => (
          <li
            key={i.empresaId}
            className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border border-border bg-surface px-4 py-3 max-sm:grid-cols-1"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold">{i.nome}</span>
              <span className="truncate text-[13px] text-ink-muted">
                {i.endereco}
                {i.municipio ? ` · ${i.municipio}` : ''}
              </span>
              <span className="text-[13px] text-danger">
                {textoDasFaltas(i.faltas) || 'Não achei esse endereço.'}
              </span>
            </div>
            <Link
              to="/empresas/$empresaId"
              params={{ empresaId: i.empresaId }}
              className="inline-flex items-center gap-1 text-sm font-semibold"
            >
              Abrir a ficha <ExternalLink size={14} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <Paginacao
        pagina={fila.data.pagina}
        porPagina={fila.data.porPagina}
        total={fila.data.total}
        aoMudarPagina={setPagina}
        aoMudarPorPagina={tamanho.mudar}
      />
    </div>
  )
}

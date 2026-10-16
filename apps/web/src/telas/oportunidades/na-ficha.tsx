import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePorPagina } from '@/casca/preferencias'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Paginacao } from '@/components/ui/paginacao'

import { useFormularioDeOportunidade } from './contexto-formulario'
import { diaDoBanco, previsaoEmPalavras, reais, rotuloDoStatus, TOM_DO_STATUS } from './formatos'

/** A aba Oportunidades da ficha da empresa: abertas, conquistadas e perdidas, com "Nova oportunidade". */
export function OportunidadesDaEmpresa({
  empresa,
  podeCriar,
}: {
  empresa: { id: string; nome: string }
  podeCriar: boolean
}) {
  const servicos = useServicos()
  const { abrir } = useFormularioDeOportunidade()
  const tamanho = usePorPagina('oportunidades_ficha')
  const [pagina, setPagina] = useState(1)
  const lista = useQuery({
    queryKey: ['oportunidades', 'da-ficha', empresa.id, pagina, tamanho.porPagina],
    enabled: tamanho.pronto,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.oportunidades.listar({
        empresaId: empresa.id,
        pagina,
        porPagina: tamanho.porPagina,
        ordem: 'criada',
        sentido: 'desc',
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const nova = podeCriar ? (
    <Button variant="primary" icon={Plus} onClick={() => abrir({ empresa })}>
      Nova oportunidade
    </Button>
  ) : null

  return (
    <section aria-label="Oportunidades" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base leading-6 font-semibold">Oportunidades</h2>
        {nova}
      </div>
      {lista.isError ? <Alert tone="danger">{lista.error.message}</Alert> : null}
      {lista.isPending && tamanho.pronto ? <Skeleton height={56} /> : null}
      {lista.data && lista.data.total === 0 ? (
        <EmptyState
          title="Nenhuma oportunidade ainda"
          description="As oportunidades de venda desta empresa, abertas e fechadas, aparecem aqui."
          {...(nova ? { actions: nova } : {})}
        />
      ) : null}
      {lista.data && lista.data.total > 0 ? (
        <div
          className={`flex flex-col rounded-lg border border-border bg-surface ${lista.isPlaceholderData ? 'opacity-60' : ''}`}
        >
          <ul
            aria-label="Oportunidades da empresa"
            className="m-0 flex list-none flex-col px-4 py-1"
          >
            {lista.data.itens.map((o) => {
              const previsao = previsaoEmPalavras(o)
              return (
                <li
                  key={o.id}
                  className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      to="/oportunidades/$oportunidadeId"
                      params={{ oportunidadeId: o.id }}
                      className="text-sm font-semibold text-ink no-underline [overflow-wrap:anywhere] hover:underline"
                    >
                      {o.titulo}
                    </Link>
                    <span className="text-[13px] text-ink-muted">
                      {[
                        o.solucao?.nome,
                        o.status === 'ativo'
                          ? o.fase.nome
                          : `parou em ${o.faseParouEm?.nome ?? o.fase.nome}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  <Badge tone={TOM_DO_STATUS[o.status]}>{rotuloDoStatus(o.status)}</Badge>
                  <div className="flex flex-col items-end text-sm tabular-nums">
                    <span className="font-semibold">{reais(o.valorTotal)}</span>
                    {o.valorMensal > 0 ? (
                      <span className="text-[13px] text-ink-muted">{reais(o.valorMensal)}/mês</span>
                    ) : null}
                  </div>
                  <span className="w-44 text-right text-[13px] text-ink-muted max-md:w-auto">
                    {o.status === 'perdido' || o.status === 'cancelado'
                      ? `Motivo: ${o.motivo?.nome ?? '—'}`
                      : o.status === 'conquistado'
                        ? `Fechada em ${diaDoBanco(o.dataFechamento?.slice(0, 10) ?? null)}`
                        : previsao.texto}
                  </span>
                </li>
              )
            })}
          </ul>
          <Paginacao
            pagina={lista.data.pagina}
            porPagina={lista.data.porPagina}
            total={lista.data.total}
            aoMudarPagina={setPagina}
            aoMudarPorPagina={(n) => {
              setPagina(1)
              tamanho.mudar(n)
            }}
          />
        </div>
      ) : null}
    </section>
  )
}

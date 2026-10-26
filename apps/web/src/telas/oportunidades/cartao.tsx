import type { Oportunidade } from '@leadtogo/api-client'
import { Link } from '@tanstack/react-router'
import { CalendarClock, GripVertical, Hourglass, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { Avatar } from '@leadtogo/ui/exibicao'
import { cn } from '@leadtogo/ui/cn'
import { quandoDaAtividade } from '@/telas/atividades/formatos'
import { BolhaDoTipo } from '@/telas/cadastros/tipos-de-atividade'

import { previsaoEmPalavras, reais } from './formatos'

/**
 * O card do Kanban: nome, empresa, valor (total e mensal), responsável, previsão (vencida em vermelho, hoje
 * em âmbar, sem data = "Sem previsão"), próxima atividade (ou "Sem próxima atividade" em destaque) e o alerta
 * de parada, sempre com a frase e não só com a cor.
 */
export function CartaoDeOportunidade({
  o,
  alca,
  menu,
  arrastando,
  sobreposto,
}: {
  o: Oportunidade
  /** A alça de arrastar (desktop); sem ela, só o menu move o card (celular) */
  alca?: ReactNode
  menu?: ReactNode
  /** O card original, enquanto o clone é arrastado */
  arrastando?: boolean
  /** O clone que acompanha o ponteiro */
  sobreposto?: boolean
}) {
  const previsao = previsaoEmPalavras(o)
  return (
    <article
      aria-label={o.titulo}
      className={cn(
        'flex flex-col gap-2 rounded-md border bg-surface p-3 text-sm shadow-xs',
        o.parada ? 'border-warning' : 'border-border',
        arrastando && 'opacity-40',
        sobreposto && 'shadow-lg',
      )}
    >
      <div className="flex items-start gap-1.5">
        {alca}
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            to="/oportunidades/$oportunidadeId"
            params={{ oportunidadeId: o.id }}
            className="font-semibold text-ink no-underline [overflow-wrap:anywhere] hover:underline"
          >
            {o.titulo}
          </Link>
          <span className="truncate text-[13px] text-ink-muted">{o.empresa.nome}</span>
        </div>
        {menu}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold tabular-nums">{reais(o.valorTotal)}</span>
        {o.valorMensal > 0 ? (
          <span className="text-[13px] text-ink-muted tabular-nums">
            {reais(o.valorMensal)}/mês
          </span>
        ) : null}
        <span className="ml-auto text-xs text-ink-muted tabular-nums" title="Probabilidade">
          {o.probabilidade}%
        </span>
      </div>
      <div className="flex items-center gap-2 text-[13px]">
        <Avatar name={o.responsavel.nome} size="sm" />
        <span
          className={cn(
            'flex min-w-0 items-center gap-1',
            previsao.tom === 'vencida' && 'font-semibold text-danger',
            previsao.tom === 'hoje' && 'font-semibold text-warning',
            (previsao.tom === 'sem' || previsao.tom === 'normal') && 'text-ink-muted',
          )}
        >
          {previsao.tom === 'vencida' ? (
            <TriangleAlert size={13} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
          ) : (
            <CalendarClock size={13} strokeWidth={1.75} aria-hidden="true" className="flex-none" />
          )}
          <span className="truncate">{previsao.texto}</span>
        </span>
      </div>
      {o.proximaAtividade ? (
        <div className="flex items-center gap-2 text-[13px] text-ink-muted">
          <BolhaDoTipo icone={o.proximaAtividade.tipoIcone} cor={o.proximaAtividade.tipoCor} />
          <span className="min-w-0 truncate">
            {o.proximaAtividade.titulo} ·{' '}
            {quandoDaAtividade({
              dataInicio: o.proximaAtividade.em,
              diaInteiro: o.proximaAtividade.diaInteiro,
            })}
          </span>
        </div>
      ) : (
        <span className="inline-flex w-fit items-center gap-1 rounded-xs bg-warning-soft px-1.5 text-xs leading-5 font-semibold text-warning">
          <CalendarClock size={13} strokeWidth={1.75} aria-hidden="true" />
          Sem próxima atividade
        </span>
      )}
      {o.parada ? (
        <span className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-warning">
          <Hourglass size={13} strokeWidth={1.75} aria-hidden="true" />
          Parada há {o.diasParada} {o.diasParada === 1 ? 'dia' : 'dias'} nesta fase
        </span>
      ) : null}
    </article>
  )
}

/** A alça (ícone de seis pontos) por onde o card se arrasta. */
export function AlcaDeArrastar({ titulo, ...props }: { titulo: string } & Record<string, unknown>) {
  return (
    <button
      type="button"
      aria-label={`Arrastar ${titulo}`}
      {...props}
      className="mt-0.5 flex size-5 flex-none cursor-grab touch-none items-center justify-center rounded-xs border-0 bg-transparent p-0 text-ink-subtle hover:bg-surface-hover hover:text-ink active:cursor-grabbing"
    >
      <GripVertical size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  )
}

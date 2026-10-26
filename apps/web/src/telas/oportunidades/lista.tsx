import type { Oportunidade } from '@leadtogo/api-client'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { Badge } from '@leadtogo/ui/exibicao'
import { cn } from '@leadtogo/ui/cn'
import { classeDaCor } from '@leadtogo/ui/cores'

import { diaDoBanco, previsaoEmPalavras, reais, rotuloDoStatus, TOM_DO_STATUS } from './formatos'

// `sticky`: o cabeçalho das colunas fica no topo da área central (docs/design_system.md, "Layout e rolagem")
const cabecalho =
  'sticky top-0 z-10 h-9 border-b border-border bg-surface-sunken px-3 text-left text-xs font-semibold text-ink-muted'
const celula = 'border-b border-border px-3 py-2.5 align-top'

export function EstadoDaOportunidade({ o }: { o: Oportunidade }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={TOM_DO_STATUS[o.status]}>{rotuloDoStatus(o.status)}</Badge>
      <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
        <span
          aria-hidden="true"
          className={cn('size-2 rounded-full', classeDaCor[(o.faseParouEm ?? o.fase).cor])}
        />
        {o.status === 'ativo' ? o.fase.nome : `Parou em ${o.faseParouEm?.nome ?? o.fase.nome}`}
      </span>
    </span>
  )
}

/** A lista simples (qualquer status) das Oportunidades: valores à direita, dígitos tabulares. */
export function TabelaDeOportunidades({
  itens,
  menu,
}: {
  itens: Oportunidade[]
  menu: (o: Oportunidade) => ReactNode
}) {
  return (
    <table className="w-full border-collapse text-sm leading-5">
      <thead className="bg-surface-sunken">
        <tr>
          <th scope="col" className={cabecalho}>
            Oportunidade
          </th>
          <th scope="col" className={cabecalho}>
            Situação
          </th>
          <th scope="col" className={cn(cabecalho, 'text-right')}>
            Total
          </th>
          <th scope="col" className={cn(cabecalho, 'text-right')}>
            Ponderado
          </th>
          <th scope="col" className={cn(cabecalho, 'text-right')}>
            Prob.
          </th>
          <th scope="col" className={cabecalho}>
            Previsão
          </th>
          <th scope="col" className={cabecalho}>
            Responsável
          </th>
          <th scope="col" className={cn(cabecalho, 'w-12')}>
            <span className="sr-only">Ações</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {itens.map((o) => {
          const previsao = previsaoEmPalavras(o)
          return (
            <tr key={o.id}>
              <td className={celula}>
                <Link
                  to="/oportunidades/$oportunidadeId"
                  params={{ oportunidadeId: o.id }}
                  className="font-semibold text-ink no-underline [overflow-wrap:anywhere] hover:underline"
                >
                  {o.titulo}
                </Link>
                <div className="text-[13px] text-ink-muted">{o.empresa.nome}</div>
              </td>
              <td className={celula}>
                <EstadoDaOportunidade o={o} />
              </td>
              <td className={cn(celula, 'text-right tabular-nums')}>
                {reais(o.valorTotal)}
                {o.valorMensal > 0 ? (
                  <div className="text-[13px] text-ink-muted">{reais(o.valorMensal)}/mês</div>
                ) : null}
              </td>
              <td className={cn(celula, 'text-right tabular-nums')}>{reais(o.valorPonderado)}</td>
              <td className={cn(celula, 'text-right tabular-nums')}>{o.probabilidade}%</td>
              <td
                className={cn(
                  celula,
                  'whitespace-nowrap',
                  previsao.tom === 'vencida' && 'font-semibold text-danger',
                  previsao.tom === 'sem' && 'text-ink-muted',
                )}
              >
                {o.status === 'ativo' || !o.dataFechamento
                  ? previsao.texto
                  : `Fechada em ${diaDoBanco(o.dataFechamento.slice(0, 10))}`}
              </td>
              <td className={celula}>{o.responsavel.nome}</td>
              <td className={cn(celula, 'text-right')}>{menu(o)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

import type { Atividade } from '@leadtogo/api-client'
import { Link } from '@tanstack/react-router'
import { Star, Zap } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/exibicao'
import { cn } from '@/lib/cn'
import { BolhaDoTipo } from '@/telas/cadastros/tipos-de-atividade'

import { quandoDaAtividade, situacaoEmPalavras } from './formatos'

/** Importante (estrela) e Urgente (raio), sempre com a palavra para o leitor de tela. */
export function MarcasDePrioridade({ a }: { a: Pick<Atividade, 'importante' | 'urgente'> }) {
  if (!a.importante && !a.urgente) return null
  return (
    <span className="inline-flex items-center gap-1 text-warning">
      {a.importante ? (
        <span className="inline-flex" title="Importante">
          <Star size={14} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Importante</span>
        </span>
      ) : null}
      {a.urgente ? (
        <span className="inline-flex text-danger" title="Urgente">
          <Zap size={14} strokeWidth={1.75} aria-hidden="true" />
          <span className="sr-only">Urgente</span>
        </span>
      ) : null}
    </span>
  )
}

export function SituacaoDaAtividade({ a }: { a: Pick<Atividade, 'situacao' | 'atrasada'> }) {
  const s = situacaoEmPalavras(a)
  return <Badge tone={s.tom}>{s.texto}</Badge>
}

/** O link para a empresa e para o contato da atividade (quando houver). */
export function QuemDaAtividade({ a, className }: { a: Atividade; className?: string }) {
  if (!a.empresa && !a.contato) return <span className={cn('text-ink-muted', className)}>—</span>
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      {a.empresa ? (
        <Link
          to="/empresas/$empresaId"
          params={{ empresaId: a.empresa.id }}
          className="truncate font-semibold text-ink no-underline hover:underline"
        >
          {a.empresa.nome}
        </Link>
      ) : null}
      {a.contato ? (
        <Link
          to="/contatos/$contatoId"
          params={{ contatoId: a.contato.id }}
          className="truncate text-[13px] text-ink-muted no-underline hover:underline"
        >
          {a.contato.nome}
        </Link>
      ) : null}
    </span>
  )
}

/**
 * Uma atividade em lista (linha do tempo das fichas e cartões do celular): ícone do tipo, título, quando,
 * quem, situação e, nas realizadas, o resultado.
 */
export function ItemDeAtividade({
  a,
  acoes,
  mostrarEmpresa = true,
  mostrarContato = true,
}: {
  a: Atividade
  acoes?: ReactNode
  mostrarEmpresa?: boolean
  mostrarContato?: boolean
}) {
  return (
    <li className="flex gap-3 border-b border-border py-3 last:border-b-0">
      <BolhaDoTipo icone={a.tipo.icone} cor={a.tipo.cor} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold [overflow-wrap:anywhere]">{a.titulo}</span>
          <MarcasDePrioridade a={a} />
          <SituacaoDaAtividade a={a} />
        </div>
        <span className="text-[13px] text-ink-muted tabular-nums">
          {a.situacao === 'realizada' && a.realizadaEm
            ? `Realizada em ${quandoDaAtividade({ dataInicio: a.realizadaEm, diaInteiro: false })}`
            : quandoDaAtividade(a)}
          {` · ${a.tipo.nome} · ${a.responsavel.nome}`}
        </span>
        {mostrarEmpresa || (mostrarContato && a.contato) ? (
          <QuemDaAtividade
            a={{
              ...a,
              empresa: mostrarEmpresa ? a.empresa : null,
              contato: mostrarContato ? a.contato : null,
            }}
          />
        ) : null}
        {a.resultado ? (
          <p className="m-0 text-[13px] [overflow-wrap:anywhere] whitespace-pre-line">
            <span className="text-ink-muted">Resultado: </span>
            {a.resultado}
          </p>
        ) : null}
      </div>
      {acoes ? <div className="flex-none">{acoes}</div> : null}
    </li>
  )
}

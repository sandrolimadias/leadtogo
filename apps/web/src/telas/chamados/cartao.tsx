import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LifeBuoy } from 'lucide-react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Badge } from '@/components/ui/exibicao'

import { selosDoPrazo } from './rotulos'

/** Quantos chamados aparecem no card do painel inicial. */
const NO_CARD = 5

/**
 * Card do painel inicial: os chamados pendentes de atendimento que a pessoa vê (os mais urgentes e antigos
 * primeiro), com o atalho para a lista. Some para quem não vê chamados e quando não há nenhum pendente.
 */
export function CardDeChamadosPendentes() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const lista = useQuery({
    queryKey: ['chamados', 'lista', { aba: 'pendentes', cartao: true }],
    enabled: pode('chamados.ver'),
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.listar({ aba: 'pendentes', porPagina: NO_CARD })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const total = lista.data?.abas.pendentes ?? 0
  if (!pode('chamados.ver') || !lista.data || total === 0) return null
  return (
    <section
      aria-label="Chamados pendentes"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <LifeBuoy size={18} aria-hidden="true" className="text-brand" />
        <h2 className="m-0 flex-1 text-sm font-semibold">
          Chamados pendentes <span className="text-ink-muted tabular-nums">({total})</span>
        </h2>
        <Link to="/chamados" className="text-sm font-semibold text-brand">
          Ver todos
        </Link>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {lista.data.itens.map((c) => {
          const atrasado = [
            selosDoPrazo(c.prazoResposta, 'Resposta'),
            selosDoPrazo(c.prazoResolucao, 'Resolução'),
          ].find((p) => p?.tom === 'danger')
          return (
            <li
              key={c.id}
              className="flex items-center gap-2 border-t border-border py-1.5 text-sm"
            >
              <Link
                to="/chamados/$chamadoId"
                params={{ chamadoId: c.id }}
                className="flex min-w-0 flex-1 items-baseline gap-2 text-ink no-underline hover:underline"
              >
                <span className="text-xs font-semibold text-ink-subtle">{c.codigo}</span>
                <span className="truncate">{c.assunto}</span>
              </Link>
              {c.prioridade === 'urgente' || c.prioridade === 'alta' ? (
                <Badge tone={c.prioridade === 'urgente' ? 'danger' : 'warning'}>
                  {c.prioridade === 'urgente' ? 'Urgente' : 'Alta'}
                </Badge>
              ) : null}
              {atrasado ? <Badge tone="danger">{atrasado.texto}</Badge> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

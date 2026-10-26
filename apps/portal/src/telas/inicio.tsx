import type { SessaoDoPortal } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarDays, LifeBuoy, Plus } from 'lucide-react'

import { Button } from '@leadtogo/ui/button'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'

import { useSessaoAtual } from '@/app/sessao'
import { resumoDoEvento } from '@/casca/eventos'
import { diaEMes, saudacao, primeiroNome } from '@/casca/rotulos'
import { FeedDePublicacoes } from '@/components/feed-de-publicacoes'
import { ListaDeChamados } from '@/components/lista-de-chamados'
import { useServicos } from '@/servicos/contexto'

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: number
  destaque?: boolean
}) {
  return (
    <div
      className={
        destaque && valor > 0
          ? 'rounded-md border border-warning bg-warning-soft p-4'
          : 'rounded-md border border-border bg-surface p-4'
      }
    >
      <p className="m-0 text-xs leading-4 text-ink-muted">{rotulo}</p>
      <p className="m-0 text-2xl leading-8 font-semibold">{valor}</p>
    </div>
  )
}

/** Os próximos eventos (até 3), com a situação do cliente em cada um. Some se a agenda está vazia. */
function ProximosEventos() {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: ['eventos', 'proximos'],
    queryFn: async () => {
      const r = await servicos.eventos.proximos()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados.itens
    },
  })
  if (!consulta.data || consulta.data.length === 0) return null
  return (
    <section
      aria-labelledby="proximos-eventos"
      className="rounded-md border border-border bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2
          id="proximos-eventos"
          className="m-0 flex items-center gap-2 text-[15px] leading-5 font-semibold"
        >
          <CalendarDays size={16} aria-hidden="true" /> Próximos eventos
        </h2>
        <Link to="/agenda" className="text-sm font-semibold text-brand">
          Agenda
        </Link>
      </div>
      <ul className="m-0 list-none p-0">
        {consulta.data.map((e) => {
          const dm = diaEMes(e.inicioEm)
          return (
            <li key={e.id} className="border-b border-border last:border-b-0">
              <Link
                to="/agenda"
                className="flex items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-hover"
              >
                <span
                  aria-hidden="true"
                  className="flex size-11 flex-none flex-col items-center justify-center rounded-md bg-surface-sunken"
                >
                  <span className="text-[10px] leading-3 font-semibold text-ink-muted">
                    {dm.mes}
                  </span>
                  <span className="text-base leading-5 font-semibold">{dm.dia}</span>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{e.titulo}</span>
                  <span className="text-[13px] text-ink-muted">{resumoDoEvento(e)}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Início: a saudação, o que pede a atenção do cliente e os chamados mais recentes. */
export function TelaInicio({ sessao: inicial }: { sessao: SessaoDoPortal }) {
  const sessao = useSessaoAtual(inicial)
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: ['inicio'],
    queryFn: async () => {
      const r = await servicos.inicio()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const inicio = consulta.data
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <header>
        <h1 className="m-0 text-2xl leading-8 font-semibold">
          {saudacao()}, {primeiroNome(sessao.contato.nome)}
        </h1>
        <p className="mt-1 mb-0 text-sm leading-5 text-ink-muted">
          Acompanhe os chamados da {sessao.empresaCliente.nome} com a equipe do{' '}
          {sessao.nomeDoPortal}.
        </p>
      </header>

      {consulta.isError ? (
        <Alert tone="danger" title="Não foi possível carregar o início.">
          Tente de novo em instantes.
        </Alert>
      ) : null}

      {inicio && inicio.aguardandoVoce > 0 ? (
        <Alert
          tone="warning"
          title={`${inicio.aguardandoVoce} chamado${inicio.aguardandoVoce > 1 ? 's' : ''} aguardando a sua resposta`}
          actions={
            <Link to="/chamados" className="text-sm font-semibold text-brand">
              Ver chamados
            </Link>
          }
        >
          A equipe precisa de uma informação sua para continuar.
        </Alert>
      ) : null}

      <section aria-label="Resumo" className="grid grid-cols-3 gap-3">
        <Numero rotulo="Em aberto" valor={inicio?.chamadosAbertos ?? 0} />
        <Numero rotulo="Aguardando você" valor={inicio?.aguardandoVoce ?? 0} destaque />
        <Numero rotulo="Para avaliar" valor={inicio?.resolvidosParaAvaliar ?? 0} />
      </section>

      <ProximosEventos />

      <section aria-labelledby="publicacoes" className="flex flex-col gap-3">
        <h2 id="publicacoes" className="m-0 text-[15px] leading-5 font-semibold">
          Publicações da equipe
        </h2>
        <FeedDePublicacoes nomeDoPortal={sessao.nomeDoPortal} />
      </section>

      <section aria-labelledby="recentes" className="rounded-md border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id="recentes" className="m-0 text-[15px] leading-5 font-semibold">
            Chamados recentes
          </h2>
          <Link to="/chamados" className="text-sm font-semibold text-brand">
            Ver todos
          </Link>
        </div>
        {!inicio ? (
          <div className="p-4">
            <Skeleton lines={3} />
          </div>
        ) : inicio.recentes.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="Nenhum chamado ainda"
            description="Precisa de ajuda? Abra um chamado e a equipe responde por aqui."
            actions={
              <Link to="/chamados/novo">
                <Button variant="primary" icon={Plus}>
                  Abrir chamado
                </Button>
              </Link>
            }
          />
        ) : (
          <ListaDeChamados itens={inicio.recentes} />
        )}
      </section>
    </div>
  )
}

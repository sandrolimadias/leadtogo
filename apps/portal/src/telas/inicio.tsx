import type { SessaoDoPortal } from '@leadtogo/api-client'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { LifeBuoy, Plus } from 'lucide-react'

import { Button } from '@leadtogo/ui/button'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'

import { useSessaoAtual } from '@/app/sessao'
import { saudacao, primeiroNome } from '@/casca/rotulos'
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

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { Janela } from '@/telas/cadastros/base'

import { diaDoBanco, reais } from './formatos'

/** "Suspensas · N": a lista das oportunidades suspensas do funil, com "Retomar em" e o botão Reabrir. */
export function JanelaDeSuspensas({
  funilId,
  aoFechar,
  aoReabrir,
}: {
  funilId: string
  aoFechar: () => void
  aoReabrir: (id: string) => Promise<void>
}) {
  const servicos = useServicos()
  const lista = useQuery({
    queryKey: ['oportunidades', 'suspensas', funilId],
    retry: false,
    queryFn: async () => {
      const r = await servicos.oportunidades.listar({
        status: 'suspenso',
        funilId,
        porPagina: 100,
        ordem: 'previsao',
        sentido: 'asc',
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  return (
    <Janela
      open
      onOpenChange={(aberto) => {
        if (!aberto) aoFechar()
      }}
      title="Oportunidades suspensas"
      width={620}
      footer={<Button onClick={aoFechar}>Fechar</Button>}
    >
      <div className="flex flex-col gap-2">
        {lista.isError ? <Alert tone="danger">{lista.error.message}</Alert> : null}
        {lista.isPending ? <Skeleton height={48} /> : null}
        {lista.data && lista.data.itens.length === 0 ? (
          <p className="m-0 text-sm text-ink-muted">Nenhuma oportunidade suspensa neste funil.</p>
        ) : null}
        <ul aria-label="Suspensas" className="m-0 flex list-none flex-col p-0">
          {lista.data?.itens.map((o) => (
            <li
              key={o.id}
              className="flex items-center gap-3 border-b border-border py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  to="/oportunidades/$oportunidadeId"
                  params={{ oportunidadeId: o.id }}
                  onClick={aoFechar}
                  className="font-semibold text-ink no-underline [overflow-wrap:anywhere] hover:underline"
                >
                  {o.titulo}
                </Link>
                <span className="text-[13px] text-ink-muted">
                  {o.empresa.nome} · {reais(o.valorTotal)} · Retomar em {diaDoBanco(o.suspensaAte)}
                  {o.motivo ? ` · ${o.motivo.nome}` : ''}
                </span>
              </div>
              {o.editavel ? (
                <Button size="sm" onClick={() => void aoReabrir(o.id).then(() => lista.refetch())}>
                  Reabrir
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </Janela>
  )
}

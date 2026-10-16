import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePorPagina } from '@/casca/preferencias'
import { Button } from '@/components/ui/button'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Paginacao } from '@/components/ui/paginacao'

import { useAcoesDaAtividade } from './acoes'
import { ItemDeAtividade } from './item'
import { type InicioDoRegistro, useRegistrarAtividade } from './registro-contexto'

/**
 * A aba Atividades das fichas da empresa e do contato: a linha do tempo (as agendadas e atrasadas no
 * topo, o histórico embaixo), com as ações de cada atividade e "Nova atividade".
 */
export function AtividadesDaFicha({
  filtro,
  inicio,
  podeRegistrar,
  mostrarEmpresa,
}: {
  filtro: { empresaId: string } | { contatoId: string }
  /** O que o formulário já traz ao abrir ("Nova atividade") */
  inicio: InicioDoRegistro
  podeRegistrar: boolean
  /** Na ficha do contato mostra a empresa de cada atividade; na da empresa, o contato */
  mostrarEmpresa: boolean
}) {
  const servicos = useServicos()
  const { abrir } = useRegistrarAtividade()
  const acoes = useAcoesDaAtividade()
  const tamanho = usePorPagina('atividades_ficha')
  const [pagina, setPagina] = useState(1)

  const lista = useQuery({
    queryKey: ['atividades', 'ficha', filtro, pagina, tamanho.porPagina],
    enabled: tamanho.pronto,
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.atividades.listar({
        ...filtro,
        pagina,
        porPagina: tamanho.porPagina,
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const novaAtividade = podeRegistrar ? (
    <Button variant="primary" icon={CalendarPlus} onClick={() => abrir(inicio)}>
      Nova atividade
    </Button>
  ) : null

  return (
    <section aria-label="Atividades" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-base leading-6 font-semibold">Atividades</h2>
        {novaAtividade}
      </div>
      {lista.isError ? <Alert tone="danger">{lista.error.message}</Alert> : null}
      {lista.isPending && tamanho.pronto ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Carregando atividades">
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : null}
      {lista.data && lista.data.total === 0 ? (
        <EmptyState
          title="Nenhuma atividade ainda"
          description="Visitas, ligações, reuniões e tarefas desta ficha aparecem aqui, as agendadas no topo e o histórico embaixo."
          {...(novaAtividade ? { actions: novaAtividade } : {})}
        />
      ) : null}
      {lista.data && lista.data.total > 0 ? (
        <div
          className={`flex flex-col rounded-lg border border-border bg-surface ${lista.isPlaceholderData ? 'opacity-60' : ''}`}
        >
          <ul aria-label="Atividades" className="m-0 flex list-none flex-col px-4 py-1">
            {lista.data.itens.map((a) => (
              <ItemDeAtividade
                key={a.id}
                a={a}
                acoes={acoes.menu(a)}
                mostrarEmpresa={mostrarEmpresa}
                mostrarContato={!mostrarEmpresa}
              />
            ))}
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
      {acoes.janelas}
    </section>
  )
}

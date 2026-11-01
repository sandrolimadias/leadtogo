import type { AssociadosDoDashboard } from '@leadtogo/api-client'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Sheet } from '@leadtogo/ui/dialog'
import { Tag } from '@leadtogo/ui/exibicao'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { Tabs } from '@leadtogo/ui/tabs'
import { reais } from '@/telas/oportunidades/formatos'

import { type BuscaDoDashboard, consultaDoPeriodo } from './busca'

type Tipo = AssociadosDoDashboard['tipo']
const NO_CARTAO = 8
const NO_PAINEL = 50

const data = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function useLista(busca: BuscaDoDashboard, tipo: Tipo, pagina: number, porPagina: number) {
  const servicos = useServicos()
  const consulta = { ...consultaDoPeriodo(busca), tipo, pagina, porPagina }
  return useQuery({
    queryKey: ['dashboard', 'associados', consulta],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.dashboard.associados(consulta)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
}

function Linhas({ itens, tipo }: { itens: AssociadosDoDashboard['itens']; tipo: Tipo }) {
  if (itens.length === 0) {
    return (
      <p className="m-0 rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-ink-muted">
        {tipo === 'novos'
          ? 'Nenhum associado novo neste período.'
          : 'Ninguém deixou de ser associado neste período.'}
      </p>
    )
  }
  return (
    <ul
      aria-label={tipo === 'novos' ? 'Novos associados' : 'Desassociados'}
      className="m-0 flex list-none flex-col p-0"
    >
      {itens.map((e) => (
        <li key={e.id} className="border-b border-border last:border-b-0">
          <Link
            to="/empresas/$empresaId"
            params={{ empresaId: e.id }}
            className="flex items-center gap-3 py-2 text-ink no-underline hover:bg-surface-hover"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">{e.nome}</span>
              <span className="truncate text-[13px] text-ink-muted">
                {[
                  e.cidade ? `${e.cidade.nome}/${e.cidade.uf}` : 'Sem cidade',
                  e.vendedor?.nome,
                  tipo === 'desassociados' ? `por ${e.por?.nome ?? 'Sistema'}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            {tipo === 'novos' && e.mrr ? (
              <span className="text-[13px] font-semibold tabular-nums">{reais(e.mrr)}/mês</span>
            ) : null}
            {tipo === 'desassociados' && e.statusAtual ? (
              <Tag color={e.statusAtual.cor}>{e.statusAtual.nome}</Tag>
            ) : null}
            <span className="text-[13px] text-ink-muted tabular-nums">{data(e.em)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** O painel "Ver todos": a lista inteira, paginada. */
function PainelCompleto({
  busca,
  tipo,
  aberto,
  fechar,
}: {
  busca: BuscaDoDashboard
  tipo: Tipo
  aberto: boolean
  fechar: () => void
}) {
  const [pagina, setPagina] = useState(1)
  const lista = useLista(busca, tipo, pagina, NO_PAINEL)
  const paginas = Math.max(1, Math.ceil((lista.data?.total ?? 0) / NO_PAINEL))
  return (
    <Sheet
      open={aberto}
      onOpenChange={(v) => (v ? null : fechar())}
      title={tipo === 'novos' ? 'Novos associados' : 'Desassociados'}
      {...(lista.data ? { description: lista.data.periodo.rotulo } : {})}
      className="md:inset-x-auto md:right-0 md:bottom-0 md:h-dvh md:max-h-dvh md:w-[520px] md:rounded-none"
      footer={
        paginas > 1 ? (
          <div className="flex w-full items-center justify-between gap-2">
            <Button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-[13px] text-ink-muted tabular-nums">
              Página {pagina} de {paginas}
            </span>
            <Button disabled={pagina >= paginas} onClick={() => setPagina((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        ) : undefined
      }
    >
      {lista.isPending ? <Skeleton lines={6} /> : null}
      {lista.isError ? <Alert tone="danger">{lista.error.message}</Alert> : null}
      {lista.data ? <Linhas itens={lista.data.itens} tipo={tipo} /> : null}
    </Sheet>
  )
}

/** Cartão com as abas Novos associados e Desassociados do período (até 8 e "Ver todos"). */
export function CartaoDeAssociados({
  busca,
  nomeDaTag,
  novos,
  desassociados,
}: {
  busca: BuscaDoDashboard
  /** O nome que a empresa deu ao Status Cliente (ex.: "Associado") */
  nomeDaTag: string
  novos: number
  desassociados: number
}) {
  const [tipo, setTipo] = useState<Tipo>('novos')
  const [painel, setPainel] = useState(false)
  const lista = useLista(busca, tipo, 1, NO_CARTAO)
  const total = tipo === 'novos' ? novos : desassociados
  return (
    <section
      id="dashboard-associados"
      aria-label={`${nomeDaTag}s: entradas e saídas`}
      className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base leading-6 font-semibold">{nomeDaTag}s: entradas e saídas</h2>
        {total > NO_CARTAO ? (
          <button
            type="button"
            onClick={() => setPainel(true)}
            className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-brand"
          >
            Ver todos ({total})
          </button>
        ) : null}
      </header>
      <Tabs
        label="Entradas e saídas"
        value={tipo}
        onChange={(v) => setTipo(v as Tipo)}
        items={[
          { value: 'novos', label: 'Novos', count: novos },
          { value: 'desassociados', label: 'Desassociados', count: desassociados },
        ]}
      >
        <div className="pt-2">
          {lista.isPending ? <Skeleton lines={4} /> : null}
          {lista.isError ? <Alert tone="danger">{lista.error.message}</Alert> : null}
          {lista.data ? <Linhas itens={lista.data.itens} tipo={tipo} /> : null}
        </div>
      </Tabs>
      {painel ? (
        <PainelCompleto busca={busca} tipo={tipo} aberto={painel} fechar={() => setPainel(false)} />
      ) : null}
    </section>
  )
}

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Skeleton } from '@leadtogo/ui/feedback'
import { duracaoUtil } from '@/telas/chamados/duracao'
import { IndicadoresDoPortal } from '@/telas/portal/indicadores'

const pct = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',')}%`)

function Faixa({
  titulo,
  acao,
  children,
}: {
  titulo: string
  acao: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section aria-label={titulo} className="flex min-w-0 flex-col gap-2">
      <header className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base leading-6 font-semibold">{titulo}</h2>
        {acao}
      </header>
      {children}
    </section>
  )
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface p-4">
      <span className="text-[13px] text-ink-muted">{rotulo}</span>
      <span className="text-[28px] leading-8 font-semibold tabular-nums">{valor}</span>
      {nota ? <span className="text-xs text-ink-muted">{nota}</span> : null}
    </div>
  )
}

/** Os cards dos Chamados (das Métricas, no período, no alcance de `chamados.ver_metricas`). */
function FaixaDeChamados({ de, ate, rotulo }: { de: string; ate: string; rotulo: string }) {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: ['chamados', 'metricas', de, ate],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.chamados.metricas({ de, ate })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  // sem a faixa quando falha (ex.: módulo de chamados desligado): o resto do Dashboard segue
  if (consulta.isError) return null
  const g = consulta.data?.geral
  return (
    <Faixa
      titulo="Chamados"
      acao={
        <Link to="/chamados/metricas" className="text-[13px] font-semibold">
          Ver métricas
        </Link>
      }
    >
      {g ? (
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
          <Numero rotulo="Chamados no período" valor={String(g.total)} nota={rotulo} />
          <Numero rotulo="Ainda abertos" valor={String(g.abertos)} nota="dos abertos no período" />
          <Numero
            rotulo="Tempo até a 1ª resposta"
            valor={duracaoUtil(g.tempoPrimeiraRespostaMin)}
            nota="média, em horário útil"
          />
          <Numero
            rotulo="Resolução no prazo"
            valor={pct(g.resolucaoNoPrazoPct)}
            nota="das áreas com meta"
          />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={96} />
          ))}
        </div>
      )}
    </Faixa>
  )
}

/**
 * Fim da aba Resultados: os cards dos Chamados e os do Portal do cliente, cada faixa só para quem tem a
 * permissão (`chamados.ver_metricas` e `portal.ver`).
 */
export function FaixasDeAtendimento({
  de,
  ate,
  rotulo,
}: {
  de: string
  ate: string
  rotulo: string
}) {
  const { pode } = usePermissoes()
  return (
    <>
      {pode('chamados.ver_metricas') ? <FaixaDeChamados de={de} ate={ate} rotulo={rotulo} /> : null}
      {pode('portal.ver') ? (
        <Faixa
          titulo="Portal do cliente"
          acao={
            <Link to="/portal" className="text-[13px] font-semibold">
              Abrir o Portal
            </Link>
          }
        >
          <IndicadoresDoPortal janela={{ de, ate, rotulo }} />
        </Faixa>
      ) : null}
    </>
  )
}

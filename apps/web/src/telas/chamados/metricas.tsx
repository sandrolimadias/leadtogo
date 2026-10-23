import type { IndicadoresDeChamados } from '@leadtogo/api-client'
import { ROTULO_DO_STATUS_DO_CHAMADO } from '@leadtogo/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Download } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { TextField } from '@/components/ui/campos'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { PaginaDeTabela } from '@/components/ui/pagina'
import { cn } from '@/lib/cn'

import { duracaoUtil } from './duracao'

const pct = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',')}%`)
const dias = (v: number | null) => (v === null ? '—' : `${String(v).replace('.', ',')} dias`)

function Indicador({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-surface px-4 py-3">
      <span className="text-xs text-ink-muted">{rotulo}</span>
      <span
        className={cn('text-[26px] leading-8 font-semibold tabular-nums', destaque && 'text-brand')}
      >
        {valor}
      </span>
    </div>
  )
}

function Tabela({
  titulo,
  linhas,
}: {
  titulo: string
  linhas: { nome: string; i: IndicadoresDeChamados }[]
}) {
  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <h2 className="m-0 text-base font-semibold">{titulo}</h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-sunken text-left text-xs text-ink-muted">
              <th className="px-3 py-2 font-semibold">{titulo.replace('Por ', '')}</th>
              <th className="px-3 py-2 font-semibold">Chamados</th>
              <th className="px-3 py-2 font-semibold">Abertos</th>
              <th className="px-3 py-2 font-semibold">1ª resposta</th>
              <th className="px-3 py-2 font-semibold">Resolução</th>
              <th className="px-3 py-2 font-semibold">Resposta no prazo</th>
              <th className="px-3 py-2 font-semibold">Resolução no prazo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ nome, i }) => (
              <tr key={nome} className="border-t border-border">
                <th scope="row" className="px-3 py-2 text-left font-semibold">
                  {nome}
                </th>
                <td className="px-3 py-2 tabular-nums">{i.total}</td>
                <td className="px-3 py-2 tabular-nums">{i.abertos}</td>
                <td className="px-3 py-2 tabular-nums">
                  {duracaoUtil(i.tempoPrimeiraRespostaMin)}
                </td>
                <td className="px-3 py-2 tabular-nums">{duracaoUtil(i.tempoResolucaoMin)}</td>
                <td className="px-3 py-2 tabular-nums">{pct(i.respostaNoPrazoPct)}</td>
                <td className="px-3 py-2 tabular-nums">{pct(i.resolucaoNoPrazoPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const hoje = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
const diasAtras = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toLocaleDateString('sv-SE', {
    timeZone: 'America/Sao_Paulo',
  })

/** Métricas dos chamados (`chamados.ver_metricas`): números do período, por área e por responsável, e o CSV. */
export function TelaDeMetricasDeChamados() {
  const servicos = useServicos()
  const { pode } = usePermissoes()
  const [de, setDe] = useState(diasAtras(30))
  const [ate, setAte] = useState(hoje())
  const consulta = useQuery({
    queryKey: ['chamados', 'metricas', de, ate],
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.metricas({ de, ate })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const m = consulta.data
  return (
    <PaginaDeTabela>
      <Link
        to="/chamados"
        className="inline-flex items-center gap-1 text-sm no-underline hover:underline"
      >
        <ArrowLeft size={14} aria-hidden="true" /> Chamados
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-[26px] leading-8 font-semibold max-md:text-[22px]">
          Métricas dos chamados
        </h1>
        {pode('chamados.exportar') ? (
          <a
            href={`/v1/chamados/exportar.csv?de=${de}&ate=${ate}&aba=todos`}
            download="chamados.csv"
            className="inline-flex h-(--ctl) items-center gap-2 rounded-sm border border-border-strong px-3 text-sm font-semibold text-ink no-underline hover:bg-surface-hover"
          >
            <Download size={16} aria-hidden="true" /> Exportar CSV
          </a>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TextField label="De" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <TextField label="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        {m ? (
          <span className="pb-2 text-xs text-ink-muted">
            {m.alcance === 'todas'
              ? 'Todos os chamados do período (pela data de abertura).'
              : m.alcance === 'equipe'
                ? 'Os chamados da sua equipe no período.'
                : 'Só os chamados em que você é o responsável.'}
          </span>
        ) : null}
      </div>
      {consulta.isPending ? (
        <Skeleton lines={6} />
      ) : consulta.isError ? (
        <Alert tone="danger">Não consegui carregar as métricas. {consulta.error.message}</Alert>
      ) : (
        <>
          {m?.truncado ? (
            <Alert tone="warning">
              Há chamados demais no período: os números valem sobre os 5.000 mais recentes.
            </Alert>
          ) : null}
          {m ? (
            <>
              <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                <Indicador rotulo="Chamados no período" valor={String(m.geral.total)} destaque />
                <Indicador rotulo="Ainda abertos" valor={String(m.geral.abertos)} />
                <Indicador
                  rotulo="Tempo até a 1ª resposta"
                  valor={duracaoUtil(m.geral.tempoPrimeiraRespostaMin)}
                />
                <Indicador
                  rotulo="Tempo de resolução"
                  valor={duracaoUtil(m.geral.tempoResolucaoMin)}
                />
                <Indicador rotulo="Dias em aberto (média)" valor={dias(m.geral.diasEmAberto)} />
                <Indicador rotulo="Resposta no prazo" valor={pct(m.geral.respostaNoPrazoPct)} />
                <Indicador rotulo="Resolução no prazo" valor={pct(m.geral.resolucaoNoPrazoPct)} />
                <Indicador rotulo="Resolvidos" valor={String(m.geral.resolvidos)} />
              </div>
              <p className="m-0 text-xs text-ink-muted">
                Tempos em minutos úteis do expediente, sem a pausa de "Aguardando cliente". "No
                prazo" só conta os chamados de áreas com meta.
              </p>
              <section aria-label="Por estado" className="flex flex-wrap gap-2 text-sm">
                {m.porStatus.map((s) => (
                  <span
                    key={s.status}
                    className="rounded-sm border border-border bg-surface px-2 py-1"
                  >
                    {ROTULO_DO_STATUS_DO_CHAMADO[s.status]}:{' '}
                    <strong className="tabular-nums">{s.total}</strong>
                  </span>
                ))}
              </section>
              <Tabela
                titulo="Por área"
                linhas={m.porArea.map((a) => ({ nome: a.area.nome, i: a }))}
              />
              <Tabela
                titulo="Por responsável"
                linhas={m.porResponsavel.map((r) => ({
                  nome: r.responsavel?.nome ?? 'Sem responsável',
                  i: r,
                }))}
              />
            </>
          ) : null}
        </>
      )}
    </PaginaDeTabela>
  )
}

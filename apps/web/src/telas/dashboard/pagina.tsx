import { PERIODOS_DO_DASHBOARD, type PeriodoDoDashboard } from '@leadtogo/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { CircleCheck, CircleX, Clock } from 'lucide-react'
import type { ReactNode } from 'react'

import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { Badge, Tag } from '@/components/ui/exibicao'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { Select } from '@/components/ui/campos'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { reais } from '@/telas/oportunidades/formatos'

import { MinhasAtividades } from './atividades'
import { type BuscaDoDashboard, lerBusca } from './busca'
import {
  GraficoDaCarteira,
  GraficoDeMotivos,
  GraficoDeMrr,
  GraficoDeResultado,
  GraficoDoFunil,
} from './graficos'
import { linkDeConquistadas, linkDePerdas, linkDoStatus, linkSemContato } from './links'
import { CardDePendentes } from '@/telas/visitas/campo/pendentes'

const rota = getRouteApi('/_autenticado/')

const ROTULO: Record<PeriodoDoDashboard, { cheio: string; curto: string }> = {
  mes: { cheio: 'Mês atual', curto: 'Mês' },
  mes_anterior: { cheio: 'Mês anterior', curto: 'Anterior' },
  trimestre: { cheio: 'Trimestre', curto: 'Trimestre' },
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function saudacao(agora: Date): string {
  const h = agora.getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

/** Um indicador do topo: título, valor grande, dica e (opcional) um mini-gráfico. */
function Indicador({
  titulo,
  valor,
  dica,
  extra,
  className,
}: {
  titulo: string
  valor: ReactNode
  dica?: ReactNode
  extra?: ReactNode
  className?: string
}) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-surface p-4',
        className,
      )}
    >
      <h2 className="m-0 text-[13px] leading-[18px] font-medium text-ink-muted">{titulo}</h2>
      <p className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.01em] tabular-nums">
        {valor}
      </p>
      {dica ? <p className="m-0 text-[13px] text-ink-muted">{dica}</p> : null}
      {extra}
    </section>
  )
}

function Cartao({
  titulo,
  acao,
  className,
  children,
}: {
  titulo: string
  acao?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-label={titulo}
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base leading-6 font-semibold">{titulo}</h2>
        {acao}
      </header>
      {children}
    </section>
  )
}

/** O Dashboard (visão "Minha"): o que fazer hoje e como está o período. */
export function PaginaDoDashboard() {
  const servicos = useServicos()
  const celular = useDispositivo() === 'celular'
  const busca = rota.useSearch({ select: (s) => lerBusca(s) })
  const navegar = rota.useNavigate()
  const periodo: PeriodoDoDashboard = busca.periodo ?? 'mes'

  const mudar = (patch: Partial<BuscaDoDashboard>) =>
    void navegar({
      search: (anterior) => {
        const novo: BuscaDoDashboard = { ...lerBusca(anterior), ...patch }
        for (const [chave, valor] of Object.entries(novo)) {
          if (valor === undefined) delete (novo as Record<string, unknown>)[chave]
        }
        return novo
      },
      replace: true,
    })

  const consulta = useQuery({
    queryKey: ['dashboard', periodo, busca.funil],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.dashboard.carregar({
        periodo,
        ...(busca.funil ? { funilId: busca.funil } : {}),
      })
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const funis = useQuery({
    queryKey: ['cadastros', 'funis'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.funis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const agora = new Date()
  const d = consulta.data
  const primeiroNome = (d?.membro.nome ?? '').split(' ')[0] ?? ''

  return (
    <main className="flex w-full flex-1 flex-col gap-5 p-6 max-md:p-4">
      <h1 className="sr-only">Dashboard</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[13px] text-ink-muted">
            {maiuscula(
              agora.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
            )}
          </span>
          <p className="m-0 text-[30px] leading-9 font-semibold tracking-[-0.015em] max-md:text-[22px] max-md:leading-7">
            {saudacao(agora)}
            {primeiroNome ? `, ${primeiroNome}` : ''}
          </p>
        </div>
        <SegmentedControl
          label="Período"
          options={PERIODOS_DO_DASHBOARD.map((p) => ({
            value: p,
            label: celular ? ROTULO[p].curto : ROTULO[p].cheio,
          }))}
          value={periodo}
          onChange={(v) =>
            mudar({ periodo: v === 'mes' ? undefined : (v as BuscaDoDashboard['periodo']) })
          }
        />
      </div>

      <CardDePendentes />

      {consulta.isError ? (
        <Alert
          tone="danger"
          actions={
            <Button size="sm" onClick={() => void consulta.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar o Dashboard: {consulta.error.message}
        </Alert>
      ) : null}

      {consulta.isPending ? (
        <div
          className="grid grid-cols-4 gap-3 max-lg:grid-cols-2"
          role="status"
          aria-label="Carregando o Dashboard"
        >
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={112} />
          ))}
        </div>
      ) : null}

      {d ? (
        <div className={cn('flex flex-col gap-5', consulta.isPlaceholderData && 'opacity-60')}>
          <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
            <Indicador
              titulo="Previsão do período"
              valor={reais(d.previsao.valor)}
              dica={
                <>
                  valor ponderado, {d.previsao.quantidade}{' '}
                  {d.previsao.quantidade === 1 ? 'oportunidade' : 'oportunidades'}
                  {d.previsao.semPrevisao > 0 ? ` · ${d.previsao.semPrevisao} sem previsão` : ''}
                </>
              }
            />
            <Indicador
              titulo="MRR conquistado"
              valor={reais(d.mrr.valor)}
              dica={
                d.mrr.variacao === null
                  ? 'sem base no período anterior'
                  : `${d.mrr.variacao > 0 ? '+' : ''}${d.mrr.variacao.toLocaleString('pt-BR')}% sobre o período anterior`
              }
              extra={<GraficoDeMrr serie={d.mrr.serie} />}
            />
            <Indicador
              titulo="Taxa de conversão"
              valor={
                d.conversao.taxa === null ? '—' : `${d.conversao.taxa.toLocaleString('pt-BR')}%`
              }
              dica={`${d.conversao.conquistadas} conquistadas × ${d.conversao.perdidas} perdidas`}
            />
            <Indicador
              titulo={`Sem contato há ${d.semContato.dias} dias`}
              valor={d.semContato.total}
              dica={
                d.semContato.total > 0 ? (
                  <Link {...linkSemContato(d.semContato.dias, d.membro.id)}>
                    Ver as {d.semContato.total}
                  </Link>
                ) : (
                  'Nenhuma empresa parada'
                )
              }
            />
          </div>

          <div className="grid grid-cols-[1.5fr_1fr] items-start gap-4 max-lg:grid-cols-1">
            <MinhasAtividades celular={celular} />
            <Cartao
              titulo="Funil e previsão"
              acao={
                funis.data && funis.data.filter((f) => f.ativo).length > 1 ? (
                  <Select
                    aria-label="Funil"
                    className="w-40"
                    options={funis.data
                      .filter((f) => f.ativo || f.id === d.funil.id)
                      .map((f) => ({ value: f.id, label: f.nome }))}
                    value={d.funil.id}
                    onChange={(e) =>
                      mudar({
                        funil:
                          e.target.value === funis.data.find((f) => f.padrao)?.id
                            ? undefined
                            : e.target.value,
                      })
                    }
                  />
                ) : (
                  <span className="text-[13px] text-ink-muted">{d.funil.nome}</span>
                )
              }
            >
              <GraficoDoFunil funil={d.funil} />
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-3 max-md:grid-cols-1">
                <Link
                  {...linkDeConquistadas(d.periodo)}
                  className="flex flex-col gap-0.5 text-ink no-underline"
                >
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                    <CircleCheck
                      size={15}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="text-success"
                    />
                    Conquistadas
                  </span>
                  <span className="text-xl font-semibold tabular-nums">
                    {reais(d.resultado.conquistadas.total)}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {d.resultado.conquistadas.quantidade}{' '}
                    {d.resultado.conquistadas.quantidade === 1 ? 'oportunidade' : 'oportunidades'} ·{' '}
                    {reais(d.resultado.conquistadas.mensal)}/mês
                  </span>
                </Link>
                <Link
                  {...linkDePerdas(d.periodo)}
                  className="flex flex-col gap-0.5 text-ink no-underline"
                >
                  <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                    <CircleX
                      size={15}
                      strokeWidth={1.75}
                      aria-hidden="true"
                      className="text-danger"
                    />
                    Perdidas e canceladas
                  </span>
                  <span className="text-xl font-semibold tabular-nums">
                    {reais(d.resultado.perdidasECanceladas.total)}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {d.resultado.perdidasECanceladas.quantidade}{' '}
                    {d.resultado.perdidasECanceladas.quantidade === 1
                      ? 'oportunidade'
                      : 'oportunidades'}
                  </span>
                </Link>
              </div>
              <GraficoDeResultado resultado={d.resultado} periodo={d.periodo} />
              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <h3 className="m-0 text-sm leading-5 font-semibold">Principais motivos de perda</h3>
                <GraficoDeMotivos
                  motivos={d.motivosDePerda}
                  totalDePerdas={d.resultado.perdidasECanceladas.quantidade}
                  periodo={d.periodo}
                />
              </div>
            </Cartao>
          </div>

          <Cartao
            titulo="Carteira"
            acao={
              <span className="text-[13px] text-ink-muted tabular-nums">
                {d.carteira.total} {d.carteira.total === 1 ? 'empresa' : 'empresas'}
              </span>
            }
          >
            <div className="grid grid-cols-[1fr_1.4fr] items-start gap-5 max-lg:grid-cols-1">
              <div className="flex flex-col gap-3">
                <GraficoDaCarteira carteira={d.carteira} membroId={d.membro.id} />
                <div className="flex flex-wrap gap-2">
                  {d.carteira.porStatus.map((s) => (
                    <Link key={s.id} {...linkDoStatus(s.id, d.membro.id)} className="no-underline">
                      <Tag color={s.cor}>{`${s.nome} ${s.quantidade}`}</Tag>
                    </Link>
                  ))}
                </div>
                <p className="m-0 text-sm">
                  <strong className="tabular-nums">{d.carteira.novas}</strong>{' '}
                  {d.carteira.novas === 1 ? 'empresa nova' : 'empresas novas'} no período
                  <span className="text-ink-muted"> ({d.periodo.rotulo})</span>
                </p>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="m-0 text-sm leading-5 font-semibold">
                    Sem contato há {d.semContato.dias} dias
                  </h3>
                  {d.semContato.total > d.semContato.itens.length ? (
                    <Link
                      {...linkSemContato(d.semContato.dias, d.membro.id)}
                      className="text-[13px] font-semibold"
                    >
                      Ver as {d.semContato.total}
                    </Link>
                  ) : null}
                </div>
                {d.semContato.itens.length === 0 ? (
                  <p className="m-0 rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-ink-muted">
                    Nenhum cliente ou prospect parado: todos tiveram contato no prazo.
                  </p>
                ) : (
                  <ul aria-label="Empresas sem contato" className="m-0 flex list-none flex-col p-0">
                    {d.semContato.itens.map((e) => (
                      <li key={e.id} className="border-b border-border last:border-b-0">
                        <Link
                          to="/empresas/$empresaId"
                          params={{ empresaId: e.id }}
                          className="flex items-center gap-3 py-2 text-ink no-underline hover:bg-surface-hover"
                        >
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-sm font-semibold">{e.nome}</span>
                            <span className="truncate text-[13px] text-ink-muted">
                              {e.cidade ? `${e.cidade.nome}/${e.cidade.uf}` : 'Sem cidade'}
                            </span>
                          </span>
                          {e.status && !celular ? (
                            <Tag color={e.status.cor}>{e.status.nome}</Tag>
                          ) : null}
                          {e.diasSemContato === null ? (
                            <Badge tone="neutral">Nunca</Badge>
                          ) : (
                            <Badge tone="warning" icon={Clock}>
                              {e.diasSemContato} dias
                            </Badge>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Cartao>
        </div>
      ) : null}
    </main>
  )
}

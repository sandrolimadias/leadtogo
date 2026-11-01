import type { MapaDoDashboard, ResultadosDoDashboard } from '@leadtogo/api-client'
import type { VisaoDoDashboard } from '@leadtogo/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CircleCheck, CircleX } from 'lucide-react'
import { useMemo } from 'react'

import { useServicos } from '@/auth/contexto'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { Select } from '@leadtogo/ui/campos'
import { cn } from '@leadtogo/ui/cn'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { reais } from '@/telas/oportunidades/formatos'

import { CartaoDeAssociados } from './associados'
import { FaixasDeAtendimento } from './atendimento'
import { type BuscaDoDashboard, consultaDoPeriodo } from './busca'
import { Cartao, Indicador } from './cartoes'
import { variacao } from './formatos'
import { GraficoDeMotivos, GraficoDeMrr, GraficoDeResultado, GraficoDoFunil } from './graficos'
import { linkDeConquistadas, linkDeEmpresas, linkDePerdas } from './links'
import { MapaDeDensidade } from './mapa-de-densidade'
import { BarraDePeriodo } from './periodo'

const plural = (n: number, um: string, varios: string) =>
  `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

const dataCurta = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** As visões que o alcance de `empresas.ver` permite (a API confere de novo). */
function visoesDoAlcance(alcance: string | undefined): VisaoDoDashboard[] {
  if (alcance === 'todas') return ['minha', 'equipe', 'empresa']
  if (alcance === 'equipe') return ['minha', 'equipe']
  return ['minha']
}

function Indicadores({ d, membroId }: { d: ResultadosDoDashboard; membroId?: string }) {
  const tag = d.associados.tag
  const nome = tag?.nome ?? 'Associado'
  return (
    <>
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        <Indicador
          titulo="Previsão (fase final)"
          valor={reais(d.previsao.valor)}
          dica={
            <>
              {plural(d.previsao.quantidade, 'oportunidade', 'oportunidades')} ·{' '}
              {reais(d.previsao.ponderado)} ponderado
              {d.previsao.semPrevisao > 0 ? ` · ${d.previsao.semPrevisao} sem data prevista` : ''}
            </>
          }
        />
        <Indicador
          titulo="Vendas no período"
          valor={reais(d.vendas.total)}
          dica={`${plural(d.vendas.quantidade, 'venda', 'vendas')} · ${variacao(d.vendas.variacao)}`}
        />
        <Indicador
          titulo="MRR conquistado"
          valor={reais(d.mrr.valor)}
          dica={variacao(d.mrr.variacao)}
          extra={<GraficoDeMrr serie={d.mrr.serie} />}
        />
        <Indicador
          titulo="Taxa de conversão"
          valor={d.conversao.taxa === null ? '—' : `${d.conversao.taxa.toLocaleString('pt-BR')}%`}
          dica={`${d.conversao.conquistadas} conquistadas × ${d.conversao.perdidas} perdidas`}
        />
      </div>
      <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2">
        <Indicador
          titulo={`${nome}s`}
          valor={d.associados.atual.toLocaleString('pt-BR')}
          dica={
            <>
              +{d.associados.novos} {d.associados.novos === 1 ? 'novo' : 'novos'} · −
              {d.associados.desassociados} {d.associados.desassociados === 1 ? 'saiu' : 'saíram'}
              {tag ? (
                <>
                  {' · '}
                  <Link {...linkDeEmpresas({ status: tag.id, vendedor: membroId })}>
                    Ver empresas
                  </Link>
                </>
              ) : null}
            </>
          }
        />
        <Indicador
          titulo="Churn"
          valor={
            d.associados.churn === null ? '—' : `${d.associados.churn.toLocaleString('pt-BR')}%`
          }
          dica={
            d.associados.inicio === 0 ? (
              `sem ${nome.toLowerCase()}s no início do período`
            ) : (
              <>
                {d.associados.desassociados} de {d.associados.inicio} saíram ·{' '}
                <a href="#dashboard-associados">ver quem</a>
              </>
            )
          }
        />
        <Indicador
          titulo="Visitas realizadas"
          valor={d.visitas.realizadas.toLocaleString('pt-BR')}
          dica={variacao(d.visitas.variacao)}
        />
        <Indicador
          titulo="Atividades realizadas"
          valor={d.atividadesRealizadas.realizadas.toLocaleString('pt-BR')}
          dica={`sem as visitas · ${variacao(d.atividadesRealizadas.variacao)}`}
        />
      </div>
      {d.associados.historicoDesde &&
      d.associados.historicoDesde.slice(0, 10) > d.periodo.inicio ? (
        <p className="m-0 text-xs text-ink-muted">
          O histórico de {nome.toLowerCase()}s começa em {dataCurta(d.associados.historicoDesde)}:
          antes disso, os números de {nome.toLowerCase()}s e churn são aproximados.
        </p>
      ) : null}
    </>
  )
}

function FunilEResultado({
  d,
  mudar,
}: {
  d: ResultadosDoDashboard
  mudar: (patch: Partial<BuscaDoDashboard>) => void
}) {
  const servicos = useServicos()
  const funis = useQuery({
    queryKey: ['cadastros', 'funis'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.funis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  return (
    <Cartao
      titulo="Funil e resultado"
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
      <div className="grid grid-cols-2 items-start gap-5 max-lg:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="m-0 text-sm leading-5 font-semibold">Funil hoje</h3>
          <GraficoDoFunil funil={d.funil} />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
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
                {plural(d.resultado.conquistadas.quantidade, 'oportunidade', 'oportunidades')} ·{' '}
                {reais(d.resultado.conquistadas.mensal)}/mês
              </span>
            </Link>
            <Link
              {...linkDePerdas(d.periodo)}
              className="flex flex-col gap-0.5 text-ink no-underline"
            >
              <span className="flex items-center gap-1.5 text-[13px] text-ink-muted">
                <CircleX size={15} strokeWidth={1.75} aria-hidden="true" className="text-danger" />
                Perdidas e canceladas
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {reais(d.resultado.perdidasECanceladas.total)}
              </span>
              <span className="text-[13px] text-ink-muted">
                {plural(
                  d.resultado.perdidasECanceladas.quantidade,
                  'oportunidade',
                  'oportunidades',
                )}
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
        </div>
      </div>
    </Cartao>
  )
}

/** O quadro Carteira: os dois mapas do estado da empresa (associados em azul, empresas em vermelho). */
function Carteira({
  busca,
  nomeDaTag,
  tagId,
  membroId,
}: {
  busca: BuscaDoDashboard
  nomeDaTag: string
  tagId: string | undefined
  membroId: string | undefined
}) {
  const servicos = useServicos()
  const consulta = consultaDoPeriodo(busca)
  const mapa = useQuery({
    queryKey: ['dashboard', 'mapa', consulta],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.dashboard.mapa(consulta)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const uf = mapa.data?.uf ?? null
  const contornos = useQuery({
    queryKey: ['referencias', 'contornos', uf],
    enabled: uf !== null,
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const r = await servicos.dashboard.contornos(uf as string)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const valores = useMemo(() => {
    const m = mapa.data?.municipios ?? []
    return {
      associados: new Map(m.map((x) => [x.codigo, x.associados])),
      empresas: new Map(m.map((x) => [x.codigo, x.empresas])),
    }
  }, [mapa.data])

  const rodape = (d: MapaDoDashboard, chave: 'associados' | 'empresas') =>
    [
      d.foraDaUf[chave] > 0 ? `${d.foraDaUf[chave].toLocaleString('pt-BR')} fora do ${d.uf}` : '',
      d.semCidade[chave] > 0 ? `${d.semCidade[chave].toLocaleString('pt-BR')} sem cidade` : '',
      contornos.data?.fonte ? 'Limites municipais: IBGE' : '',
    ].filter(Boolean)

  return (
    <Cartao
      titulo="Carteira"
      acao={
        mapa.data ? (
          <span className="text-[13px] text-ink-muted tabular-nums">
            {plural(
              mapa.data.total.associados,
              nomeDaTag.toLowerCase(),
              `${nomeDaTag.toLowerCase()}s`,
            )}{' '}
            · {plural(mapa.data.total.empresas, 'empresa', 'empresas')}
          </span>
        ) : null
      }
    >
      {mapa.isError ? <Alert tone="danger">{mapa.error.message}</Alert> : null}
      {mapa.isPending ? <Skeleton height={280} /> : null}
      {mapa.data && mapa.data.uf === null ? (
        <p className="m-0 rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-ink-muted">
          Cadastre o endereço da sua empresa em Configurações → Empresa para ver o mapa do seu
          estado.
        </p>
      ) : null}
      {mapa.data && mapa.data.uf && contornos.isPending ? <Skeleton height={280} /> : null}
      {contornos.isError ? <Alert tone="danger">{contornos.error.message}</Alert> : null}
      {mapa.data && mapa.data.uf && contornos.data ? (
        <div
          className={cn(
            'grid grid-cols-2 gap-6 max-xl:grid-cols-1',
            mapa.isPlaceholderData && 'opacity-60',
          )}
        >
          <MapaDeDensidade
            titulo={`${nomeDaTag}s por município`}
            uf={mapa.data.uf}
            contornos={contornos.data.municipios}
            valores={valores.associados}
            tom="azul"
            singular={nomeDaTag.toLowerCase()}
            plural={`${nomeDaTag.toLowerCase()}s`}
            total={mapa.data.total.associados}
            linkDaCidade={(cidade) => linkDeEmpresas({ status: tagId, cidade, vendedor: membroId })}
            rodape={rodape(mapa.data, 'associados')}
          />
          <MapaDeDensidade
            titulo="Empresas no cadastro por município"
            uf={mapa.data.uf}
            contornos={contornos.data.municipios}
            valores={valores.empresas}
            tom="vermelho"
            singular="empresa"
            plural="empresas"
            total={mapa.data.total.empresas}
            linkDaCidade={(cidade) => linkDeEmpresas({ cidade, vendedor: membroId })}
            rodape={rodape(mapa.data, 'empresas')}
          />
        </div>
      ) : null}
    </Cartao>
  )
}

/** A aba Resultados: período, indicadores, funil, entradas e saídas de associados, mapas e atendimento. */
export function AbaDeResultados({
  busca,
  celular,
  membroId,
  mudar,
}: {
  busca: BuscaDoDashboard
  celular: boolean
  /** O membro logado (os links da visão "Minha" filtram pela carteira dele) */
  membroId: string | undefined
  mudar: (patch: Partial<BuscaDoDashboard>) => void
}) {
  const servicos = useServicos()
  const { alcanceDe } = usePermissoes()
  const consulta = { ...consultaDoPeriodo(busca), ...(busca.funil ? { funilId: busca.funil } : {}) }
  const resultados = useQuery({
    queryKey: ['dashboard', 'resultados', consulta],
    retry: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const r = await servicos.dashboard.resultados(consulta)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const d = resultados.data
  const doMembro = (busca.visao ?? 'minha') === 'minha' ? membroId : undefined
  const nomeDaTag = d?.associados.tag?.nome ?? 'Associado'

  return (
    <div className="flex flex-col gap-5">
      <BarraDePeriodo
        busca={busca}
        anoAtual={new Date().getFullYear()}
        visoes={d?.visoes ?? visoesDoAlcance(alcanceDe('empresas.ver'))}
        celular={celular}
        mudar={mudar}
      />
      {d ? (
        <p className="m-0 -mt-2 text-[13px] text-ink-muted">
          {d.periodo.rotulo} · {dataCurta(`${d.periodo.inicio}T12:00:00`)} a{' '}
          {dataCurta(`${d.periodo.fim}T12:00:00`)}
        </p>
      ) : null}

      {resultados.isError ? (
        <Alert
          tone="danger"
          actions={
            <Button size="sm" onClick={() => void resultados.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          Não foi possível carregar os resultados: {resultados.error.message}
        </Alert>
      ) : null}

      {resultados.isPending ? (
        <div
          className="grid grid-cols-4 gap-3 max-lg:grid-cols-2"
          role="status"
          aria-label="Carregando os resultados"
        >
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} height={112} />
          ))}
        </div>
      ) : null}

      {d ? (
        <div className={cn('flex flex-col gap-5', resultados.isPlaceholderData && 'opacity-60')}>
          <Indicadores d={d} {...(doMembro ? { membroId: doMembro } : {})} />
          <FunilEResultado d={d} mudar={mudar} />
          <CartaoDeAssociados
            busca={busca}
            nomeDaTag={nomeDaTag}
            novos={d.associados.novos}
            desassociados={d.associados.desassociados}
          />
        </div>
      ) : null}

      <Carteira
        busca={busca}
        nomeDaTag={nomeDaTag}
        tagId={d?.associados.tag?.id}
        membroId={doMembro}
      />

      {d ? (
        <FaixasDeAtendimento de={d.periodo.inicio} ate={d.periodo.fim} rotulo={d.periodo.rotulo} />
      ) : null}
    </div>
  )
}

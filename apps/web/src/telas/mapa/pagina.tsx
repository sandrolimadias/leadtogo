import type { EmpresaCarteira, PontosDoMapa } from '@leadtogo/api-client'
import { type AreaVisivel, MapaBase, type PinDoMapa } from '@/components/mapa/mapa-base'
import { useQuery } from '@tanstack/react-query'
import { Layers, PenLine, RectangleHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { useDispositivo } from '@/casca/dispositivo'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { cn } from '@/lib/cn'

import { BotaoDeFiltros, BuscaDoMapa, CamposDeFiltro, ChipsDoMapa } from './filtros'
import {
  filtrosAtivos,
  filtrosDaApi,
  type FiltrosDaTela,
  filtrosIniciais,
  tokenDoEstado,
} from './estado'
import { LegendaDoMapa } from './legenda'
import { PainelDaEmpresa } from './painel'
import { BarraDeRaio, ResultadoDaSelecao } from './selecao'

type Ferramenta = null | 'retangulo' | 'raio'
type Area = Pick<AreaVisivel, 'oeste' | 'sul' | 'leste' | 'norte' | 'zoom'>

/** Espera `ms` sem mudança para devolver o valor (a área do mapa muda a cada arrastada). */
function useAdiado<T>(valor: T, ms: number): T {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}

const arredondar = (n: number) => Math.round(n * 10_000) / 10_000

/**
 * A tela Mapa (G2): o mapa ocupa a área central inteira (exceção ao layout, docs/design_system.md, "Mapa").
 * Em cima dele: busca e chips de Status, filtros, o painel da empresa, a legenda, as ferramentas (retângulo e
 * raio), "Empresas próximas" e a cobertura por município. No celular o painel sobe de baixo e os filtros
 * ficam numa gaveta.
 */
export function TelaDoMapa() {
  const servicos = useServicos()
  const celular = useDispositivo() === 'celular'
  const opcoes = useQuery({
    queryKey: ['mapa', 'opcoes'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.mapa.opcoes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [filtros, setFiltros] = useState<FiltrosDaTela | null>(null)
  const efetivos = filtros ?? (opcoes.data ? filtrosIniciais(opcoes.data) : null)

  const [area, setArea] = useState<Area | null>(null)
  const areaAdiada = useAdiado(area, 300)
  const buscaAdiada = useAdiado(efetivos?.busca ?? '', 300)
  const [selecionada, setSelecionada] = useState<string | null>(null)
  const [foco, setFoco] = useState<{
    chave: number
    latitude: number
    longitude: number
    zoom?: number
  }>()
  const [gavetaAberta, setGavetaAberta] = useState(false)

  const [ferramenta, setFerramenta] = useState<Ferramenta>(null)
  const [canto, setCanto] = useState<{ latitude: number; longitude: number } | null>(null)
  const [centroDoRaio, setCentroDoRaio] = useState<{
    latitude: number
    longitude: number
    nome: string
    empresaId?: string
  } | null>(null)
  const [raioKm, setRaioKm] = useState(5)
  const [incluirVisitadas, setIncluirVisitadas] = useState(false)
  const [retangulo, setRetangulo] = useState<{
    oeste: number
    sul: number
    leste: number
    norte: number
  } | null>(null)
  const [mostraCobertura, setMostraCobertura] = useState(false)

  const filtrosApi = efetivos ? { ...filtrosDaApi(efetivos), busca: buscaAdiada } : null

  const pontos = useQuery<PontosDoMapa>({
    queryKey: [
      'mapa',
      'pontos',
      areaAdiada && [
        arredondar(areaAdiada.oeste),
        arredondar(areaAdiada.sul),
        arredondar(areaAdiada.leste),
        arredondar(areaAdiada.norte),
        Math.round(areaAdiada.zoom * 2),
      ],
      filtrosApi,
    ],
    enabled: Boolean(areaAdiada && filtrosApi),
    retry: false,
    placeholderData: (anterior) => anterior,
    queryFn: async ({ signal }) => {
      if (!areaAdiada || !filtrosApi) throw new Error('sem área')
      // o `signal` cancela este pedido se o mapa mexer de novo (a área muda a chave): a API não termina trabalho
      // que ninguém mais espera
      const r = await servicos.mapa.pontos(
        {
          ...areaAdiada,
          ...filtrosApi,
          busca: filtrosApi.busca || undefined,
        },
        signal,
      )
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const proximas = useQuery({
    queryKey: [
      'mapa',
      'proximas',
      centroDoRaio,
      raioKm,
      incluirVisitadas,
      filtrosApi?.statusTagIds,
    ],
    enabled: centroDoRaio !== null && ferramenta === 'raio',
    retry: false,
    queryFn: async () => {
      if (!centroDoRaio) throw new Error('sem centro')
      const r = await servicos.mapa.proximas({
        latitude: centroDoRaio.latitude,
        longitude: centroDoRaio.longitude,
        raioKm,
        incluirVisitadas: incluirVisitadas ? 'true' : 'false',
        ...(centroDoRaio.empresaId ? { excluirEmpresaId: centroDoRaio.empresaId } : {}),
        statusTagIds: [],
        lotes: [],
      } as never)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const retanguloResultado = useQuery({
    queryKey: ['mapa', 'selecao', retangulo, incluirVisitadas],
    enabled: retangulo !== null,
    retry: false,
    queryFn: async () => {
      if (!retangulo) throw new Error('sem retângulo')
      const r = await servicos.mapa.selecao({
        tipo: 'retangulo',
        ...retangulo,
        incluirVisitadas,
        filtros: {},
      } as never)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const cobertura = useQuery({
    queryKey: ['mapa', 'cobertura'],
    enabled: mostraCobertura,
    retry: false,
    queryFn: async () => {
      const r = await servicos.mapa.cobertura()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })

  const legenda = useMemo(() => opcoes.data?.legenda ?? [], [opcoes.data])
  const pins = useMemo<PinDoMapa[]>(
    () =>
      (pontos.data?.pontos ?? []).map((p) => ({
        id: p.id,
        latitude: p.latitude,
        longitude: p.longitude,
        cor: tokenDoEstado(legenda, pontos.data?.estados[p.estado] ?? ''),
        visitada: p.visitada,
        selecionado: p.id === selecionada,
      })),
    [pontos.data, legenda, selecionada],
  )
  const bolhas = useMemo(
    () => [
      ...(mostraCobertura
        ? (cobertura.data?.municipios ?? []).map((m) => ({
            id: `m${m.codigoIbge}`,
            latitude: m.latitude,
            longitude: m.longitude,
            total: m.faltam,
            texto: String(m.faltam),
            cor: m.faltam === 0 ? '--success' : '--warning',
            rotulo: `${m.nome}: ${m.visitadas} de ${m.total} visitadas, faltam ${m.faltam}`,
          }))
        : []),
    ],
    [cobertura.data, mostraCobertura],
  )

  const areas = useMemo(
    () => [
      ...(ferramenta === 'raio' && centroDoRaio
        ? [
            {
              tipo: 'circulo' as const,
              latitude: centroDoRaio.latitude,
              longitude: centroDoRaio.longitude,
              raioM: raioKm * 1000,
            },
          ]
        : []),
      ...(retangulo ? [{ tipo: 'retangulo' as const, ...retangulo }] : []),
    ],
    [ferramenta, centroDoRaio, raioKm, retangulo],
  )

  function aoClicarNoMapa(latitude: number, longitude: number) {
    if (ferramenta === 'raio') {
      setCentroDoRaio({ latitude, longitude, nome: 'o ponto marcado' })
      setSelecionada(null)
    } else if (ferramenta === 'retangulo') {
      if (!canto) {
        setCanto({ latitude, longitude })
        setRetangulo(null)
      } else {
        setRetangulo({
          oeste: Math.min(canto.longitude, longitude),
          leste: Math.max(canto.longitude, longitude),
          sul: Math.min(canto.latitude, latitude),
          norte: Math.max(canto.latitude, latitude),
        })
        setCanto(null)
      }
    }
  }

  function escolher(f: Ferramenta) {
    const nova = ferramenta === f ? null : f
    setFerramenta(nova)
    setCanto(null)
    setRetangulo(null)
    setCentroDoRaio(null)
  }

  function verProximas(e: EmpresaCarteira) {
    if (e.posicao.latitude === null || e.posicao.longitude === null) return
    setFerramenta('raio')
    setRetangulo(null)
    setCentroDoRaio({
      latitude: e.posicao.latitude,
      longitude: e.posicao.longitude,
      nome: e.nome,
      empresaId: e.id,
    })
  }

  function abrirEmpresa(id: string) {
    setSelecionada(id)
    const ponto = [...(pontos.data?.pontos ?? [])].find((p) => p.id === id)
    const item = [...(proximas.data?.itens ?? []), ...(retanguloResultado.data?.itens ?? [])].find(
      (i) => i.id === id,
    )
    const alvo = ponto ?? item
    if (alvo)
      setFoco({ chave: Date.now(), latitude: alvo.latitude, longitude: alvo.longitude, zoom: 16 })
  }

  if (opcoes.isPending) {
    return (
      <main data-mapa="" className="relative h-full w-full p-6">
        <Skeleton className="h-full w-full" />
      </main>
    )
  }
  if (opcoes.isError || !efetivos) {
    return (
      <main data-mapa="" className="p-6">
        <Alert tone="danger">Não consegui abrir o mapa. {opcoes.error?.message}</Alert>
      </main>
    )
  }
  const o = opcoes.data
  const resultado = ferramenta === 'raio' ? proximas.data : retanguloResultado.data
  const tituloDoResultado =
    ferramenta === 'raio' && centroDoRaio
      ? `Empresas até ${raioKm} km de ${centroDoRaio.nome}`
      : 'Empresas na área marcada'
  const total = pontos.data?.total
  const leadsLigados = o.chips.some((c) => c.porLote && efetivos.statusTagIds.includes(c.tagId))
  const painelAberto = selecionada !== null

  return (
    <main data-mapa="" className="relative h-full min-h-0 w-full flex-1 overflow-hidden">
      <MapaBase
        rotulo="Mapa das empresas"
        className="absolute inset-0"
        centro={[o.centroInicial.longitude, o.centroInicial.latitude]}
        zoom={o.centroInicial.zoom}
        pins={pins}
        bolhas={bolhas}
        areas={areas}
        desenhando={ferramenta !== null}
        semAvisoDeMapa
        {...(pontos.data?.comCnefe ? { fonteDosDados: 'Fonte: IBGE – CNEFE 2022' } : {})}
        {...(foco ? { foco } : {})}
        aoMover={setArea}
        aoClicarNoPin={abrirEmpresa}
        aoClicarNaBolha={(id) => {
          const b = bolhas.find((x) => x.id === id)
          if (b)
            setFoco({
              chave: Date.now(),
              latitude: b.latitude,
              longitude: b.longitude,
              zoom: (area?.zoom ?? 9) + 2,
            })
        }}
        aoClicarNoMapa={aoClicarNoMapa}
      />

      {/* Barra do topo: busca, chips e filtros */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 max-md:inset-x-2 max-md:top-2">
        <div className="pointer-events-auto flex w-[320px] max-md:w-full">
          <BuscaDoMapa
            valor={efetivos.busca}
            aoMudar={(v) => setFiltros({ ...efetivos, busca: v })}
          />
        </div>
        <div className="pointer-events-auto flex min-w-0 flex-1 flex-wrap gap-2 max-md:flex-nowrap max-md:overflow-x-auto">
          <ChipsDoMapa
            opcoes={o}
            filtros={efetivos}
            aoMudar={setFiltros}
            className="max-md:flex-nowrap"
          />
          <BotaoDeFiltros ativos={filtrosAtivos(efetivos)} aoClicar={() => setGavetaAberta(true)} />
        </div>
      </div>

      {/* Avisos (mapa base e leads): empilhados abaixo da barra, nunca por cima dela */}
      {(!o.mapaInstalado ||
        pontos.data?.truncado ||
        (leadsLigados && o.lotesDeLeads.length > 0 && efetivos.lotes.length === 0)) &&
      !(celular && painelAberto) ? (
        <div
          className={cn(
            'absolute z-10 flex flex-col gap-2',
            celular ? 'inset-x-2 bottom-2' : 'top-[92px] right-16 w-[300px]',
          )}
        >
          {!o.mapaInstalado ? (
            <p
              role="status"
              className="m-0 rounded-md border border-border bg-surface px-3 py-2 text-xs text-ink-muted shadow-md"
            >
              O mapa base ainda não foi instalado (docs/geo_atualizacao.md, seção 3). Os pins
              aparecem sobre um fundo liso.
            </p>
          ) : null}
          {pontos.data?.truncado ? (
            <p
              role="status"
              className="m-0 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md"
            >
              Mostrando {pontos.data.limite.toLocaleString('pt-BR')} de{' '}
              {pontos.data.total.toLocaleString('pt-BR')} empresas desta área. Aproxime o mapa ou
              use os filtros para ver as outras.
            </p>
          ) : null}
          {leadsLigados && o.lotesDeLeads.length > 0 && efetivos.lotes.length === 0 ? (
            <p
              role="status"
              className="m-0 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md"
            >
              Os leads só aparecem por lote de importação: abra “Filtros” e escolha um lote.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Painel da empresa */}
      {painelAberto && selecionada ? (
        <PainelDaEmpresa
          empresaId={selecionada}
          aoFechar={() => setSelecionada(null)}
          aoVerProximas={verProximas}
          className={cn(
            'z-20',
            celular
              ? 'absolute inset-x-0 bottom-0 max-h-[68%] rounded-b-none'
              : 'absolute top-[88px] bottom-3 left-3 w-[400px]',
          )}
        />
      ) : null}

      {/* Barra de raio e resultado */}
      {ferramenta === 'raio' && centroDoRaio ? (
        <BarraDeRaio
          className="absolute top-[88px] left-1/2 z-10 -translate-x-1/2 max-md:top-[118px] max-md:inset-x-2 max-md:translate-x-0"
          centroNome={centroDoRaio.nome}
          raioKm={raioKm}
          aoMudarRaio={setRaioKm}
          incluirVisitadas={incluirVisitadas}
          aoMudarIncluir={setIncluirVisitadas}
          total={proximas.data?.total ?? null}
          carregando={proximas.isFetching}
          aoFechar={() => escolher('raio')}
        />
      ) : null}
      {ferramenta !== null && resultado ? (
        <ResultadoDaSelecao
          titulo={tituloDoResultado}
          dados={resultado}
          aoAbrir={abrirEmpresa}
          aoFechar={() => escolher(ferramenta)}
          className={cn(
            'z-20',
            celular
              ? 'absolute inset-x-0 bottom-0 max-h-[55%] rounded-b-none'
              : 'absolute top-[140px] right-3 bottom-[200px] w-[340px]',
          )}
        />
      ) : null}

      {/* Ferramentas */}
      <div
        role="toolbar"
        aria-label="Ferramentas do mapa"
        className={cn(
          'absolute z-10 flex flex-col gap-2',
          celular ? 'right-2 bottom-[140px]' : 'top-[88px] right-3',
        )}
      >
        <IconButton
          icon={RectangleHorizontal}
          label={
            ferramenta === 'retangulo'
              ? 'Parar de selecionar por retângulo'
              : 'Selecionar por retângulo (toque em dois cantos)'
          }
          aria-pressed={ferramenta === 'retangulo'}
          onClick={() => escolher('retangulo')}
          className={cn('bg-surface shadow-md', ferramenta === 'retangulo' && 'ring-2 ring-brand')}
        />
        <IconButton
          icon={PenLine}
          label={
            ferramenta === 'raio'
              ? 'Parar de selecionar por raio'
              : 'Selecionar por raio (toque no centro)'
          }
          aria-pressed={ferramenta === 'raio'}
          onClick={() => escolher('raio')}
          className={cn('bg-surface shadow-md', ferramenta === 'raio' && 'ring-2 ring-brand')}
        />
        <IconButton
          icon={Layers}
          label={
            mostraCobertura
              ? 'Esconder a cobertura por município'
              : 'Mostrar a cobertura por município'
          }
          aria-pressed={mostraCobertura}
          onClick={() => setMostraCobertura((v) => !v)}
          className={cn('bg-surface shadow-md', mostraCobertura && 'ring-2 ring-brand')}
        />
      </div>
      {ferramenta === 'retangulo' && !retangulo ? (
        <p
          role="status"
          className="absolute bottom-[200px] left-1/2 z-10 m-0 -translate-x-1/2 rounded-md border border-border bg-surface px-3 py-2 text-[13px] shadow-md"
        >
          {canto ? 'Toque no canto oposto.' : 'Toque no primeiro canto do retângulo.'}
        </p>
      ) : null}

      {/* Rodapé: total e legenda */}
      {!painelAberto || !celular ? (
        <div
          className={cn(
            'pointer-events-none absolute z-10 flex flex-col gap-2',
            celular
              ? 'inset-x-2 bottom-2'
              : painelAberto
                ? 'bottom-3 left-[424px]'
                : 'bottom-3 left-3',
          )}
        >
          {total !== undefined ? (
            <p
              aria-live="polite"
              className="pointer-events-auto m-0 w-fit rounded-md border border-border bg-surface px-3 py-1.5 text-[13px] shadow-md"
            >
              <strong className="tabular-nums">{total.toLocaleString('pt-BR')}</strong>{' '}
              {total === 1 ? 'empresa' : 'empresas'} nesta área
              {leadsLigados && pontos.data && pontos.data.leads.total > 0
                ? ` · leads: ${pontos.data.leads.mostrados} de ${pontos.data.leads.total} (até ${pontos.data.leads.limite})`
                : ''}
            </p>
          ) : null}
          {!celular ? (
            <LegendaDoMapa entradas={legenda} className="pointer-events-auto w-[360px]" />
          ) : null}
        </div>
      ) : null}

      {/* Cobertura (lista) */}
      {mostraCobertura && cobertura.data && !celular ? (
        <section
          aria-label="Cobertura por município"
          className="absolute right-3 bottom-3 z-10 flex max-h-[180px] w-[340px] flex-col rounded-lg border border-border bg-surface shadow-lg"
        >
          <h2 className="m-0 border-b border-border px-3 py-2 text-[13px] font-semibold">
            Cobertura por município (carteira)
          </h2>
          <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2 text-[13px]">
            {cobertura.data.municipios.map((m) => (
              <li
                key={m.codigoIbge}
                className="flex items-center justify-between gap-2 px-1 py-0.5"
              >
                <span className="truncate">{m.nome}</span>
                <span className="tabular-nums text-ink-muted">
                  {m.visitadas} de {m.total} · faltam {m.faltam}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Gaveta de filtros */}
      <Dialog
        open={gavetaAberta}
        onOpenChange={setGavetaAberta}
        title="Filtros"
        description="Combine com os chips de Status do topo."
        footer={
          <>
            <Button onClick={() => setFiltros(filtrosIniciais(o))}>Limpar</Button>
            <Button variant="primary" onClick={() => setGavetaAberta(false)}>
              Ver no mapa
            </Button>
          </>
        }
      >
        <CamposDeFiltro opcoes={o} filtros={efetivos} aoMudar={setFiltros} />
      </Dialog>
      {pontos.isError ? (
        <p
          role="alert"
          className="absolute bottom-16 left-1/2 z-10 m-0 -translate-x-1/2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger shadow-md"
        >
          Não consegui carregar as empresas desta área.
          <button
            type="button"
            className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-inherit underline"
            onClick={() => void pontos.refetch()}
          >
            Tentar de novo
          </button>
          <X size={0} aria-hidden="true" />
        </p>
      ) : null}
    </main>
  )
}

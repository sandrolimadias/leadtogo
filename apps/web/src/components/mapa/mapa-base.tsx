import type { GeoJSONSource, Map as MapaDoMapLibre, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'

import { areaVisivel } from './area'
import { geojsonDaCobertura, geojsonDosPins } from './dados'
import { circulo, criarPin } from './pin'
import { desenharPin, lerIdDoIcone } from './icone'
import { corDoToken, temaAtual, useTema } from './tema'

export interface PinDoMapa {
  id: string
  latitude: number
  longitude: number
  /** Token do design system (`--tag-green-fg`) ou cor CSS */
  cor: string
  visitada?: boolean
  selecionado?: boolean
}

export interface BolhaDoMapa {
  id: string
  latitude: number
  longitude: number
  total: number
  cor: string
  /** Texto da bolha no lugar do total (ex.: "12" faltam) */
  texto?: string
  /** Rótulo acessível (e dica) no lugar de "N empresas nesta área" */
  rotulo?: string
}

/** Um retângulo ou círculo desenhado por cima do mapa (a seleção por área). */
export type AreaDesenhada =
  | { tipo: 'circulo'; latitude: number; longitude: number; raioM: number }
  | { tipo: 'retangulo'; oeste: number; sul: number; leste: number; norte: number }

export interface AreaVisivel {
  oeste: number
  sul: number
  leste: number
  norte: number
  zoom: number
}

export interface PropsDoMapa {
  /** [longitude, latitude] do centro inicial */
  centro: [number, number]
  zoom?: number
  className?: string
  /** Pins das empresas: desenhados pela GPU (camada do MapLibre) e agrupados em bolhas no navegador */
  pins?: PinDoMapa[]
  /** Bolhas da cobertura por município (as do agrupamento dos pins são do próprio mapa) */
  bolhas?: BolhaDoMapa[]
  /** Clique num pin ou bolha */
  aoClicarNoPin?: (id: string) => void
  aoClicarNaBolha?: (id: string) => void
  /** O mapa mexeu (arrastar, zoom): a área visível, para carregar só o que aparece */
  aoMover?: (area: AreaVisivel) => void
  /** Pin único que o usuário arrasta (tela "Ajustar posição") */
  arrastavel?: {
    latitude: number
    longitude: number
    aoSoltar: (latitude: number, longitude: number) => void
  }
  /** Círculo de incerteza (metros) em volta do pin arrastável */
  raioM?: number | null
  /** Clicar no mapa move o pin arrastável para lá */
  aoClicarNoMapa?: (latitude: number, longitude: number) => void
  /** Sem os controles de zoom (mapa pequeno da ficha) */
  semControles?: boolean
  /** Leva o mapa até aqui quando `chave` muda (voar para uma empresa, cidade ou área) */
  foco?: { chave: number; latitude: number; longitude: number; zoom?: number }
  /** Áreas da seleção (retângulo e raio) desenhadas por cima */
  areas?: AreaDesenhada[]
  /** O cursor vira uma cruz (modo de desenhar a área) */
  desenhando?: boolean
  /** Quem usa o mapa mostra o aviso de "mapa base não instalado" por conta própria */
  semAvisoDeMapa?: boolean
  /** Fonte dos dados dos pins (ex.: CNEFE), mostrada ao lado da atribuição do mapa base */
  fonteDosDados?: string
  rotulo: string
}

const CAMADAS_CLICAVEIS = ['pins', 'empresas-bolhas', 'cobertura-bolhas']
const FONTE_DOS_ROTULOS = ['Noto Sans Medium']
const VAZIO = { type: 'FeatureCollection' as const, features: [] }

/** Cria (se ainda não existirem) as fontes e camadas dos pins, das bolhas e da cobertura; some com o `setStyle`. */
function garantirCamadas(mapa: MapaDoMapLibre) {
  if (!mapa.getSource('empresas')) {
    mapa.addSource('empresas', {
      type: 'geojson',
      data: VAZIO,
      cluster: true,
      clusterRadius: 48,
      clusterMaxZoom: 14,
    })
  }
  if (!mapa.getLayer('empresas-bolhas')) {
    mapa.addLayer({
      id: 'empresas-bolhas',
      type: 'circle',
      source: 'empresas',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': corDoToken('--accent'),
        'circle-radius': ['step', ['get', 'point_count'], 16, 100, 22, 1000, 27],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
    mapa.addLayer({
      id: 'empresas-bolhas-total',
      type: 'symbol',
      source: 'empresas',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': FONTE_DOS_ROTULOS,
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    })
    mapa.addLayer({
      id: 'pins',
      type: 'symbol',
      source: 'empresas',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['get', 'icone'],
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'z'],
      },
    })
  }
  if (!mapa.getSource('cobertura')) {
    mapa.addSource('cobertura', { type: 'geojson', data: VAZIO })
    mapa.addLayer({
      id: 'cobertura-bolhas',
      type: 'circle',
      source: 'cobertura',
      paint: {
        'circle-color': ['get', 'cor'],
        'circle-radius': 18,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
    mapa.addLayer({
      id: 'cobertura-total',
      type: 'symbol',
      source: 'cobertura',
      layout: {
        'text-field': ['get', 'texto'],
        'text-font': FONTE_DOS_ROTULOS,
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    })
  }
}

/** `falhou`: o mapa base existe, mas não foi desenhado (worker não subiu, tiles ilegíveis ou sem resposta) */
type Estado = 'carregando' | 'pronto' | 'indisponivel' | 'falhou'

/** Quanto esperar pelo primeiro tile antes de avisar que o mapa não desenhou */
const ESPERA_DO_PRIMEIRO_TILE_MS = 20_000

/**
 * O mapa (MapLibre + PMTiles do estado, servido pela API). Carregado sob demanda (a biblioteca é pesada
 * e a maior parte das telas não a usa). Sem o arquivo do mapa no Garage, mostra um aviso e segue com um
 * fundo liso: o pin ainda se arrasta e as coordenadas valem.
 */
export function MapaBase(props: PropsDoMapa) {
  const tema = useTema()
  const contenedor = useRef<HTMLDivElement>(null)
  const mapaRef = useRef<MapaDoMapLibre | null>(null)
  const libRef = useRef<typeof import('maplibre-gl') | null>(null)
  const pinArrastavel = useRef<Marker | null>(null)
  const [estado, setEstado] = useState<Estado>('carregando')
  // Quantos elementos da base foram desenhados na última vez que o mapa ficou parado (0 = nada desenhado)
  const [desenhados, setDesenhados] = useState(0)
  const [versaoDoEstilo, setVersaoDoEstilo] = useState(0)
  // De onde vem o PMTiles (URL pública do bucket do mapa ou, transitório, a API): a API informa ao abrir
  const urlDaBaseRef = useRef<string | null>(null)
  // As funções mudam a cada render; o mapa lê sempre a última
  const ultimas = useRef(props)
  useEffect(() => {
    ultimas.current = props
  })

  // Cria o mapa uma vez
  useEffect(() => {
    let cancelado = false
    let mapa: MapaDoMapLibre | null = null
    let cleanupTemporizador: (() => void) | undefined
    let observador: ResizeObserver | undefined
    void (async () => {
      const [
        maplibre,
        { PMTiles, Protocol },
        { estiloDoMapa, urlDoMapaBase },
        { default: urlDoWorker },
      ] = await Promise.all([
        import('maplibre-gl'),
        import('pmtiles'),
        import('./estilo'),
        // O MapLibre 6 sobe o worker de um arquivo próprio (`maplibre-gl-worker.mjs`) que procura ao lado do
        // JS da biblioteca; o Vite embute a biblioteca num chunk e NÃO copia esse arquivo, então o worker
        // não subia em produção. `?url` publica o arquivo em /assets (mesma origem: `worker-src 'self'` da
        // CSP basta, sem blob:) e `setWorkerUrl` aponta o MapLibre para ele.
        import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
        import('maplibre-gl/dist/maplibre-gl.css'),
      ])
      if (cancelado || !contenedor.current) return
      libRef.current = maplibre
      maplibre.setWorkerUrl(urlDoWorker)
      const urlDaBase = await urlDoMapaBase()
      urlDaBaseRef.current = urlDaBase
      const protocolo = new Protocol()
      maplibre.addProtocol('pmtiles', protocolo.tile)
      if (urlDaBase) protocolo.add(new PMTiles(urlDaBase))
      const disponivel = urlDaBase
        ? await fetch(urlDaBase, { headers: { Range: 'bytes=0-0' } })
            .then((r) => r.ok || r.status === 206)
            .catch(() => false)
        : false
      if (cancelado || !contenedor.current) return
      setEstado(disponivel ? 'pronto' : 'indisponivel')
      mapa = new maplibre.Map({
        container: contenedor.current,
        style: disponivel
          ? estiloDoMapa(temaAtual(), urlDaBase as string)
          : {
              version: 8,
              // os rótulos das bolhas precisam dos glifos mesmo sem o mapa base
              glyphs: '/mapa/fontes/{fontstack}/{range}.pbf',
              sources: {},
              layers: [
                {
                  id: 'fundo',
                  type: 'background',
                  paint: { 'background-color': corDoToken('--surface-sunken') },
                },
              ],
            },
        center: ultimas.current.centro,
        zoom: ultimas.current.zoom ?? 12,
        attributionControl: { compact: false },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      })
      // Leitura para os testes no navegador (posição dos pins x projeção); não é API do componente
      Object.defineProperty(contenedor.current, '__mapa', { value: mapa, configurable: true })
      // O contêiner pode ganhar o tamanho final depois de o mapa existir (layout da área central, menu lateral,
      // painéis): sem isso o canvas fica com o tamanho antigo (faixa cinza) e a projeção dos pins sai errada
      if (typeof ResizeObserver !== 'undefined') {
        observador = new ResizeObserver(() => mapa?.resize())
        observador.observe(contenedor.current)
      }
      mapa.touchZoomRotate.disableRotation()
      if (!ultimas.current.semControles) {
        mapa.addControl(new maplibre.NavigationControl({ showCompass: false }), 'bottom-right')
      }
      mapa.on('moveend', () => {
        if (mapa) ultimas.current.aoMover?.(areaVisivel(mapa))
      })
      // Aviso em vez de ficar cinza em silêncio: worker que não sobe, base ilegível ou nenhum tile no prazo
      let temporizador: ReturnType<typeof setTimeout> | undefined
      if (disponivel) {
        temporizador = setTimeout(() => {
          console.error('[mapa] nenhum tile da base foi desenhado no prazo')
          setEstado((e) => (e === 'pronto' ? 'falhou' : e))
        }, ESPERA_DO_PRIMEIRO_TILE_MS)
        mapa.on('sourcedata', (e) => {
          if (e.sourceId !== 'base' || !e.isSourceLoaded) return
          clearTimeout(temporizador)
          setEstado((anterior) => (anterior === 'falhou' ? 'pronto' : anterior))
        })
        mapa.on('error', (e) => {
          const mensagem = e.error?.message ?? ''
          const daBase = (e as { sourceId?: string }).sourceId === 'base'
          if (!daBase && !/worker/i.test(mensagem)) return
          console.error('[mapa] falha ao desenhar o mapa base:', mensagem)
          clearTimeout(temporizador)
          setEstado((anterior) => (anterior === 'pronto' ? 'falhou' : anterior))
        })
        mapa.on('idle', () => setDesenhados(mapa?.queryRenderedFeatures().length ?? 0))
        cleanupTemporizador = () => clearTimeout(temporizador)
      }
      // Pins e bolhas são camadas do mapa (não há elemento DOM por empresa): o clique descobre o que está embaixo
      mapa.on('styleimagemissing', (e) => {
        const o = lerIdDoIcone(e.id)
        if (!o || !mapa) return
        mapa.addImage(e.id, desenharPin(o, corDoToken('--ink')), { pixelRatio: 2 })
      })
      mapa.on('click', (e) => {
        const camadas = CAMADAS_CLICAVEIS.filter((id) => mapa?.getLayer(id))
        const achados =
          camadas.length > 0
            ? (mapa?.queryRenderedFeatures(e.point, { layers: camadas }) ?? [])
            : []
        const topo = achados[0]
        const id = topo?.layer.id
        if (id === 'pins') {
          ultimas.current.aoClicarNoPin?.(String(topo?.properties['id']))
        } else if (id === 'empresas-bolhas' && topo) {
          const fonte = mapa?.getSource<GeoJSONSource>('empresas')
          const centro = (topo.geometry as { coordinates: [number, number] }).coordinates
          void fonte
            ?.getClusterExpansionZoom(Number(topo.properties['cluster_id']))
            .then((zoom) => {
              mapa?.easeTo({ center: centro, zoom: zoom + 0.5 })
            })
        } else if (id === 'cobertura-bolhas') {
          ultimas.current.aoClicarNaBolha?.(String(topo?.properties['id']))
        } else {
          ultimas.current.aoClicarNoMapa?.(e.lngLat.lat, e.lngLat.lng)
        }
      })
      mapa.on('mousemove', (e) => {
        const camadas = CAMADAS_CLICAVEIS.filter((id) => mapa?.getLayer(id))
        const emCima =
          camadas.length > 0 &&
          (mapa?.queryRenderedFeatures(e.point, { layers: camadas }).length ?? 0) > 0
        if (mapa) mapa.getCanvas().style.cursor = emCima ? 'pointer' : ''
      })
      mapa.on('load', () => {
        mapa?.resize()
        mapaRef.current = mapa
        setVersaoDoEstilo((v) => v + 1)
        if (mapa) ultimas.current.aoMover?.(areaVisivel(mapa))
      })
    })()
    return () => {
      cancelado = true
      cleanupTemporizador?.()
      observador?.disconnect()
      pinArrastavel.current?.remove()
      pinArrastavel.current = null
      mapaRef.current = null
      mapa?.remove()
    }
  }, [])

  // Troca o estilo quando o tema muda (só com o mapa base disponível)
  useEffect(() => {
    const mapa = mapaRef.current
    const url = urlDaBaseRef.current
    if (!mapa || estado !== 'pronto' || !url) return
    void import('./estilo').then(({ estiloDoMapa }) => {
      mapa.setStyle(estiloDoMapa(tema, url), { diff: true })
      void mapa.once('styledata', () => setVersaoDoEstilo((v) => v + 1))
    })
  }, [tema, estado])

  // Pins e bolhas: duas fontes GeoJSON e camadas (nada de elemento DOM por empresa). A fonte das empresas
  // agrupa em bolhas no próprio navegador (cluster do MapLibre); a da cobertura mostra "faltam N" por município.
  const { pins, bolhas } = props
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !mapa.isStyleLoaded()) return
    garantirCamadas(mapa)
    void mapa.getSource<GeoJSONSource>('empresas')?.setData(geojsonDosPins(pins ?? [], corDoToken))
    void mapa
      .getSource<GeoJSONSource>('cobertura')
      ?.setData(geojsonDaCobertura(bolhas ?? [], corDoToken))
  }, [pins, bolhas, versaoDoEstilo, tema])

  // Pin arrastável e o círculo de incerteza
  const alvoLatitude = props.arrastavel?.latitude
  const alvoLongitude = props.arrastavel?.longitude
  const raioM = props.raioM
  useEffect(() => {
    const mapa = mapaRef.current
    const lib = libRef.current
    if (!mapa || !lib) return
    pinArrastavel.current?.remove()
    pinArrastavel.current = null
    if (mapa.getLayer('incerteza')) mapa.removeLayer('incerteza')
    if (mapa.getLayer('incerteza-borda')) mapa.removeLayer('incerteza-borda')
    if (mapa.getSource('incerteza')) mapa.removeSource('incerteza')
    if (alvoLatitude === undefined || alvoLongitude === undefined) return
    const el = criarPin({
      cor: corDoToken('--accent'),
      selecionado: true,
      arrastavel: true,
      rotulo: 'Posição da empresa: arraste para ajustar',
    })
    const marcador = new lib.Marker({ element: el, anchor: 'bottom', draggable: true })
      .setLngLat([alvoLongitude, alvoLatitude])
      .addTo(mapa)
    marcador.on('dragend', () => {
      const p = marcador.getLngLat()
      ultimas.current.arrastavel?.aoSoltar(p.lat, p.lng)
    })
    pinArrastavel.current = marcador
    if (raioM) {
      mapa.addSource('incerteza', {
        type: 'geojson',
        data: circulo(alvoLatitude, alvoLongitude, raioM),
      })
      mapa.addLayer({
        id: 'incerteza',
        type: 'fill',
        source: 'incerteza',
        paint: { 'fill-color': corDoToken('--accent'), 'fill-opacity': 0.14 },
      })
      mapa.addLayer({
        id: 'incerteza-borda',
        type: 'line',
        source: 'incerteza',
        paint: {
          'line-color': corDoToken('--accent'),
          'line-width': 1.5,
          'line-dasharray': [2, 2],
        },
      })
    }
  }, [alvoLatitude, alvoLongitude, raioM, versaoDoEstilo])

  // Voar para um ponto
  const focoChave = props.foco?.chave
  const focoLat = props.foco?.latitude
  const focoLon = props.foco?.longitude
  const focoZoom = props.foco?.zoom
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || focoChave === undefined || focoLat === undefined || focoLon === undefined) return
    mapa.flyTo({
      center: [focoLon, focoLat],
      ...(focoZoom !== undefined ? { zoom: focoZoom } : {}),
      essential: true,
    })
    // só quando a chave muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focoChave, versaoDoEstilo])

  // Áreas da seleção
  const areas = props.areas
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa) return
    for (const id of ['areas-borda', 'areas-fundo']) if (mapa.getLayer(id)) mapa.removeLayer(id)
    if (mapa.getSource('areas')) mapa.removeSource('areas')
    if (!areas || areas.length === 0) return
    const features = areas.map((a) =>
      a.tipo === 'circulo'
        ? circulo(a.latitude, a.longitude, a.raioM)
        : {
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'Polygon' as const,
              coordinates: [
                [
                  [a.oeste, a.sul],
                  [a.leste, a.sul],
                  [a.leste, a.norte],
                  [a.oeste, a.norte],
                  [a.oeste, a.sul],
                ] as [number, number][],
              ],
            },
          },
    )
    mapa.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features } })
    mapa.addLayer({
      id: 'areas-fundo',
      type: 'fill',
      source: 'areas',
      paint: { 'fill-color': corDoToken('--accent'), 'fill-opacity': 0.12 },
    })
    mapa.addLayer({
      id: 'areas-borda',
      type: 'line',
      source: 'areas',
      paint: { 'line-color': corDoToken('--accent'), 'line-width': 2, 'line-dasharray': [3, 2] },
    })
  }, [areas, versaoDoEstilo])

  // Cursor de desenho
  useEffect(() => {
    const el = contenedor.current
    if (el) el.style.cursor = props.desenhando ? 'crosshair' : ''
  }, [props.desenhando])

  return (
    <div
      data-mapa-estado={estado}
      data-mapa-tiles={desenhados}
      className={cn('relative isolate overflow-hidden bg-surface-sunken', props.className)}
    >
      <div ref={contenedor} role="application" aria-label={props.rotulo} className="size-full" />
      {estado === 'indisponivel' && !props.semAvisoDeMapa ? (
        <p
          role="status"
          className="absolute top-2 left-2 z-10 m-0 max-w-[80%] rounded-sm border border-border bg-surface px-2.5 py-1.5 text-xs text-ink-muted shadow-sm"
        >
          O mapa base ainda não foi instalado. Os pontos continuam valendo.
        </p>
      ) : null}
      {props.fonteDosDados ? (
        <p className="pointer-events-none absolute right-0 bottom-5 z-10 m-0 rounded-l-sm bg-surface/80 px-1.5 py-0.5 text-[10px] text-ink-muted">
          {props.fonteDosDados}
        </p>
      ) : null}
      {estado === 'falhou' ? (
        <p
          role="alert"
          className="absolute top-2 left-2 z-10 m-0 max-w-[80%] rounded-sm border border-danger bg-surface px-2.5 py-1.5 text-xs text-ink shadow-sm"
        >
          Não foi possível desenhar o mapa. Recarregue a página; se continuar, avise o suporte. Os
          pontos continuam valendo.
        </p>
      ) : null}
      {estado === 'carregando' ? (
        <p
          role="status"
          className="absolute inset-0 m-0 grid place-items-center text-sm text-ink-muted"
        >
          Carregando o mapa…
        </p>
      ) : null}
    </div>
  )
}

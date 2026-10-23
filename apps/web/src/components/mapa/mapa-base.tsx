import type { GeoJSONSource, Map as MapaDoMapLibre, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'

import { areaVisivel } from './area'
import { geojsonDasBolhas, geojsonDosPins } from './dados'
import { deslocamentoMinimo, type Retangulo } from './revelar'
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

/** A rota desenhada por cima (G4): o trajeto e as paradas numeradas, na cor de destaque. */
export interface RotaDesenhada {
  /** `[longitude, latitude]`: o trajeto pelas ruas ou, em linha reta, a sequência de pontos */
  linha: [number, number][]
  /** Linha reta (estimativa sem o serviço de rotas): tracejado mais espaçado */
  emLinhaReta: boolean
  paradas: { id: string; latitude: number; longitude: number; numero: number; resolvida: boolean }[]
}

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
  /** Bolhas: as de município e de bairro (contadas no servidor) e as da cobertura por município */
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
  foco?: {
    chave: number
    latitude: number
    longitude: number
    zoom?: number
    /** Enquadra esta caixa (as empresas de uma bolha) em vez de ir para um ponto */
    caixa?: { oeste: number; sul: number; leste: number; norte: number }
    /** Com `caixa`: o zoom não fica abaixo disto (o início do nível seguinte, para a bolha se desfazer) */
    zoomMinimo?: number
  }
  /**
   * Garante que o pin não fique escondido atrás dos painéis: se ficar, o mapa desliza o MÍNIMO para mostrá-lo, sem
   * mudar o zoom (e nunca centraliza). `bloqueios` devolve os retângulos (da janela) que cobrem o mapa.
   */
  revelar?: {
    chave: number
    latitude: number
    longitude: number
    bloqueios: () => Retangulo[]
  }
  /** Áreas da seleção (retângulo e raio) desenhadas por cima */
  areas?: AreaDesenhada[]
  /** Rota em edição ou em execução: o trajeto e as paradas numeradas (clicar numa parada = clicar no pin) */
  rota?: RotaDesenhada | null
  /** O cursor vira uma cruz (modo de desenhar a área) */
  desenhando?: boolean
  /** Quem usa o mapa mostra o aviso de "mapa base não instalado" por conta própria */
  semAvisoDeMapa?: boolean
  /** Fonte dos dados dos pins (ex.: CNEFE), mostrada ao lado da atribuição do mapa base */
  fonteDosDados?: string
  rotulo: string
}

const CAMADAS_CLICAVEIS = ['rota-paradas', 'pins', 'bolhas-circulos']
const FONTE_DOS_ROTULOS = ['Noto Sans Medium']
const VAZIO = { type: 'FeatureCollection' as const, features: [] }

/** Cria (se ainda não existirem) as fontes e camadas dos pins e das bolhas; somem com o `setStyle`. */
function garantirCamadas(mapa: MapaDoMapLibre) {
  if (!mapa.getSource('empresas')) {
    // sem cluster: o agrupamento é por município e por bairro, contado no servidor (os pins só vêm de perto)
    mapa.addSource('empresas', { type: 'geojson', data: VAZIO })
    mapa.addLayer({
      id: 'pins',
      type: 'symbol',
      source: 'empresas',
      layout: {
        'icon-image': ['get', 'icone'],
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'symbol-sort-key': ['get', 'z'],
      },
    })
  }
  if (!mapa.getSource('bolhas')) {
    mapa.addSource('bolhas', { type: 'geojson', data: VAZIO })
    mapa.addLayer({
      id: 'bolhas-circulos',
      type: 'circle',
      source: 'bolhas',
      paint: {
        'circle-color': ['get', 'cor'],
        'circle-radius': ['get', 'raio'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
    mapa.addLayer({
      id: 'bolhas-total',
      type: 'symbol',
      source: 'bolhas',
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
      // MapLibre 6: as imagens que faltam são pedidas ao "resolvedor" (o evento `styleimagemissing` só avisa
      // depois, tarde demais para o símbolo já posicionado). Cada variação do pin (cor, visto, seleção) é
      // desenhada uma vez num canvas.
      mapa.setMissingStyleImageResolver((id) => {
        const o = lerIdDoIcone(id)
        if (!o || !mapa || mapa.hasImage(id)) return
        mapa.addImage(id, desenharPin(o, corDoToken('--ink')), { pixelRatio: 2 })
      })
      mapa.on('click', (e) => {
        const camadas = CAMADAS_CLICAVEIS.filter((id) => mapa?.getLayer(id))
        const achados =
          camadas.length > 0
            ? (mapa?.queryRenderedFeatures(e.point, { layers: camadas }) ?? [])
            : []
        const topo = achados[0]
        const id = topo?.layer.id
        if (id === 'pins' || id === 'rota-paradas') {
          ultimas.current.aoClicarNoPin?.(String(topo?.properties['id']))
        } else if (id === 'bolhas-circulos') {
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
      .getSource<GeoJSONSource>('bolhas')
      ?.setData(geojsonDasBolhas(bolhas ?? [], corDoToken))
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

  // Ir para um ponto, ou enquadrar a caixa de uma bolha (aproxima até o nível seguinte)
  const focoChave = props.foco?.chave
  const focoAplicado = useRef<number | undefined>(undefined)
  useEffect(() => {
    const mapa = mapaRef.current
    const foco = ultimas.current.foco
    if (!mapa || focoChave === undefined || !foco || focoAplicado.current === focoChave) return
    focoAplicado.current = focoChave
    if (foco.caixa) {
      const { oeste, sul, leste, norte } = foco.caixa
      const camera = mapa.cameraForBounds(
        [
          [oeste, sul],
          [leste, norte],
        ],
        { padding: 80, maxZoom: 16 },
      )
      const zoom = Math.max(camera?.zoom ?? mapa.getZoom(), foco.zoomMinimo ?? 0)
      mapa.flyTo({
        center: camera?.center ?? [foco.longitude, foco.latitude],
        zoom,
        essential: true,
      })
      return
    }
    mapa.flyTo({
      center: [foco.longitude, foco.latitude],
      ...(foco.zoom !== undefined ? { zoom: foco.zoom } : {}),
      essential: true,
    })
  }, [focoChave, versaoDoEstilo])

  // Pin escondido atrás do painel: desliza o mínimo (sem mudar o zoom, sem centralizar)
  const revelarChave = props.revelar?.chave
  useEffect(() => {
    const mapa = mapaRef.current
    const r = ultimas.current.revelar
    if (!mapa || revelarChave === undefined || !r) return
    const deslizar = () => {
      const c = mapa.getContainer().getBoundingClientRect()
      const p = mapa.project([r.longitude, r.latitude])
      const bloqueios = r.bloqueios().map((b) => ({
        esquerda: b.esquerda - c.left,
        direita: b.direita - c.left,
        topo: b.topo - c.top,
        base: b.base - c.top,
      }))
      const { dx, dy } = deslocamentoMinimo(
        { x: p.x, y: p.y },
        { largura: c.width, altura: c.height },
        bloqueios,
      )
      // panBy anda o CENTRO do mapa: para o pin ir à direita, o centro vai à esquerda
      if (dx !== 0 || dy !== 0) mapa.panBy([-dx, -dy], { duration: 300, essential: true })
    }
    // o painel acaba de abrir: mede depois do desenho e de novo quando o conteúdo (altura) assentou
    const a = requestAnimationFrame(deslizar)
    const b = setTimeout(deslizar, 450)
    return () => {
      cancelAnimationFrame(a)
      clearTimeout(b)
    }
  }, [revelarChave])

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

  // Rota: o trajeto por baixo dos pins e as paradas numeradas por cima
  const rota = props.rota
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || !mapa.isStyleLoaded()) return
    for (const id of ['rota-numeros', 'rota-paradas', 'rota-linha'])
      if (mapa.getLayer(id)) mapa.removeLayer(id)
    for (const id of ['rota-linha', 'rota-paradas']) if (mapa.getSource(id)) mapa.removeSource(id)
    if (!rota) return
    garantirCamadas(mapa)
    const destaque = corDoToken('--accent')
    if (rota.linha.length >= 2) {
      mapa.addSource('rota-linha', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: rota.linha },
        },
      })
      mapa.addLayer(
        {
          id: 'rota-linha',
          type: 'line',
          source: 'rota-linha',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': destaque,
            'line-width': 3,
            'line-dasharray': rota.emLinhaReta ? [1, 3] : [2, 1.5],
          },
        },
        'pins',
      )
    }
    mapa.addSource('rota-paradas', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: rota.paradas.map((p) => ({
          type: 'Feature' as const,
          properties: { id: p.id, numero: String(p.numero), resolvida: p.resolvida },
          geometry: { type: 'Point' as const, coordinates: [p.longitude, p.latitude] },
        })),
      },
    })
    mapa.addLayer({
      id: 'rota-paradas',
      type: 'circle',
      source: 'rota-paradas',
      paint: {
        'circle-color': ['case', ['get', 'resolvida'], corDoToken('--ink-subtle'), destaque],
        'circle-radius': 11,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
    mapa.addLayer({
      id: 'rota-numeros',
      type: 'symbol',
      source: 'rota-paradas',
      layout: {
        'text-field': ['get', 'numero'],
        'text-font': FONTE_DOS_ROTULOS,
        'text-size': 12,
        'text-allow-overlap': true,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': '#ffffff' },
    })
  }, [rota, versaoDoEstilo, tema])

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

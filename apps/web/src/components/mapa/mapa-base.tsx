import type { Map as MapaDoMapLibre, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/cn'

import { URL_DO_MAPA_BASE } from './estilo'
import { circulo, criarBolha, criarPin } from './pin'
import { corDoToken, temaAtual, useTema } from './tema'

export interface PinDoMapa {
  id: string
  latitude: number
  longitude: number
  /** Token do design system (`--tag-green-fg`) ou cor CSS */
  cor: string
  visitada?: boolean
  selecionado?: boolean
  rotulo: string
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
  pins?: PinDoMapa[]
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
  rotulo: string
}

type Estado = 'carregando' | 'pronto' | 'indisponivel'

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
  const marcadores = useRef<Marker[]>([])
  const pinArrastavel = useRef<Marker | null>(null)
  const [estado, setEstado] = useState<Estado>('carregando')
  const [versaoDoEstilo, setVersaoDoEstilo] = useState(0)
  // As funções mudam a cada render; o mapa lê sempre a última
  const ultimas = useRef(props)
  useEffect(() => {
    ultimas.current = props
  })

  // Cria o mapa uma vez
  useEffect(() => {
    let cancelado = false
    let mapa: MapaDoMapLibre | null = null
    void (async () => {
      const [maplibre, { PMTiles, Protocol }, { estiloDoMapa }] = await Promise.all([
        import('maplibre-gl'),
        import('pmtiles'),
        import('./estilo'),
        import('maplibre-gl/dist/maplibre-gl.css'),
      ])
      if (cancelado || !contenedor.current) return
      libRef.current = maplibre
      const protocolo = new Protocol()
      maplibre.addProtocol('pmtiles', protocolo.tile)
      protocolo.add(new PMTiles(URL_DO_MAPA_BASE))
      const disponivel = await fetch(URL_DO_MAPA_BASE, { headers: { Range: 'bytes=0-0' } })
        .then((r) => r.ok || r.status === 206)
        .catch(() => false)
      if (cancelado || !contenedor.current) return
      setEstado(disponivel ? 'pronto' : 'indisponivel')
      mapa = new maplibre.Map({
        container: contenedor.current,
        style: disponivel
          ? estiloDoMapa(temaAtual())
          : {
              version: 8,
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
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      })
      mapa.touchZoomRotate.disableRotation()
      if (!ultimas.current.semControles) {
        mapa.addControl(new maplibre.NavigationControl({ showCompass: false }), 'bottom-right')
      }
      mapa.on('moveend', () => {
        const b = mapa?.getBounds()
        if (!b || !mapa) return
        ultimas.current.aoMover?.({
          oeste: b.getWest(),
          sul: b.getSouth(),
          leste: b.getEast(),
          norte: b.getNorth(),
          zoom: mapa.getZoom(),
        })
      })
      mapa.on('click', (e) => ultimas.current.aoClicarNoMapa?.(e.lngLat.lat, e.lngLat.lng))
      mapa.on('load', () => {
        mapaRef.current = mapa
        setVersaoDoEstilo((v) => v + 1)
        const b = mapa?.getBounds()
        if (b && mapa) {
          ultimas.current.aoMover?.({
            oeste: b.getWest(),
            sul: b.getSouth(),
            leste: b.getEast(),
            norte: b.getNorth(),
            zoom: mapa.getZoom(),
          })
        }
      })
    })()
    return () => {
      cancelado = true
      for (const m of marcadores.current) m.remove()
      marcadores.current = []
      pinArrastavel.current?.remove()
      pinArrastavel.current = null
      mapaRef.current = null
      mapa?.remove()
    }
  }, [])

  // Troca o estilo quando o tema muda (só com o mapa base disponível)
  useEffect(() => {
    const mapa = mapaRef.current
    if (!mapa || estado !== 'pronto') return
    void import('./estilo').then(({ estiloDoMapa }) => {
      mapa.setStyle(estiloDoMapa(tema), { diff: true })
      void mapa.once('styledata', () => setVersaoDoEstilo((v) => v + 1))
    })
  }, [tema, estado])

  // Pins e bolhas
  const { pins, bolhas } = props
  useEffect(() => {
    const mapa = mapaRef.current
    const lib = libRef.current
    if (!mapa || !lib) return
    for (const m of marcadores.current) m.remove()
    marcadores.current = []
    for (const p of pins ?? []) {
      const el = criarPin({
        cor: p.cor.startsWith('--') ? corDoToken(p.cor) : p.cor,
        visitada: p.visitada ?? false,
        selecionado: p.selecionado ?? false,
        rotulo: p.rotulo,
      })
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        ultimas.current.aoClicarNoPin?.(p.id)
      })
      marcadores.current.push(
        new lib.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([p.longitude, p.latitude])
          .addTo(mapa),
      )
    }
    for (const b of bolhas ?? []) {
      const el = criarBolha(
        b.total,
        b.cor.startsWith('--') ? corDoToken(b.cor) : b.cor,
        b.rotulo ?? `${b.total} empresas nesta área`,
        b.texto,
      )
      el.addEventListener('click', (ev) => {
        ev.stopPropagation()
        ultimas.current.aoClicarNaBolha?.(b.id)
      })
      marcadores.current.push(
        new lib.Marker({ element: el }).setLngLat([b.longitude, b.latitude]).addTo(mapa),
      )
    }
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
    <div className={cn('relative isolate overflow-hidden bg-surface-sunken', props.className)}>
      <div ref={contenedor} role="application" aria-label={props.rotulo} className="size-full" />
      {estado === 'indisponivel' && !props.semAvisoDeMapa ? (
        <p
          role="status"
          className="absolute top-2 left-2 z-10 m-0 max-w-[80%] rounded-sm border border-border bg-surface px-2.5 py-1.5 text-xs text-ink-muted shadow-sm"
        >
          O mapa base ainda não foi instalado. Os pontos continuam valendo.
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

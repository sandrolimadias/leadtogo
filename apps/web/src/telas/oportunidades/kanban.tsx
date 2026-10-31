import {
  type CollisionDetection,
  DndContext,
  type Announcements,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { KanbanDeOportunidades, Oportunidade } from '@leadtogo/api-client'
import type { StatusDeFechamento } from '@leadtogo/shared'
import { ChevronsLeft, ChevronsRight, Plus } from 'lucide-react'
import { useRef, useState } from 'react'

import { useFasesRecolhidas } from '@/casca/preferencias'
import { IconButton } from '@leadtogo/ui/button'
import { classeDaCor } from '@leadtogo/ui/cores'
import { cn } from '@leadtogo/ui/cn'
import { useReduzirMovimento } from '@/lib/grafico'

import { useAcoesDaOportunidade } from './acoes'
import { AlcaDeArrastar, CartaoDeOportunidade } from './cartao'
import { useFormularioDeOportunidade } from './contexto-formulario'
import { reaisCurto } from './formatos'

type Fase = KanbanDeOportunidades['fases'][number]

const ZONAS: { status: StatusDeFechamento; rotulo: string; classe: string }[] = [
  { status: 'conquistado', rotulo: 'Conquistada', classe: 'border-success text-success' },
  { status: 'perdido', rotulo: 'Perdida', classe: 'border-danger text-danger' },
  { status: 'cancelado', rotulo: 'Cancelada', classe: 'border-border-strong text-ink-muted' },
  { status: 'suspenso', rotulo: 'Suspensa', classe: 'border-warning text-warning' },
]

/**
 * Onde o card cai: o que está sob o ponteiro (as zonas de fechamento ganham, se houver sobreposição), e, sem
 * ponteiro (teclado), o que o card sobrepõe.
 */
const colisao: CollisionDetection = (args) => {
  const sobOPonteiro = pointerWithin(args)
  const zonas = sobOPonteiro.filter((c) => ehZona(c.id))
  if (zonas.length > 0) return zonas
  return sobOPonteiro.length > 0 ? sobOPonteiro : rectIntersection(args)
}

const ehZona = (id: string | number) => String(id).startsWith('fechar:')
const centroDe = (r: { left: number; top: number; width: number; height: number }) => ({
  x: r.left + r.width / 2,
  y: r.top + r.height / 2,
})

/**
 * O teclado move o card de uma fase para a vizinha (setas para os lados, qualquer que seja a largura ou o
 * estado da coluna), sobe para as zonas de fechamento (seta para cima) e volta para as fases (seta para baixo).
 */
const coordenadasDoTeclado: KeyboardCoordinateGetter = (
  evento,
  { context, currentCoordinates: c },
) => {
  const rect = context.collisionRect
  if (!rect) return undefined
  const centro = centroDe(rect)
  const alvos = [...context.droppableRects.entries()].map(([id, r]) => ({
    id,
    r,
    zona: ehZona(id),
    centro: centroDe(r),
  }))
  const dentro = (a: (typeof alvos)[number]) =>
    centro.x >= a.r.left &&
    centro.x <= a.r.left + a.r.width &&
    centro.y >= a.r.top &&
    centro.y <= a.r.top + a.r.height
  const maisPerto = (lista: typeof alvos) =>
    [...lista].sort((a, b) => Math.abs(a.centro.x - centro.x) - Math.abs(b.centro.x - centro.x))[0]
  const atual = alvos.find(dentro) ?? maisPerto(alvos)
  if (!atual) return undefined
  const grupo = alvos.filter((a) => a.zona === atual.zona).sort((a, b) => a.r.left - b.r.left)
  const indice = grupo.findIndex((a) => a.id === atual.id)

  const irPara = (alvo: (typeof alvos)[number] | undefined, y = centro.y) =>
    alvo ? { x: c.x + (alvo.centro.x - centro.x), y: c.y + (y - centro.y) } : undefined

  switch (evento.code) {
    case 'ArrowRight':
      return irPara(grupo[indice + 1])
    case 'ArrowLeft':
      return irPara(grupo[indice - 1])
    case 'ArrowUp': {
      if (atual.zona) return undefined
      const zona = maisPerto(alvos.filter((a) => a.zona))
      return irPara(zona, zona?.centro.y)
    }
    case 'ArrowDown': {
      if (!atual.zona) return undefined
      const fase = maisPerto(alvos.filter((a) => !a.zona))
      return irPara(fase, fase ? fase.r.top + Math.min(fase.r.height / 2, 160) : undefined)
    }
    default:
      return undefined
  }
}

function CartaoArrastavel({ o, menu }: { o: Oportunidade; menu: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: o.id,
    data: { o },
    disabled: !o.editavel,
  })
  return (
    <div ref={setNodeRef}>
      <CartaoDeOportunidade
        o={o}
        arrastando={isDragging}
        menu={menu}
        alca={
          o.editavel ? (
            <AlcaDeArrastar titulo={o.titulo} {...attributes} {...listeners} />
          ) : undefined
        }
      />
    </div>
  )
}

function Coluna({
  fase,
  celular,
  renderMenu,
  aoCriar,
  aoRecolher,
}: {
  fase: Fase
  celular: boolean
  renderMenu: (o: Oportunidade) => React.ReactNode
  aoCriar: () => void
  /** Sem ele (celular, ou a última fase aberta), a coluna não tem o botão de recolher */
  aoRecolher?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: fase.id })
  return (
    <section
      ref={setNodeRef}
      aria-label={`Fase ${fase.nome}`}
      data-coluna="aberta"
      className={cn(
        'flex min-h-0 flex-col gap-1.5 rounded-lg bg-surface-sunken p-2',
        celular ? 'w-full flex-none snap-center' : 'min-w-0 flex-1 basis-0',
        isOver && 'outline-2 outline-offset-0 outline-brand outline-dashed',
      )}
    >
      <header className="flex items-center gap-1.5 px-1 pt-0.5">
        <span
          aria-hidden="true"
          className={cn('size-2.5 flex-none rounded-full', classeDaCor[fase.cor])}
        />
        <h2
          className="m-0 min-w-0 flex-1 truncate text-sm leading-5 font-semibold"
          title={fase.nome}
        >
          {fase.nome}
        </h2>
        {aoRecolher ? (
          <IconButton
            icon={ChevronsLeft}
            label={`Recolher a fase ${fase.nome}`}
            variant="ghost"
            size="sm"
            onClick={aoRecolher}
          />
        ) : null}
      </header>
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[13px] text-ink-muted tabular-nums" aria-label="Quantidade na fase">
          {fase.quantidade}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[13px] font-semibold tabular-nums"
          aria-label="Soma da fase"
        >
          {reaisCurto(fase.total)}
        </span>
        <IconButton
          icon={Plus}
          label={`Nova oportunidade em ${fase.nome}`}
          variant="ghost"
          size="sm"
          onClick={aoCriar}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
        {fase.itens.map((o) => (
          <CartaoArrastavel key={o.id} o={o} menu={renderMenu(o)} />
        ))}
        {fase.itens.length === 0 ? (
          <p className="m-0 rounded-md border border-dashed border-border-strong px-3 py-6 text-center text-[13px] text-ink-muted">
            Nenhuma oportunidade nesta fase.
          </p>
        ) : null}
        {fase.semMostrar > 0 ? (
          <p className="m-0 px-1 text-xs text-ink-muted">
            e mais {fase.semMostrar} nesta fase: use a busca ou a lista para achar.
          </p>
        ) : null}
      </div>
    </section>
  )
}

/** A fase recolhida: uma faixa estreita com o nome na vertical, a quantidade e a soma. Também recebe cards. */
function ColunaRecolhida({ fase, aoAbrir }: { fase: Fase; aoAbrir: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: fase.id })
  return (
    <section
      ref={setNodeRef}
      aria-label={`Fase ${fase.nome} (recolhida)`}
      data-coluna="recolhida"
      className={cn(
        'flex w-11 flex-none flex-col items-center gap-2 rounded-lg border border-border bg-surface-sunken py-2',
        isOver && 'outline-2 outline-offset-0 outline-brand outline-dashed',
      )}
    >
      <IconButton
        icon={ChevronsRight}
        label={`Abrir a fase ${fase.nome}`}
        variant="ghost"
        size="sm"
        aria-expanded="false"
        onClick={aoAbrir}
      />
      <span
        aria-hidden="true"
        className={cn('size-2.5 flex-none rounded-full', classeDaCor[fase.cor])}
      />
      <span className="text-[13px] font-semibold text-ink-muted tabular-nums">
        {fase.quantidade}
      </span>
      <span className="min-h-0 flex-1 overflow-hidden text-[13px] leading-5 font-semibold [writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-ellipsis">
        {fase.nome}
      </span>
      <span className="text-[11px] leading-4 text-ink-muted tabular-nums [writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
        {reaisCurto(fase.total)}
      </span>
    </section>
  )
}

function ZonaDeFechamento({ status, rotulo, classe }: (typeof ZONAS)[number]) {
  const { setNodeRef, isOver } = useDroppable({ id: `fechar:${status}` })
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`Soltar aqui para marcar como ${rotulo.toLowerCase()}`}
      className={cn(
        'flex h-12 min-w-0 items-center justify-center rounded-md border-2 border-dashed bg-surface px-1 text-center text-xs font-semibold md:text-sm',
        classe,
        isOver && 'bg-surface-hover',
      )}
    >
      {rotulo}
    </div>
  )
}

/**
 * O quadro: uma coluna por fase ativa, ocupando a altura toda da área central; cada coluna rola os próprios
 * cards por dentro e a página nunca rola. No computador e no tablet as colunas abertas dividem a largura por
 * igual, sem rolagem horizontal, e qualquer uma pode ser recolhida (o estado fica na conta, por funil). No
 * celular é uma coluna por vez, com rolagem lateral que encaixa e um indicador de posição. Arrastar pela alça
 * (mouse, toque ou teclado) muda de fase; as quatro zonas de fechamento aparecem no TOPO enquanto se arrasta,
 * numa faixa própria que empurra as colunas para baixo (o cabeçalho das fases continua visível).
 */
export function QuadroKanban({
  kanban,
  celular,
}: {
  kanban: KanbanDeOportunidades
  celular: boolean
}) {
  const acoes = useAcoesDaOportunidade()
  const { abrir } = useFormularioDeOportunidade()
  const [arrastada, setArrastada] = useState<Oportunidade | null>(null)
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: coordenadasDoTeclado }),
  )
  const fases = kanban.fases.map((f) => ({ id: f.id, nome: f.nome }))
  const idsDasFases = kanban.fases.map((f) => f.id)

  const recolhimento = useFasesRecolhidas(kanban.funil.id)
  // No celular não há recolher: é uma coluna por vez. Fase que não existe mais no funil é ignorada.
  const recolhidas = celular ? [] : recolhimento.recolhidas.filter((id) => idsDasFases.includes(id))
  const abertas = kanban.fases.length - recolhidas.length

  // Celular: a coluna em foco (para o indicador "2 de 5") e a rolagem até ela
  const quadro = useRef<HTMLDivElement>(null)
  const [atual, setAtual] = useState(0)
  const reduzir = useReduzirMovimento()
  const aoRolar = () => {
    const el = quadro.current
    if (!el || el.clientWidth === 0) return
    setAtual(Math.min(Math.round(el.scrollLeft / el.clientWidth), kanban.fases.length - 1))
  }
  const irPara = (indice: number) => {
    const el = quadro.current
    setAtual(indice)
    el?.scrollTo?.({ left: indice * el.clientWidth, behavior: reduzir ? 'auto' : 'smooth' })
  }

  const aoComecar = (e: DragStartEvent) => {
    setArrastada((e.active.data.current?.['o'] as Oportunidade | undefined) ?? null)
  }
  const aoSoltar = (e: DragEndEvent) => {
    const o = e.active.data.current?.['o'] as Oportunidade | undefined
    setArrastada(null)
    const alvo = e.over ? String(e.over.id) : null
    if (!o || !alvo) return
    if (ehZona(alvo)) {
      acoes.fechar(o, alvo.slice('fechar:'.length) as StatusDeFechamento)
      return
    }
    const fase = kanban.fases.find((f) => f.id === alvo)
    if (fase) void acoes.mover(o, fase.id, fase.nome)
  }

  // O que o leitor de tela anuncia ao arrastar (o padrão do dnd-kit é em inglês)
  const titulo = (e: { data: { current?: Record<string, unknown> } }) =>
    (e.data.current?.['o'] as Oportunidade | undefined)?.titulo ?? 'a oportunidade'
  const destino = (id: string | number | undefined) => {
    const alvo = String(id ?? '')
    if (ehZona(alvo)) {
      return `a zona ${ZONAS.find((z) => `fechar:${z.status}` === alvo)?.rotulo.toLowerCase() ?? ''}`
    }
    const fase = kanban.fases.find((f) => f.id === alvo)
    return fase ? `a fase ${fase.nome}` : 'nenhuma fase'
  }
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Pegou ${titulo(active)}.`,
    onDragOver: ({ active, over }) => `${titulo(active)} está sobre ${destino(over?.id)}.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titulo(active)} solto em ${destino(over.id)}.`
        : `${titulo(active)} foi solto fora das fases.`,
    onDragCancel: ({ active }) => `Arrastar ${titulo(active)} cancelado.`,
  }

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={colisao}
      // A faixa das zonas entra no fluxo depois que o arraste começa e as colunas descem: os alvos são
      // medidos de novo durante o arraste, senão o card cairia onde a coluna estava antes
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        announcements: anuncios,
        screenReaderInstructions: {
          draggable:
            'Para pegar a oportunidade, aperte Espaço. Use as setas para esquerda e direita para mudar de fase, a seta para cima para ir às zonas de fechamento e Espaço para soltar. Esc cancela.',
        },
      }}
      onDragStart={aoComecar}
      onDragEnd={aoSoltar}
      onDragCancel={() => setArrastada(null)}
    >
      <div className="flex min-h-[420px] min-w-0 flex-1 flex-col gap-2">
        {arrastada ? (
          <div data-zonas-de-fechamento="" className="grid flex-none grid-cols-4 gap-2">
            {ZONAS.map((z) => (
              <ZonaDeFechamento key={z.status} {...z} />
            ))}
          </div>
        ) : null}
        <div
          ref={quadro}
          role="region"
          aria-label={`Quadro do funil ${kanban.funil.nome}`}
          tabIndex={0}
          onScroll={celular ? aoRolar : undefined}
          className={cn(
            'flex min-h-0 flex-1 items-stretch',
            celular ? 'snap-x snap-mandatory overflow-x-auto' : 'gap-3',
          )}
        >
          {kanban.fases.map((f) =>
            recolhidas.includes(f.id) ? (
              <ColunaRecolhida
                key={f.id}
                fase={f}
                aoAbrir={() => recolhimento.alternar(f.id, idsDasFases)}
              />
            ) : (
              <Coluna
                key={f.id}
                fase={f}
                celular={celular}
                renderMenu={(o) => acoes.menu(o, fases)}
                aoCriar={() => abrir({ funilId: kanban.funil.id, faseId: f.id })}
                {...(celular || abertas <= 1
                  ? {}
                  : { aoRecolher: () => recolhimento.alternar(f.id, idsDasFases) })}
              />
            ),
          )}
        </div>
        {celular && kanban.fases.length > 1 ? (
          <div
            className="flex items-center justify-center gap-3"
            role="group"
            aria-label="Posição no funil"
          >
            <span className="text-xs text-ink-muted tabular-nums" aria-live="polite">
              {atual + 1} de {kanban.fases.length}
            </span>
            <div className="flex">
              {kanban.fases.map((f, i) => (
                <button
                  key={f.id}
                  type="button"
                  aria-label={`Ir para a fase ${f.nome}`}
                  aria-current={i === atual ? 'true' : undefined}
                  onClick={() => irPara(i)}
                  className="flex size-6 cursor-pointer items-center justify-center border-0 bg-transparent p-0"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'size-2 rounded-full',
                      i === atual ? 'bg-brand' : 'bg-border-strong',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <DragOverlay>
        {arrastada ? <CartaoDeOportunidade o={arrastada} sobreposto /> : null}
      </DragOverlay>
      {acoes.janelas}
    </DndContext>
  )
}

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { KanbanDeOportunidades, Oportunidade } from '@leadtogo/api-client'
import type { StatusDeFechamento } from '@leadtogo/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'

import { IconButton } from '@/components/ui/button'
import { classeDaCor } from '@/components/ui/cores'
import { cn } from '@/lib/cn'

import { useAcoesDaOportunidade } from './acoes'
import { AlcaDeArrastar, CartaoDeOportunidade } from './cartao'
import { useFormularioDeOportunidade } from './contexto-formulario'
import { reaisCurto } from './formatos'

type Fase = KanbanDeOportunidades['fases'][number]

/** Uma coluna (296 px) mais o espaço entre elas: a seta para os lados pula de coluna em coluna. */
const PASSO_DA_COLUNA = 308
const PASSO_VERTICAL = 80

/** As setas movem o card com o teclado: uma coluna por vez para os lados e um pedaço para cima e para baixo. */
const coordenadasDoTeclado: KeyboardCoordinateGetter = (evento, { currentCoordinates: c }) => {
  switch (evento.code) {
    case 'ArrowRight':
      return { ...c, x: c.x + PASSO_DA_COLUNA }
    case 'ArrowLeft':
      return { ...c, x: c.x - PASSO_DA_COLUNA }
    case 'ArrowDown':
      return { ...c, y: c.y + PASSO_VERTICAL }
    case 'ArrowUp':
      return { ...c, y: c.y - PASSO_VERTICAL }
    default:
      return undefined
  }
}

const ZONAS: { status: StatusDeFechamento; rotulo: string; classe: string }[] = [
  { status: 'conquistado', rotulo: 'Conquistada', classe: 'border-success text-success' },
  { status: 'perdido', rotulo: 'Perdida', classe: 'border-danger text-danger' },
  { status: 'cancelado', rotulo: 'Cancelada', classe: 'border-border-strong text-ink-muted' },
  { status: 'suspenso', rotulo: 'Suspensa', classe: 'border-warning text-warning' },
]

function CartaoArrastavel({
  o,
  celular,
  menu,
}: {
  o: Oportunidade
  celular: boolean
  menu: React.ReactNode
}) {
  const podeArrastar = !celular && o.editavel
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: o.id,
    data: { o },
    disabled: !podeArrastar,
  })
  return (
    <div ref={setNodeRef}>
      <CartaoDeOportunidade
        o={o}
        arrastando={isDragging}
        menu={menu}
        alca={
          podeArrastar ? (
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
}: {
  fase: Fase
  celular: boolean
  renderMenu: (o: Oportunidade) => React.ReactNode
  aoCriar: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: fase.id })
  return (
    <section
      ref={setNodeRef}
      aria-label={`Fase ${fase.nome}`}
      className={cn(
        'flex flex-none flex-col gap-2 rounded-lg bg-surface-sunken p-2',
        celular ? 'w-[86vw] snap-center' : 'w-(--kanban-column)',
        isOver && 'outline-2 outline-offset-0 outline-brand outline-dashed',
      )}
    >
      <header className="flex items-center gap-2 px-1 pt-1">
        <span
          aria-hidden="true"
          className={cn('size-2.5 flex-none rounded-full', classeDaCor[fase.cor])}
        />
        <h2 className="m-0 min-w-0 flex-1 truncate text-sm leading-5 font-semibold">{fase.nome}</h2>
        <span className="text-[13px] text-ink-muted tabular-nums">{fase.quantidade}</span>
        <IconButton
          icon={Plus}
          label={`Nova oportunidade em ${fase.nome}`}
          variant="ghost"
          size="sm"
          onClick={aoCriar}
        />
      </header>
      <span className="px-1 text-[13px] font-semibold tabular-nums" aria-label="Soma da fase">
        {reaisCurto(fase.total)}
      </span>
      <div className="flex flex-col gap-2">
        {fase.itens.map((o) => (
          <CartaoArrastavel key={o.id} o={o} celular={celular} menu={renderMenu(o)} />
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

function ZonaDeFechamento({ status, rotulo, classe }: (typeof ZONAS)[number]) {
  const { setNodeRef, isOver } = useDroppable({ id: `fechar:${status}` })
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`Soltar aqui para marcar como ${rotulo.toLowerCase()}`}
      className={cn(
        'flex h-13 min-w-0 flex-1 items-center justify-center rounded-md border-2 border-dashed bg-surface text-sm font-semibold',
        classe,
        isOver && 'bg-surface-hover',
      )}
    >
      {rotulo}
    </div>
  )
}

/**
 * O quadro: uma coluna por fase ativa. Arrastar pela alça (mouse, toque ou teclado) muda de fase; soltar numa
 * das quatro zonas do rodapé abre o fechamento. No celular não há arrastar: o menu do card move e fecha.
 * O quadro rola na horizontal por dentro quando as colunas não cabem; a página nunca rola.
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

  const aoComecar = (e: DragStartEvent) => {
    setArrastada((e.active.data.current?.['o'] as Oportunidade | undefined) ?? null)
  }
  const aoSoltar = (e: DragEndEvent) => {
    const o = e.active.data.current?.['o'] as Oportunidade | undefined
    setArrastada(null)
    const alvo = e.over ? String(e.over.id) : null
    if (!o || !alvo) return
    if (alvo.startsWith('fechar:')) {
      acoes.fechar(o, alvo.slice('fechar:'.length) as StatusDeFechamento)
      return
    }
    const fase = kanban.fases.find((f) => f.id === alvo)
    if (fase) void acoes.mover(o, fase.id, fase.nome)
  }

  return (
    <DndContext
      sensors={sensores}
      onDragStart={aoComecar}
      onDragEnd={aoSoltar}
      onDragCancel={() => setArrastada(null)}
    >
      <div
        role="region"
        aria-label={`Quadro do funil ${kanban.funil.nome}`}
        tabIndex={0}
        className={cn(
          'flex items-start gap-3 overflow-x-auto pb-2',
          celular && 'snap-x snap-mandatory',
        )}
      >
        {kanban.fases.map((f) => (
          <Coluna
            key={f.id}
            fase={f}
            celular={celular}
            renderMenu={(o) => acoes.menu(o, fases)}
            aoCriar={() => abrir({ funilId: kanban.funil.id, faseId: f.id })}
          />
        ))}
      </div>
      {arrastada && !celular ? (
        <div className="sticky bottom-0 z-20 flex gap-2 bg-bg/90 py-2 backdrop-blur-sm">
          {ZONAS.map((z) => (
            <ZonaDeFechamento key={z.status} {...z} />
          ))}
        </div>
      ) : null}
      <DragOverlay>
        {arrastada ? <CartaoDeOportunidade o={arrastada} sobreposto /> : null}
      </DragOverlay>
      {acoes.janelas}
    </DndContext>
  )
}

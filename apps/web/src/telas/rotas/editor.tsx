import type { PontoDePartida, Rota } from '@leadtogo/api-client'
import {
  codigoDaRota,
  type Coordenada,
  duracaoTotalS,
  formatarDistancia,
  formatarDuracao,
  MENSAGEM_DO_AVISO_DA_OTIMIZACAO,
  type AvisoDaOtimizacao,
} from '@leadtogo/shared'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { AlertTriangle, Flag, GripVertical, Navigation, X, Zap } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { Button, IconButton } from '@/components/ui/button'
import { Select, TextField } from '@/components/ui/campos'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/exibicao'
import { Alert } from '@/components/ui/feedback'
import { cn } from '@/lib/cn'

import { LinksDeNavegacao } from './navegacao'
import {
  moverParada,
  type ParadaDoRascunho,
  type RascunhoDeRota,
  removerParada,
  totaisEmLinhaReta,
} from './rascunho'

export interface PropsDoEditor {
  rascunho: RascunhoDeRota
  aoMudar: (r: RascunhoDeRota) => void
  /** A rota como está salva (os totais pelas ruas e o trajeto valem enquanto nada muda) */
  salva: Rota | null
  vendedores: readonly { id: string; nome: string }[]
  podeAtribuir: boolean
  pontos: readonly PontoDePartida[]
  maxParadas: number
  otimizacaoConfigurada: boolean
  /** Início das estimativas e dos links: o ponto escolhido ou a posição do aparelho (se lida) */
  inicio: Coordenada | null
  aviso: AvisoDaOtimizacao | null
  otimizando: boolean
  salvando: boolean
  aoOtimizar: () => void
  aoSalvar: () => void
  aoFechar: () => void
  aoAbrirParada: (empresaId: string) => void
  className?: string
}

/** Cartão dos totais (distância e tempo). */
function Total({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-md bg-surface-sunken px-3 py-2">
      <p className="m-0 text-lg font-semibold tabular-nums">{valor}</p>
      <p className="m-0 truncate text-xs text-ink-muted">{rotulo}</p>
    </div>
  )
}

function LinhaDaParada({
  parada,
  indice,
  podeEditar,
  aoRemover,
  aoAbrir,
  aoMover,
  total,
}: {
  parada: ParadaDoRascunho
  indice: number
  podeEditar: boolean
  aoRemover: () => void
  aoAbrir: () => void
  aoMover: (para: number) => void
  total: number
}) {
  const id = String(indice)
  const arrasto = useDraggable({ id, disabled: !podeEditar })
  const alvo = useDroppable({ id })
  const deslocamento = arrasto.transform
    ? `translate3d(0, ${Math.round(arrasto.transform.y)}px, 0)`
    : undefined
  return (
    <li
      ref={(el) => {
        arrasto.setNodeRef(el)
        alvo.setNodeRef(el)
      }}
      style={deslocamento ? { transform: deslocamento } : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md px-1 py-2',
        alvo.isOver && !arrasto.isDragging && 'bg-brand-soft',
        arrasto.isDragging && 'relative z-10 bg-surface shadow-md',
      )}
    >
      {podeEditar ? (
        <button
          type="button"
          {...arrasto.listeners}
          {...arrasto.attributes}
          aria-label={`Mover ${parada.nome} (posição ${indice + 1} de ${total}); use as setas`}
          onKeyDown={(e) => {
            // setas movem uma posição (além do teclado do arrasto)
            if (e.key === 'ArrowUp' && indice > 0) {
              e.preventDefault()
              aoMover(indice - 1)
            } else if (e.key === 'ArrowDown' && indice < total - 1) {
              e.preventDefault()
              aoMover(indice + 1)
            }
          }}
          className="inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm border-0 bg-transparent text-ink-subtle hover:bg-surface-sunken"
        >
          <GripVertical size={16} aria-hidden="true" />
        </button>
      ) : (
        <span className="size-8 shrink-0" />
      )}
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-on-brand',
          parada.resolvida ? 'bg-ink-subtle' : 'bg-brand',
        )}
      >
        {indice + 1}
      </span>
      <button
        type="button"
        onClick={aoAbrir}
        className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-ink"
      >
        <span className="block truncate text-sm font-semibold">{parada.nome}</span>
        <span className="block truncate text-xs text-ink-muted">
          {[
            parada.detalhe,
            parada.distanciaTrechoM !== null
              ? `+${formatarDistancia(parada.distanciaTrechoM)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {parada.precisao === 'aproximada' ? (
          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-warning">
            <AlertTriangle size={12} aria-hidden="true" /> Posição aproximada: confira antes de ir
          </span>
        ) : null}
        {parada.resolvida ? (
          <span className="mt-0.5 block text-xs text-ink-muted">Já visitada ou pulada</span>
        ) : null}
      </button>
      {podeEditar && !parada.resolvida ? (
        <IconButton icon={X} label={`Tirar ${parada.nome} da rota`} size="sm" onClick={aoRemover} />
      ) : null}
    </li>
  )
}

/**
 * O editor de rota (G4a), no painel à direita do mapa (docs/design_system.md, "Editor de rota"): nome,
 * data, responsável, ponto de partida, a ordem de visita (arrastar pela alça ou setas), "Otimizar ordem",
 * os totais e, no rodapé, Google Maps e Salvar. Sem o serviço de rotas configurado, a otimização fica
 * desligada com o aviso "Otimização de rotas ainda não configurada".
 */
export function EditorDeRota(p: PropsDoEditor) {
  const r = p.rascunho
  const [navegarAberto, setNavegarAberto] = useState(false)
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )
  const podeEditar = p.salva ? p.salva.podeEditar : true
  const mudar = (parcial: Partial<RascunhoDeRota>) =>
    p.aoMudar({ ...r, ...parcial, alterado: true })
  const pelasRuas = p.salva && !r.alterado && p.salva.estimativa === 'ruas'
  const totais =
    p.salva && !r.alterado && p.salva.distanciaM !== null
      ? { distanciaM: p.salva.distanciaM, duracaoS: p.salva.duracaoS ?? 0 }
      : totaisEmLinhaReta(r, p.inicio)
  const pontosAtivos = p.pontos.filter((x) => x.ativo || x.id === r.pontoPartidaId)

  function aoArrastar(e: DragEndEvent) {
    if (!e.over) return
    p.aoMudar(moverParada(r, Number(e.active.id), Number(e.over.id)))
  }

  const titulo = r.id && r.codigo !== null ? `Editando ${codigoDaRota(r.codigo)}` : 'Nova rota'
  let rodape: ReactNode = null
  if (podeEditar) {
    rodape = (
      <Button
        variant="primary"
        loading={p.salvando}
        disabled={r.paradas.length === 0 || r.nome.trim() === ''}
        onClick={p.aoSalvar}
      >
        {r.id ? 'Salvar alterações' : 'Criar rota'}
      </Button>
    )
  }

  return (
    <section
      aria-label="Editor de rota"
      className={cn(
        'flex min-h-0 flex-col rounded-lg border border-border bg-surface shadow-lg',
        p.className,
      )}
    >
      <header className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">
            {titulo}
          </p>
          <h2 className="m-0 text-lg font-semibold">
            {r.paradas.length} {r.paradas.length === 1 ? 'parada' : 'paradas'}
            <span className="text-sm font-normal text-ink-muted"> de até {p.maxParadas}</span>
          </h2>
        </div>
        <IconButton icon={X} label="Fechar o editor de rota" onClick={p.aoFechar} />
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="flex gap-2">
          <Total
            valor={formatarDistancia(totais.distanciaM)}
            rotulo={pelasRuas ? 'pelas ruas' : 'distância estimada'}
          />
          <Total
            valor={formatarDuracao(
              duracaoTotalS(totais.duracaoS, r.paradas.length, r.minutosPorVisita),
            )}
            rotulo={`com ${r.minutosPorVisita} min por visita`}
          />
        </div>
        {!pelasRuas && r.paradas.length > 1 ? (
          <p className="mt-1 mb-0 text-xs text-ink-muted">Estimativa em linha reta.</p>
        ) : null}

        {!p.otimizacaoConfigurada ? (
          <Alert tone="info" className="mt-3">
            {MENSAGEM_DO_AVISO_DA_OTIMIZACAO.nao_configurada}. Monte e ordene à mão; as distâncias
            saem em linha reta.
          </Alert>
        ) : p.aviso ? (
          <Alert tone="warning" className="mt-3">
            {MENSAGEM_DO_AVISO_DA_OTIMIZACAO[p.aviso]}.
          </Alert>
        ) : null}

        <fieldset disabled={!podeEditar} className="m-0 mt-3 flex flex-col gap-3 border-0 p-0">
          <TextField
            label="Nome da rota"
            value={r.nome}
            onChange={(e) => mudar({ nome: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="Data"
              type="date"
              value={r.data}
              onChange={(e) => mudar({ data: e.target.value })}
              required
            />
            <Select
              label="Vendedor"
              value={r.responsavelId}
              disabled={!p.podeAtribuir}
              onChange={(e) => mudar({ responsavelId: e.target.value })}
              options={[
                ...(r.responsavelId === '' ? [{ value: '', label: 'Eu' }] : []),
                ...p.vendedores.map((v) => ({ value: v.id, label: v.nome })),
              ]}
            />
          </div>
          <Select
            label="Ponto de partida"
            value={r.partida === 'ponto' && r.pontoPartidaId ? r.pontoPartidaId : 'posicao_atual'}
            onChange={(e) =>
              e.target.value === 'posicao_atual'
                ? mudar({ partida: 'posicao_atual' })
                : mudar({ partida: 'ponto', pontoPartidaId: e.target.value })
            }
            options={[
              { value: 'posicao_atual', label: 'Minha posição atual' },
              ...pontosAtivos.map((x) => ({ value: x.id, label: x.nome })),
            ]}
            hint={r.partida === 'posicao_atual' ? 'Usada só no cálculo; não é gravada.' : undefined}
          />
          <div className="flex flex-wrap items-center gap-4">
            <Checkbox
              label="Voltar ao ponto de partida"
              checked={r.voltarAoInicio}
              onChange={(e) => mudar({ voltarAoInicio: e.target.checked })}
            />
            <TextField
              label="Min por visita"
              type="number"
              min={0}
              max={480}
              className="w-[120px]"
              value={String(r.minutosPorVisita)}
              onChange={(e) =>
                mudar({ minutosPorVisita: Math.max(0, Math.min(480, Number(e.target.value) || 0)) })
              }
            />
          </div>
        </fieldset>

        <div className="mt-4 flex items-center justify-between gap-2">
          <h3 className="m-0 text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">
            Ordem de visita
          </h3>
          {podeEditar ? (
            <Button
              variant="ghost"
              size="sm"
              icon={Zap}
              loading={p.otimizando}
              disabled={!p.otimizacaoConfigurada || r.paradas.length < 2}
              title={
                !p.otimizacaoConfigurada
                  ? MENSAGEM_DO_AVISO_DA_OTIMIZACAO.nao_configurada
                  : undefined
              }
              onClick={p.aoOtimizar}
            >
              Otimizar ordem
            </Button>
          ) : null}
        </div>
        <p className="m-0 mt-2 flex items-center gap-2 rounded-md px-1 py-1 text-sm">
          <Flag size={16} className="text-ink-subtle" aria-hidden="true" />
          <span>
            <strong>Saída:</strong>{' '}
            {r.partida === 'ponto'
              ? (p.pontos.find((x) => x.id === r.pontoPartidaId)?.nome ?? 'ponto de partida')
              : 'minha posição atual'}
          </span>
        </p>
        {r.paradas.length === 0 ? (
          <p className="m-0 mt-2 text-sm text-ink-muted">
            Toque numa empresa no mapa e em “Adicionar à rota”, ou use “Empresas próximas” e a
            seleção por área para adicionar várias.
          </p>
        ) : (
          <DndContext sensors={sensores} onDragEnd={aoArrastar}>
            <ol className="m-0 mt-1 list-none p-0" aria-label="Paradas na ordem de visita">
              {r.paradas.map((parada, i) => (
                <LinhaDaParada
                  key={parada.empresaId}
                  parada={parada}
                  indice={i}
                  total={r.paradas.length}
                  podeEditar={podeEditar}
                  aoRemover={() => p.aoMudar(removerParada(r, parada.empresaId))}
                  aoAbrir={() => p.aoAbrirParada(parada.empresaId)}
                  aoMover={(para) => p.aoMudar(moverParada(r, i, para))}
                />
              ))}
            </ol>
          </DndContext>
        )}
        {p.salva && p.salva.situacao !== 'planejada' ? (
          <p className="m-0 mt-2">
            <Badge tone={p.salva.situacao === 'cancelada' ? 'danger' : 'info'}>
              {p.salva.situacao === 'em_andamento'
                ? 'Em andamento'
                : p.salva.situacao === 'concluida'
                  ? 'Concluída'
                  : 'Cancelada'}
            </Badge>
          </p>
        ) : null}
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
        <Button
          icon={Navigation}
          disabled={r.paradas.length === 0}
          onClick={() => setNavegarAberto(true)}
        >
          Google Maps
        </Button>
        {rodape}
      </footer>
      <LinksDeNavegacao
        aberto={navegarAberto}
        aoFechar={() => setNavegarAberto(false)}
        origem={r.partida === 'ponto' ? p.inicio : null}
        paradas={r.paradas}
        voltarPara={r.voltarAoInicio && r.partida === 'ponto' ? p.inicio : null}
      />
    </section>
  )
}

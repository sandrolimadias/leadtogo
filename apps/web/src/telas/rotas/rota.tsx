import type { ParadaDaRota, Rota } from '@leadtogo/api-client'
import {
  codigoDaRota,
  duracaoTotalS,
  formatarDistancia,
  formatarDuracao,
  linkDeLigacao,
  linkDoWaze,
  ROTULO_DA_SITUACAO_DE_ROTA,
} from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import {
  Check,
  CloudDownload,
  Map as MapaIcone,
  Navigation,
  Phone,
  SkipForward,
  SquareCheck,
} from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/exibicao'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { guardarEmpresas } from '@/lib/offline/visitas'
import { cn } from '@/lib/cn'
import { BotaoDeVisita } from '@/telas/visitas/campo/checkin'

import { TOM_DA_SITUACAO } from './situacao'
import { LinksDeNavegacao } from './navegacao'
import { guardarRotaOffline, rotaOffline } from './offline'

const rotaDaTela = getRouteApi('/_autenticado/rotas/$rotaId')

const classeDoBotao =
  'inline-flex h-(--ctl) items-center gap-2 rounded-sm border border-border-strong bg-surface px-3 text-sm font-semibold text-ink no-underline hover:bg-surface-hover'

const comPosicao = (p: ParadaDaRota) => p.latitude !== null && p.longitude !== null

function Parada({
  p,
  destaque,
  podeExecutar,
  aoPular,
}: {
  p: ParadaDaRota
  destaque: boolean
  podeExecutar: boolean
  aoPular: () => void
}) {
  const ligar = p.telefone ? linkDeLigacao(p.telefone) : null
  return (
    <li
      className={cn(
        'flex flex-col gap-2 border-b border-border px-4 py-3 last:border-b-0',
        destaque && 'bg-brand-soft',
      )}
      aria-current={destaque ? 'step' : undefined}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-on-brand',
            p.situacao === 'pendente' ? 'bg-brand' : 'bg-ink-subtle',
          )}
        >
          {p.situacao === 'visitada' ? <Check size={15} /> : p.ordem}
        </span>
        <div className="min-w-0 flex-1">
          <Link
            to="/empresas/$empresaId"
            params={{ empresaId: p.empresaId }}
            className="block truncate font-semibold text-ink"
          >
            {p.empresaNome}
          </Link>
          <p className="m-0 truncate text-xs text-ink-muted">
            {[p.bairro, p.cidade].filter(Boolean).join(' · ') || 'Sem endereço'}
            {p.distanciaTrechoM !== null ? ` · +${formatarDistancia(p.distanciaTrechoM)}` : ''}
          </p>
          {p.precisao === 'aproximada' ? (
            <p className="m-0 text-xs text-warning">Posição aproximada: confira o endereço.</p>
          ) : null}
          {p.situacao === 'pulada' ? (
            <p className="m-0 text-xs text-ink-muted">Pulada: {p.motivoPulo}</p>
          ) : null}
        </div>
        {p.situacao !== 'pendente' ? (
          <Badge tone={p.situacao === 'visitada' ? 'success' : 'outline'}>
            {p.situacao === 'visitada' ? 'Visitada' : 'Pulada'}
          </Badge>
        ) : null}
      </div>
      {p.situacao === 'pendente' && (destaque || podeExecutar) ? (
        <div className="flex flex-wrap gap-2 pl-10">
          {comPosicao(p) ? (
            <a
              href={linkDoWaze({
                latitude: p.latitude as number,
                longitude: p.longitude as number,
              })}
              target="_blank"
              rel="noreferrer"
              className={classeDoBotao}
            >
              <Navigation size={16} aria-hidden="true" /> Navegar
            </a>
          ) : null}
          {ligar ? (
            <a href={ligar} className={classeDoBotao}>
              <Phone size={16} aria-hidden="true" /> Ligar
            </a>
          ) : null}
          {podeExecutar ? (
            <>
              <BotaoDeVisita empresa={{ id: p.empresaId, nome: p.empresaNome }} compacto />
              <Button size="sm" variant="ghost" icon={SkipForward} onClick={aoPular}>
                Pular
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

/**
 * A rota (G4b): a próxima parada em destaque (Navegar pelo Waze · Check-in · Pular), a lista com a situação de
 * cada parada, o Google Maps em trechos, "Levar para offline" e "Encerrar rota". O check-in é o do G3: a visita
 * se liga à parada sozinha e, ao concluir o relatório, a parada fica visitada.
 */
export function TelaDaRota() {
  const { rotaId } = rotaDaTela.useParams()
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [pulando, setPulando] = useState<ParadaDaRota | null>(null)
  const [motivo, setMotivo] = useState('')
  const [encerrando, setEncerrando] = useState(false)
  const [navegarAberto, setNavegarAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)

  const rota = useQuery({
    // chave própria: o editor do mapa guarda a rota em ['rotas', 'rota', id] num formato diferente (sem `doAparelho`)
    queryKey: ['rotas', 'execucao', rotaId],
    networkMode: 'always',
    retry: false,
    queryFn: async () => {
      const r = await servicos.rotas.obter(rotaId)
      if (r.ok) {
        // a rota levada para o offline se mantém atualizada no aparelho
        if (await rotaOffline(rotaId).catch(() => null)) {
          await guardarRotaOffline(r.dados).catch(() => undefined)
        }
        return { rota: r.dados, doAparelho: false }
      }
      const local = await rotaOffline(rotaId).catch(() => null)
      if (local && r.erro.status === 0) return { rota: local, doAparelho: true }
      throw new Error(r.erro.mensagem)
    },
  })

  const atualizar = (r: Rota) => {
    queryClient.setQueryData(['rotas', 'execucao', rotaId], { rota: r, doAparelho: false })
    queryClient.setQueryData(['rotas', 'rota', rotaId], r)
    void queryClient.invalidateQueries({ queryKey: ['rotas', 'lista'] })
    void queryClient.invalidateQueries({ queryKey: ['rotas', 'hoje'] })
  }

  async function pular() {
    if (!pulando) return
    setOcupado(true)
    const r = await servicos.rotas.pular(rotaId, pulando.id, motivo)
    setOcupado(false)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    atualizar(r.dados)
    setPulando(null)
    setMotivo('')
  }

  async function encerrar() {
    setOcupado(true)
    const r = await servicos.rotas.encerrar(rotaId)
    setOcupado(false)
    setEncerrando(false)
    if (!r.ok) return void toast.error(r.erro.mensagem)
    atualizar(r.dados)
    toast.success('Rota encerrada')
  }

  async function levarParaOffline(r: Rota) {
    setOcupado(true)
    try {
      const pacote = await servicos.visitas.campo.offline(r.paradas.map((p) => p.empresaId))
      if (!pacote.ok) throw new Error(pacote.erro.mensagem)
      await guardarEmpresas(pacote.dados.empresas)
      await guardarRotaOffline(r)
      toast.success('Rota guardada no aparelho', {
        description: 'Vale por 7 dias. Sem sinal, o check-in e o relatório entram na fila.',
      })
    } catch (e) {
      toast.error('Não foi possível levar a rota para o offline', {
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setOcupado(false)
    }
  }

  if (rota.isPending) {
    return (
      <main className="flex flex-col gap-4 p-6 max-md:p-4">
        <Skeleton lines={6} />
      </main>
    )
  }
  if (rota.isError) {
    return (
      <main className="flex flex-col gap-4 p-6 max-md:p-4">
        <Alert tone="danger">Não consegui abrir a rota. {rota.error.message}</Alert>
      </main>
    )
  }
  const { rota: r, doAparelho } = rota.data
  const aberta = r.situacao === 'planejada' || r.situacao === 'em_andamento'
  const podeExecutar = r.podeEditar && aberta && !doAparelho
  const proxima = r.paradas.find((p) => p.situacao === 'pendente')
  const pendentes = r.paradas.filter((p) => p.situacao === 'pendente' && comPosicao(p))
  const inicio = r.pontoPartida
    ? { latitude: r.pontoPartida.latitude, longitude: r.pontoPartida.longitude }
    : null
  const visitadas = r.paradas.filter((p) => p.situacao === 'visitada').length
  const puladas = r.paradas.filter((p) => p.situacao === 'pulada').length

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-4 p-6 max-md:p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-semibold text-ink-subtle">{codigoDaRota(r.codigo)}</p>
          <h1 className="m-0 text-[26px] leading-8 font-semibold max-md:text-[22px]">{r.nome}</h1>
          <p className="m-0 text-sm text-ink-muted">
            {r.data.split('-').reverse().join('/')} · {r.responsavel.nome}
          </p>
        </div>
        <Badge tone={TOM_DA_SITUACAO[r.situacao]}>{ROTULO_DA_SITUACAO_DE_ROTA[r.situacao]}</Badge>
      </div>
      {doAparelho ? (
        <Alert tone="warning">
          Sem sinal: esta é a rota guardada no aparelho. O check-in e o relatório entram na fila e
          sobem quando a conexão voltar.
        </Alert>
      ) : null}
      <dl className="m-0 grid grid-cols-3 gap-2 max-md:grid-cols-2">
        <div className="rounded-md bg-surface-sunken px-3 py-2">
          <dt className="text-xs text-ink-muted">Visitadas</dt>
          <dd className="m-0 text-lg font-semibold tabular-nums">
            {visitadas} de {r.paradas.length}
            {puladas ? <span className="text-sm font-normal"> · {puladas} puladas</span> : null}
          </dd>
        </div>
        <div className="rounded-md bg-surface-sunken px-3 py-2">
          <dt className="text-xs text-ink-muted">
            Distância{r.estimativa === 'linha_reta' ? ' (linha reta)' : ''}
          </dt>
          <dd className="m-0 text-lg font-semibold tabular-nums">
            {formatarDistancia(r.distanciaM)}
          </dd>
        </div>
        <div className="rounded-md bg-surface-sunken px-3 py-2">
          <dt className="text-xs text-ink-muted">Tempo com {r.minutosPorVisita} min por visita</dt>
          <dd className="m-0 text-lg font-semibold tabular-nums">
            {formatarDuracao(duracaoTotalS(r.duracaoS, r.paradas.length, r.minutosPorVisita))}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={Navigation}
          disabled={pendentes.length === 0}
          onClick={() => setNavegarAberto(true)}
        >
          Google Maps
        </Button>
        {!doAparelho ? (
          <Button icon={CloudDownload} loading={ocupado} onClick={() => void levarParaOffline(r)}>
            Levar para offline
          </Button>
        ) : null}
        <Link to="/mapa" search={{ rota: r.id }} className={classeDoBotao}>
          <MapaIcone size={16} aria-hidden="true" />{' '}
          {r.podeEditar && aberta ? 'Editar no mapa' : 'Ver no mapa'}
        </Link>
        {podeExecutar ? (
          <Button variant="ghost" icon={SquareCheck} onClick={() => setEncerrando(true)}>
            Encerrar rota
          </Button>
        ) : null}
      </div>
      <ol
        aria-label="Paradas"
        className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0"
      >
        {r.paradas.map((p) => (
          <Parada
            key={p.id}
            p={p}
            destaque={p.id === proxima?.id && aberta}
            podeExecutar={podeExecutar}
            aoPular={() => setPulando(p)}
          />
        ))}
      </ol>

      <LinksDeNavegacao
        aberto={navegarAberto}
        aoFechar={() => setNavegarAberto(false)}
        origem={null}
        paradas={pendentes.map((p) => ({
          latitude: p.latitude as number,
          longitude: p.longitude as number,
        }))}
        voltarPara={r.voltarAoInicio ? inicio : null}
      />
      <Dialog
        open={pulando !== null}
        onOpenChange={(v) => (v ? undefined : setPulando(null))}
        title={`Pular ${pulando?.empresaNome ?? 'a parada'}`}
        description="A parada fica marcada como pulada, com o motivo."
        footer={
          <>
            <Button onClick={() => setPulando(null)}>Voltar</Button>
            <Button
              variant="primary"
              disabled={motivo.trim() === ''}
              loading={ocupado}
              onClick={() => void pular()}
            >
              Pular parada
            </Button>
          </>
        }
      >
        <TextField
          label="Motivo"
          value={motivo}
          maxLength={200}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ex.: fechada, sem tempo, responsável ausente"
          required
        />
      </Dialog>
      <Dialog
        open={encerrando}
        onOpenChange={setEncerrando}
        title="Encerrar a rota?"
        description="As paradas ainda pendentes ficam como puladas (motivo: rota encerrada)."
        footer={
          <>
            <Button onClick={() => setEncerrando(false)}>Voltar</Button>
            <Button variant="primary" loading={ocupado} onClick={() => void encerrar()}>
              Encerrar rota
            </Button>
          </>
        }
      />
    </main>
  )
}

import type { LoteGeo, PreviaDoLoteGeo, RegiaoGeo } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Play, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select } from '@/components/ui/campos'
import { Badge, type TomDoBadge } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'

import { chaveDoResumo } from './consultas'
import { ROTULO_DO_RESULTADO } from './rotulos'

const SITUACAO: Record<LoteGeo['situacao'], { rotulo: string; tom: TomDoBadge }> = {
  em_andamento: { rotulo: 'Em andamento', tom: 'accent' },
  concluido: { rotulo: 'Concluído', tom: 'success' },
  falhou: { rotulo: 'Parou', tom: 'danger' },
  cancelado: { rotulo: 'Cancelado', tom: 'warning' },
}

const dataHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

/** "Geocodificar em lote": escolhe a cidade ou a região, vê o total e quantas já têm coordenada, e inicia. */
export function NovoLote({ regioes }: { regioes: RegiaoGeo[] }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [tipo, setTipo] = useState<'municipio' | 'regiao'>('municipio')
  const [escolha, setEscolha] = useState('')
  const [refazer, setRefazer] = useState(false)
  const [previa, setPrevia] = useState<PreviaDoLoteGeo | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [iniciando, setIniciando] = useState(false)
  const [erro, setErro] = useState<string>()

  const cidades = useMemo(() => {
    const porCodigo = new Map<number, string>()
    for (const r of regioes) {
      for (const m of r.municipios) porCodigo.set(m.codigoIbge, m.nome)
    }
    return [...porCodigo].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [regioes])

  const opcoes =
    tipo === 'municipio'
      ? cidades.map(([codigo, nome]) => ({ value: String(codigo), label: nome }))
      : regioes.map((r) => ({
          value: r.id,
          label: r.tipo === 'microrregiao' ? `${r.nome} (microrregião)` : r.nome,
        }))

  const escopo = { tipo, id: escolha }

  async function verPrevia() {
    setErro(undefined)
    setCarregando(true)
    const r = await servicos.geolocalizacao.lotes.previa(escopo)
    setCarregando(false)
    if (!r.ok) {
      setPrevia(null)
      setErro(r.erro.mensagem)
      return
    }
    setPrevia(r.dados)
  }

  async function iniciar() {
    setIniciando(true)
    setErro(undefined)
    const r = await servicos.geolocalizacao.lotes.criar({ escopo, refazerComCoordenada: refazer })
    setIniciando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Lote iniciado. Acompanhe a lista abaixo.')
    setPrevia(null)
    await queryClient.invalidateQueries({ queryKey: ['geolocalizacao'] })
  }

  const aProcessar = previa ? (refazer ? previa.total : previa.aProcessar) : 0

  return (
    <section
      aria-label="Geocodificar em lote"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <h2 className="m-0 text-[15px] leading-5 font-semibold">Geocodificar em lote</h2>
      <div className="grid grid-cols-[180px_1fr] gap-3 max-md:grid-cols-1">
        <Select
          label="Por"
          value={tipo}
          options={[
            { value: 'municipio', label: 'Cidade' },
            { value: 'regiao', label: 'Região' },
          ]}
          onChange={(e) => {
            setTipo(e.target.value as 'municipio' | 'regiao')
            setEscolha('')
            setPrevia(null)
          }}
        />
        <Select
          label={tipo === 'municipio' ? 'Cidade' : 'Região'}
          value={escolha}
          placeholder="Escolha"
          options={opcoes}
          onChange={(e) => {
            setEscolha(e.target.value)
            setPrevia(null)
          }}
        />
      </div>
      <Checkbox
        checked={refazer}
        onChange={(e) => setRefazer(e.target.checked)}
        label="Refazer também as empresas que já têm coordenada"
        description="A posição ajustada à mão nunca muda."
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={!escolha} loading={carregando} onClick={() => void verPrevia()}>
          Ver quantas são
        </Button>
        {previa ? (
          <Button
            variant="primary"
            icon={Play}
            loading={iniciando}
            disabled={aProcessar === 0}
            onClick={() => void iniciar()}
          >
            Iniciar o lote
          </Button>
        ) : null}
      </div>
      {previa ? (
        <p className="m-0 text-sm" aria-live="polite">
          <strong>{previa.escopo}</strong> ({previa.municipios}{' '}
          {previa.municipios === 1 ? 'cidade' : 'cidades'}): {previa.total.toLocaleString('pt-BR')}{' '}
          empresas, <strong>{previa.comCoordenada.toLocaleString('pt-BR')}</strong> já têm
          coordenada. O lote vai fazer <strong>{aProcessar.toLocaleString('pt-BR')}</strong>
          {previa.ajustadasAMao > 0
            ? ` (${previa.ajustadasAMao} ajustadas à mão ficam como estão)`
            : ''}
          .
        </p>
      ) : null}
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
    </section>
  )
}

function Progresso({ lote }: { lote: LoteGeo }) {
  const pct =
    lote.totalEmpresas === 0 ? 0 : Math.round((100 * lote.processadas) / lote.totalEmpresas)
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label={`Progresso do lote ${lote.nome}`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
      >
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-ink-muted tabular-nums">
        {lote.processadas.toLocaleString('pt-BR')} de {lote.totalEmpresas.toLocaleString('pt-BR')} (
        {pct}%)
      </span>
    </div>
  )
}

/** Os lotes (do mais novo ao mais antigo) com progresso ao vivo, o relatório por resultado e cancelar/retomar. */
export function ListaDeLotes() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const lotes = useQuery({
    queryKey: ['geolocalizacao', 'lotes'],
    retry: false,
    // Enquanto algum lote anda, atualiza a cada 3 s (e o resumo junto)
    refetchInterval: (q) =>
      q.state.data?.itens.some((l) => l.situacao === 'em_andamento') ? 3000 : false,
    queryFn: async () => {
      const r = await servicos.geolocalizacao.lotes.listar(1, 10)
      if (!r.ok) throw new Error(r.erro.mensagem)
      void queryClient.invalidateQueries({ queryKey: chaveDoResumo })
      return r.dados
    },
  })
  const [ocupado, setOcupado] = useState<string | null>(null)

  async function agir(id: string, acao: 'cancelar' | 'retomar') {
    setOcupado(id)
    const r = await servicos.geolocalizacao.lotes[acao](id)
    setOcupado(null)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      return
    }
    await queryClient.invalidateQueries({ queryKey: ['geolocalizacao'] })
  }

  if (lotes.isPending) return <Skeleton className="h-24 w-full" />
  if (lotes.isError) return <Alert tone="danger">Não consegui carregar os lotes.</Alert>
  if (lotes.data.itens.length === 0) {
    return (
      <EmptyState
        title="Nenhum lote ainda"
        description="Escolha uma cidade ou região acima para geocodificar as empresas de uma vez."
      />
    )
  }
  return (
    <ul aria-label="Lotes de geocodificação" className="m-0 flex list-none flex-col gap-3 p-0">
      {lotes.data.itens.map((l) => {
        const s = SITUACAO[l.situacao]
        return (
          <li
            key={l.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">{l.nome}</strong>
              <Badge tone={s.tom}>{s.rotulo}</Badge>
              <span className="text-xs text-ink-muted">
                {dataHora(l.iniciadoEm)}
                {l.concluidoEm ? ` até ${dataHora(l.concluidoEm)}` : ''}
              </span>
              <span className="flex-1" />
              {l.situacao === 'em_andamento' ? (
                <Button
                  size="sm"
                  icon={Ban}
                  loading={ocupado === l.id}
                  onClick={() => void agir(l.id, 'cancelar')}
                >
                  Cancelar
                </Button>
              ) : null}
              {l.situacao === 'cancelado' || l.situacao === 'falhou' ? (
                <Button
                  size="sm"
                  icon={RotateCcw}
                  loading={ocupado === l.id}
                  onClick={() => void agir(l.id, 'retomar')}
                >
                  Retomar
                </Button>
              ) : null}
            </div>
            <Progresso lote={l} />
            {Object.keys(l.porResultado).length > 0 ? (
              <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-[13px] text-ink-muted">
                {Object.entries(l.porResultado).map(([resultado, n]) => (
                  <li key={resultado}>
                    {ROTULO_DO_RESULTADO[resultado as keyof typeof ROTULO_DO_RESULTADO] ??
                      resultado}
                    : <strong className="text-ink tabular-nums">{n.toLocaleString('pt-BR')}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

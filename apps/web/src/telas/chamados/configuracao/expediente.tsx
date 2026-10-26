import type { Expediente } from '@leadtogo/api-client'
import { DIAS_DA_SEMANA, type FaixaDeExpediente } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Switch } from '@leadtogo/ui/checkbox'
import { Badge } from '@leadtogo/ui/exibicao'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'

// Segunda a domingo, na ordem em que se lê (o índice 0 do expediente é o domingo)
const ORDEM_DOS_DIAS = [1, 2, 3, 4, 5, 6, 0] as const

const dataBr = (iso: string, recorrente: boolean) => {
  const [a, m, d] = iso.split('-')
  return recorrente ? `${d}/${m} (todo ano)` : `${d}/${m}/${a}`
}

function Faixas({ expediente }: { expediente: Expediente }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [faixas, setFaixas] = useState<FaixaDeExpediente[]>(() =>
    expediente.faixas.map((f) => ({ ...f })),
  )
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const alterar = (i: number, patch: Partial<FaixaDeExpediente>) =>
    setFaixas(faixas.map((f, j) => (j === i ? { ...f, ...patch } : f)))

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    const r = await servicos.chamados.expediente.definir({ faixas })
    setSalvando(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success('Expediente salvo')
    void queryClient.invalidateQueries({ queryKey: ['chamados'] })
  }

  return (
    <section aria-label="Expediente" className="flex flex-col gap-3">
      <p className="m-0 text-sm text-ink-muted">
        As metas de resposta e de resolução contam só dentro destes horários (fuso{' '}
        {expediente.fusoHorario}), sem os feriados. Um dia pode ter várias faixas (ex.: com a pausa
        do almoço). Sem nenhuma faixa, as metas deixam de contar prazo.
      </p>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0">
        {ORDEM_DOS_DIAS.map((dia) => {
          const doDia = faixas.map((f, i) => ({ f, i })).filter(({ f }) => f.diaSemana === dia)
          return (
            <li
              key={dia}
              aria-label={DIAS_DA_SEMANA[dia]}
              className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 last:border-b-0"
            >
              <span className="w-32 text-sm font-semibold">{DIAS_DA_SEMANA[dia]}</span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {doDia.length === 0 ? (
                  <span className="text-sm text-ink-muted">Sem expediente</span>
                ) : null}
                {doDia.map(({ f, i }) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <input
                      type="time"
                      aria-label={`${DIAS_DA_SEMANA[dia]}: início`}
                      value={f.inicio}
                      onChange={(e) => alterar(i, { inicio: e.target.value })}
                      className="h-(--ctl) rounded-sm border border-border-strong bg-surface px-2"
                    />
                    <span aria-hidden="true">às</span>
                    <input
                      type="time"
                      aria-label={`${DIAS_DA_SEMANA[dia]}: fim`}
                      value={f.fim}
                      onChange={(e) => alterar(i, { fim: e.target.value })}
                      className="h-(--ctl) rounded-sm border border-border-strong bg-surface px-2"
                    />
                    <button
                      type="button"
                      aria-label={`Tirar a faixa de ${DIAS_DA_SEMANA[dia]}`}
                      className="cursor-pointer border-0 bg-transparent p-1 text-ink-muted hover:text-ink"
                      onClick={() => setFaixas(faixas.filter((_, j) => j !== i))}
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                icon={Plus}
                aria-label={`Acrescentar faixa em ${DIAS_DA_SEMANA[dia]}`}
                onClick={() =>
                  setFaixas([...faixas, { diaSemana: dia, inicio: '08:00', fim: '18:00' }])
                }
              >
                Faixa
              </Button>
            </li>
          )
        })}
      </ul>
      <div>
        <Button variant="primary" loading={salvando} onClick={() => void salvar()}>
          Salvar expediente
        </Button>
      </div>
    </section>
  )
}

function Feriados({ expediente }: { expediente: Expediente }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [data, setData] = useState('')
  const [nome, setNome] = useState('')
  const [recorrente, setRecorrente] = useState(false)
  const [ano, setAno] = useState(String(new Date().getFullYear()))
  const [erro, setErro] = useState<string | null>(null)
  const atualizar = () =>
    void queryClient.invalidateQueries({ queryKey: ['chamados', 'expediente'] })

  const acrescentar = async () => {
    setErro(null)
    const r = await servicos.chamados.expediente.criarFeriado({
      data,
      nome: nome.trim(),
      recorrente,
    })
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setData('')
    setNome('')
    setRecorrente(false)
    atualizar()
  }
  const excluir = async (id: string) => {
    setErro(null)
    const r = await servicos.chamados.expediente.excluirFeriado(id)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    atualizar()
  }
  const gerar = async () => {
    setErro(null)
    const r = await servicos.chamados.expediente.gerarFeriados(Number(ano))
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    toast.success(
      r.dados.criados === 0
        ? 'Os feriados móveis desse ano já estavam cadastrados'
        : `${r.dados.criados} feriados acrescentados`,
    )
    atualizar()
  }

  return (
    <section aria-label="Feriados" className="flex flex-col gap-3">
      <h3 className="m-0 flex items-center gap-2 text-base font-semibold">
        <CalendarDays size={16} aria-hidden="true" /> Feriados
      </h3>
      {erro ? <Alert tone="danger">{erro}</Alert> : null}
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Data"
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
        />
        <TextField
          label="Nome"
          value={nome}
          maxLength={80}
          onChange={(e) => setNome(e.target.value)}
          className="min-w-[200px]"
        />
        <Switch
          label="Todo ano"
          checked={recorrente}
          onChange={(e) => setRecorrente(e.target.checked)}
        />
        <Button icon={Plus} disabled={!data || !nome.trim()} onClick={() => void acrescentar()}>
          Acrescentar feriado
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Ano"
          inputMode="numeric"
          value={ano}
          onChange={(e) => setAno(e.target.value)}
          hint="Carnaval, Sexta-feira Santa e Corpus Christi mudam a cada ano."
        />
        <Button disabled={!/^\d{4}$/.test(ano)} onClick={() => void gerar()}>
          Gerar feriados móveis do ano
        </Button>
      </div>
      <ul
        aria-label="Feriados cadastrados"
        className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0"
      >
        {expediente.feriados.map((f) => (
          <li
            key={f.id}
            className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0"
          >
            <span className="w-36 tabular-nums">{dataBr(f.data, f.recorrente)}</span>
            <span className="flex-1">{f.nome}</span>
            {f.recorrente ? <Badge tone="info">Todo ano</Badge> : null}
            <Button
              size="sm"
              variant="danger-ghost"
              icon={Trash2}
              aria-label={`Excluir o feriado ${f.nome}`}
              onClick={() => void excluir(f.id)}
            >
              Excluir
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Configurações → Chamados → Expediente e feriados (`chamados.gerir_areas`). */
export function ExpedienteDosChamados() {
  const servicos = useServicos()
  const consulta = useQuery({
    queryKey: ['chamados', 'expediente'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.chamados.expediente.ver()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (consulta.isPending) return <Skeleton lines={6} />
  if (consulta.isError)
    return <Alert tone="danger">Não consegui carregar o expediente. {consulta.error.message}</Alert>
  return (
    <div className="flex flex-col gap-6">
      <Faixas key={JSON.stringify(consulta.data.faixas)} expediente={consulta.data} />
      <Feriados expediente={consulta.data} />
    </div>
  )
}

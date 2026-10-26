import type { Oportunidade } from '@leadtogo/api-client'
import { exigeMotivo, ROTULO_DO_STATUS, type StatusDeFechamento } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Button } from '@leadtogo/ui/button'
import { Select, TextArea, TextField } from '@leadtogo/ui/campos'
import { Switch } from '@leadtogo/ui/checkbox'
import { Alert } from '@leadtogo/ui/feedback'
import { SegmentedControl } from '@leadtogo/ui/segmented-control'
import { Janela } from '@/telas/cadastros/base'

import { hojeEmTexto, reais } from './formatos'

const OPCOES: { value: StatusDeFechamento; label: string }[] = [
  { value: 'conquistado', label: ROTULO_DO_STATUS.conquistado },
  { value: 'perdido', label: ROTULO_DO_STATUS.perdido },
  { value: 'cancelado', label: ROTULO_DO_STATUS.cancelado },
  { value: 'suspenso', label: ROTULO_DO_STATUS.suspenso },
]
const VERBO: Record<StatusDeFechamento, string> = {
  conquistado: 'Marcar como conquistada',
  perdido: 'Marcar como perdida',
  cancelado: 'Marcar como cancelada',
  suspenso: 'Suspender oportunidade',
}

export interface DadosDoFechamento {
  status: StatusDeFechamento
  motivoId?: string
  detalhe?: string
  retomarEm?: string
  empresaViraCliente?: boolean
}

/**
 * "Fechar oportunidade": Conquistada, Perdida, Cancelada ou Suspensa. Perdida, Cancelada e Suspensa pedem o
 * motivo (da lista do status); Suspensa pede "retomar em" (cria a atividade de retomada); Conquistada mostra
 * o valor e o interruptor "Mudar o Status da empresa para Cliente", que já vem como a empresa configurou.
 */
export function JanelaDeFechamento({
  oportunidade: o,
  statusInicial,
  aoFechar,
  aoConfirmar,
}: {
  oportunidade: Oportunidade
  statusInicial: StatusDeFechamento
  aoFechar: () => void
  /** Devolve a mensagem de erro, ou nada se deu certo */
  aoConfirmar: (dados: DadosDoFechamento) => Promise<string | undefined>
}) {
  const servicos = useServicos()
  const [status, setStatus] = useState<StatusDeFechamento>(statusInicial)
  const [motivoId, setMotivoId] = useState('')
  const [detalhe, setDetalhe] = useState('')
  const [retomarEm, setRetomarEm] = useState('')
  const [viraCliente, setViraCliente] = useState(o.empresaViraClientePadrao)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string>()
  const [enviando, setEnviando] = useState(false)

  const motivos = useQuery({
    queryKey: ['cadastros', 'motivos'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.cadastros.motivos.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const doStatus = (motivos.data ?? []).filter(
    (m) => m.ativo && (m.aplicaA as string[]).includes(status),
  )

  const enviar = async () => {
    const e: Record<string, string> = {}
    if (exigeMotivo(status) && motivoId === '') e['motivo'] = 'Escolha o motivo.'
    if (status === 'suspenso') {
      if (retomarEm === '') e['retomarEm'] = 'Informe quando retomar.'
      else if (retomarEm < hojeEmTexto()) e['retomarEm'] = 'A data não pode ser no passado.'
    }
    setErros(e)
    setErroGeral(undefined)
    if (Object.keys(e).length > 0) return
    setEnviando(true)
    const mensagem = await aoConfirmar({
      status,
      ...(exigeMotivo(status) ? { motivoId } : {}),
      ...(detalhe.trim() !== '' ? { detalhe: detalhe.trim() } : {}),
      ...(status === 'suspenso' ? { retomarEm } : {}),
      ...(status === 'conquistado' ? { empresaViraCliente: viraCliente } : {}),
    })
    setEnviando(false)
    if (mensagem) setErroGeral(mensagem)
  }

  return (
    <Janela
      open
      onOpenChange={(aberto) => {
        if (!aberto && !enviando) aoFechar()
      }}
      title="Fechar oportunidade"
      description={`${o.titulo} · ${o.empresa.nome}`}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button
            variant={
              status === 'conquistado' ? 'primary' : status === 'perdido' ? 'danger' : 'secondary'
            }
            loading={enviando}
            onClick={() => void enviar()}
          >
            {VERBO[status]}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erroGeral ? <Alert tone="danger">{erroGeral}</Alert> : null}
        <SegmentedControl
          label="Como a oportunidade termina"
          options={OPCOES}
          value={status}
          onChange={(v) => {
            setStatus(v as StatusDeFechamento)
            setMotivoId('')
            setErros({})
          }}
        />
        {status === 'conquistado' ? (
          <>
            <p className="m-0 text-sm">
              Valor total <strong>{reais(o.valorTotal)}</strong>
              {o.valorMensal > 0 ? (
                <>
                  {' '}
                  · <strong>{reais(o.valorMensal)}</strong> por mês
                </>
              ) : null}
              .
            </p>
            <Switch
              label="Mudar o Status da empresa para Cliente"
              checked={viraCliente}
              onChange={(e) => setViraCliente(e.target.checked)}
            />
          </>
        ) : (
          <Select
            label="Motivo"
            required
            placeholder="Escolha o motivo"
            options={doStatus.map((m) => ({ value: m.id, label: m.nome }))}
            value={motivoId}
            onChange={(e) => setMotivoId(e.target.value)}
            {...(erros['motivo'] ? { error: erros['motivo'] } : {})}
          />
        )}
        {status === 'suspenso' ? (
          <TextField
            label="Retomar em"
            required
            type="date"
            min={hojeEmTexto()}
            hint="Nesse dia, uma tarefa de retomada aparece na sua agenda."
            value={retomarEm}
            onChange={(e) => setRetomarEm(e.target.value)}
            {...(erros['retomarEm'] ? { error: erros['retomarEm'] } : {})}
          />
        ) : null}
        <TextArea
          label="Detalhe"
          rows={2}
          value={detalhe}
          onChange={(e) => setDetalhe(e.target.value)}
        />
        <p className="m-0 text-[13px] text-ink-muted">
          Fica registrado que a oportunidade parou na fase <strong>{o.fase.nome}</strong>.
        </p>
      </div>
    </Janela>
  )
}

import type { EventoDoPortal } from '@leadtogo/api-client'
import { Download, ExternalLink, MapPin } from 'lucide-react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@leadtogo/ui/button'
import { Badge } from '@leadtogo/ui/exibicao'
import { Markdown } from '@leadtogo/ui/markdown'
import { toast } from '@leadtogo/ui/toast'

import { resumoDoEvento } from '@/casca/eventos'
import { dataEHora, diaEMes, diaPorExtenso, periodoDoEvento } from '@/casca/rotulos'
import { useServicos } from '@/servicos/contexto'

function Vagas({ e }: { e: EventoDoPortal }) {
  const partes: string[] = []
  if (e.vagasRestantes !== null) {
    partes.push(
      e.vagasRestantes === 0
        ? 'Sem vagas'
        : `${e.vagasRestantes} ${e.vagasRestantes === 1 ? 'vaga restante' : 'vagas restantes'}`,
    )
  }
  if (e.vagasDaEmpresa.limite !== null) {
    partes.push(
      `Vagas da sua empresa: ${e.vagasDaEmpresa.confirmados} de ${e.vagasDaEmpresa.limite}`,
    )
  }
  if (e.prazoConfirmacao && e.minhaSituacao === 'nenhuma' && !e.cancelado) {
    partes.push(`Confirme até ${dataEHora(e.prazoConfirmacao)}`)
  }
  if (partes.length === 0) return null
  return <p className="m-0 text-[13px] text-ink-muted">{partes.join(' · ')}</p>
}

/** Um evento da agenda: data, local, vagas, a situação do cliente e as ações (confirmar, cancelar, .ics). */
export function CartaoDeEvento({ e }: { e: EventoDoPortal }) {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const [ocupado, setOcupado] = useState(false)
  const dm = diaEMes(e.inicioEm)

  async function agir(acao: 'confirmar' | 'cancelar') {
    setOcupado(true)
    const r =
      acao === 'confirmar'
        ? await servicos.eventos.confirmar(e.id)
        : await servicos.eventos.cancelar(e.id)
    setOcupado(false)
    if (!r.ok) {
      toast.error(r.erro.mensagem)
      void queryClient.invalidateQueries({ queryKey: ['eventos'] })
      return
    }
    toast.success(
      acao === 'cancelar'
        ? 'Presença cancelada'
        : r.dados.minhaSituacao === 'lista_espera'
          ? 'Você entrou na lista de espera. Avisamos se abrir uma vaga.'
          : 'Presença confirmada',
    )
    void queryClient.invalidateQueries({ queryKey: ['eventos'] })
  }

  return (
    <article aria-label={e.titulo} className="rounded-md border border-border bg-surface p-4">
      <div className="flex gap-4">
        <div
          aria-hidden="true"
          className="flex size-14 flex-none flex-col items-center justify-center rounded-md bg-surface-sunken"
        >
          <span className="text-[11px] leading-4 font-semibold text-ink-muted">{dm.mes}</span>
          <span className="text-xl leading-6 font-semibold">{dm.dia}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-start gap-2">
            <h2 className="m-0 min-w-0 flex-1 text-base leading-6 font-semibold">{e.titulo}</h2>
            <Badge
              tone={
                e.cancelado
                  ? 'danger'
                  : e.minhaSituacao === 'confirmado'
                    ? 'success'
                    : e.minhaSituacao === 'lista_espera'
                      ? 'warning'
                      : 'neutral'
              }
            >
              {resumoDoEvento(e)}
            </Badge>
          </div>
          <p className="m-0 text-sm text-ink-muted">
            {diaPorExtenso(e.inicioEm)} · {periodoDoEvento(e.inicioEm, e.fimEm)}
          </p>
          {e.local ? (
            <p className="m-0 inline-flex items-center gap-1 text-sm text-ink-muted">
              <MapPin size={14} aria-hidden="true" /> {e.local}
            </p>
          ) : null}
          {e.linkOnline ? (
            <a
              href={e.linkOnline}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand"
            >
              <ExternalLink size={14} aria-hidden="true" /> Participar online
            </a>
          ) : null}
          {e.descricao ? <Markdown texto={e.descricao} /> : null}
          <Vagas e={e} />
          {e.cancelado ? (
            <p className="m-0 text-sm text-danger">Este evento foi cancelado pela equipe.</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {e.podeConfirmar ? (
              <Button variant="primary" loading={ocupado} onClick={() => void agir('confirmar')}>
                {e.lotado ||
                (e.vagasDaEmpresa.limite !== null &&
                  e.vagasDaEmpresa.confirmados >= e.vagasDaEmpresa.limite)
                  ? 'Entrar na lista de espera'
                  : 'Confirmar presença'}
              </Button>
            ) : null}
            {e.podeCancelar ? (
              <Button loading={ocupado} onClick={() => void agir('cancelar')}>
                {e.minhaSituacao === 'lista_espera'
                  ? 'Sair da lista de espera'
                  : 'Cancelar presença'}
              </Button>
            ) : null}
            <a
              href={`/v1/portal/eventos/${e.id}/ics`}
              download
              className="inline-flex items-center gap-1 text-sm font-medium text-brand"
            >
              <Download size={14} aria-hidden="true" /> Adicionar à agenda
            </a>
          </div>
        </div>
      </div>
    </article>
  )
}

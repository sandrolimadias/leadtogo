import type { Respostas } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { FormularioDinamico } from '@leadtogo/ui/formulario'

import { Centralizado } from '@/components/centralizado'
import { comoResultadoDoEnvio } from '@/casca/resultado-do-envio'
import { useServicos } from '@/servicos/contexto'

/** Avaliação do evento pelo link pessoal do e-mail (Fase 4G): para quem esteve presente sem acesso ao portal. */
export function TelaDeAvaliacaoPorLink({ token }: { token: string }) {
  const servicos = useServicos()
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const f = useQuery({
    queryKey: ['avaliacao-por-link', token],
    retry: false,
    queryFn: async () => {
      const r = await servicos.avaliacaoPorLink.abrir(token)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  if (f.isError) {
    return (
      <Centralizado titulo="Avaliação do evento">
        <Alert tone="info">{f.error.message}</Alert>
      </Centralizado>
    )
  }
  if (!f.data) {
    return (
      <Centralizado titulo="Avaliação do evento">
        <Skeleton lines={4} />
      </Centralizado>
    )
  }
  const dados = f.data
  const enviar = async (botao: string, respostas: Respostas) => {
    setEnviando(true)
    const r = await servicos.avaliacaoPorLink.responder(token, {
      versao: dados.versao,
      botao,
      respostas,
    })
    setEnviando(false)
    if (r.ok) setEnviado(true)
    return comoResultadoDoEnvio(r)
  }
  return (
    <main className="min-h-dvh overflow-y-auto bg-bg px-4 py-8">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 rounded-lg border border-border bg-surface p-6 shadow-sm">
        <p className="m-0 text-xs text-ink-muted">Avaliação do evento</p>
        <h1 className="m-0 text-2xl leading-8 font-semibold">{dados.evento}</h1>
        {enviado ? (
          <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={40} className="text-success" aria-hidden="true" />
            <p className="m-0 text-base">Avaliação enviada. Obrigado por participar!</p>
          </div>
        ) : (
          <FormularioDinamico definicao={dados.definicao} enviando={enviando} aoEnviar={enviar} />
        )}
      </div>
    </main>
  )
}

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'

import { dataEHora } from '@/casca/rotulos'
import { Centralizado } from '@/components/centralizado'
import { useServicos } from '@/servicos/contexto'

function Registrado({ nome }: { nome: string | null }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
      <CheckCircle2 size={48} className="text-success" aria-hidden="true" />
      <p className="m-0 text-lg font-semibold">Presença registrada</p>
      <p className="m-0 text-sm text-ink-muted">
        {nome ? `Bem-vindo(a), ${nome}. ` : ''}Bom evento!
      </p>
    </div>
  )
}

/**
 * Check-in pelo QR do evento (Fase 4G, B-18). Logado no portal: um toque. Sem login: o e-mail da inscrição e,
 * se o evento pede, o código de 6 dígitos enviado a esse e-mail.
 */
export function TelaDeCheckin({ token }: { token: string }) {
  const servicos = useServicos()
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [esperaCodigo, setEsperaCodigo] = useState(false)
  const [feito, setFeito] = useState<{ nome: string | null } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const evento = useQuery({
    queryKey: ['checkin', token],
    retry: false,
    queryFn: async () => {
      const r = await servicos.checkin.abrir(token)
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const sessao = useQuery({
    queryKey: ['checkin', 'sessao'],
    retry: false,
    queryFn: async () => {
      const r = await servicos.sessao.atual()
      return r.ok ? r.dados : null
    },
  })

  if (evento.isError) {
    return (
      <Centralizado titulo="Check-in">
        <Alert tone="danger">{evento.error.message}</Alert>
      </Centralizado>
    )
  }
  if (!evento.data || sessao.isPending) {
    return (
      <Centralizado titulo="Check-in">
        <Skeleton lines={3} />
      </Centralizado>
    )
  }
  const e = evento.data
  const descricao = `${dataEHora(e.inicioEm)}${e.local ? ` · ${e.local}` : ''}`

  const logado = async () => {
    setErro(null)
    setOcupado(true)
    const r = await servicos.checkin.logado(token)
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    setFeito({ nome: r.dados.nome })
  }
  const semLogin = async () => {
    setErro(null)
    setOcupado(true)
    const r = await servicos.checkin.semLogin(token, {
      email: email.trim(),
      ...(esperaCodigo ? { codigo: codigo.replace(/\D/g, '') } : {}),
    })
    setOcupado(false)
    if (!r.ok) {
      setErro(r.erro.mensagem)
      return
    }
    if (r.dados.situacao === 'codigo_enviado') {
      setEsperaCodigo(true)
      return
    }
    setFeito({ nome: r.dados.nome })
  }

  return (
    <Centralizado titulo={e.titulo} descricao={descricao}>
      {feito ? (
        <Registrado nome={feito.nome} />
      ) : !e.aberto ? (
        <Alert tone="info">
          O check-in abre 1 hora antes do início e fecha 1 hora depois do fim do evento.
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          {erro ? <Alert tone="danger">{erro}</Alert> : null}
          {sessao.data ? (
            <>
              <p className="m-0 text-sm">
                Você está no portal como <strong>{sessao.data.contato.nome}</strong>.
              </p>
              <Button variant="primary" loading={ocupado} onClick={() => void logado()}>
                Registrar minha presença
              </Button>
            </>
          ) : (
            <form
              className="flex flex-col gap-4"
              onSubmit={(x) => {
                x.preventDefault()
                void semLogin()
              }}
            >
              <TextField
                label="E-mail da inscrição"
                type="email"
                autoComplete="email"
                required
                disabled={esperaCodigo}
                value={email}
                onChange={(x) => setEmail(x.target.value)}
              />
              {esperaCodigo ? (
                <TextField
                  label="Código enviado ao seu e-mail"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={7}
                  value={codigo}
                  hint="Confira a caixa de entrada (e o spam). Vale por 10 minutos."
                  onChange={(x) => setCodigo(x.target.value)}
                />
              ) : e.exigeCodigo ? (
                <p className="m-0 text-xs text-ink-muted">
                  Enviaremos um código de 6 dígitos para confirmar que é você.
                </p>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                loading={ocupado}
                disabled={
                  !email.includes('@') || (esperaCodigo && codigo.replace(/\D/g, '').length !== 6)
                }
              >
                {esperaCodigo || !e.exigeCodigo ? 'Registrar presença' : 'Enviar código'}
              </Button>
            </form>
          )}
        </div>
      )}
    </Centralizado>
  )
}

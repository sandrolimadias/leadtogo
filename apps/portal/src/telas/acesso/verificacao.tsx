import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { SessaoDoPortal } from '@leadtogo/api-client'
import { toDataURL } from 'qrcode'
import { type FormEvent, useEffect, useState } from 'react'

import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert } from '@leadtogo/ui/feedback'

import { CHAVE_DA_SESSAO } from '@/app/guardas'
import { Centralizado } from '@/components/centralizado'
import { useServicos } from '@/servicos/contexto'

/** Depois de ligar ou conferir o 2FA, a sessão do cache deixa de estar pendente. */
function useLiberar() {
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  return async (sessao: SessaoDoPortal) => {
    queryClient.setQueryData(CHAVE_DA_SESSAO, {
      ...sessao,
      segundoFatorAtivo: true,
      segundoFatorPendente: false,
    })
    await navegar({ to: '/' })
  }
}

/** Conferir o código do aplicativo (ou um código de recuperação) e liberar o portal nesta sessão. */
function Conferir({ sessao }: { sessao: SessaoDoPortal }) {
  const servicos = useServicos()
  const liberar = useLiberar()
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const r = await servicos.segundoFator.conferir(codigo.trim())
    setEnviando(false)
    if (!r.ok) setErro(r.erro.mensagem)
    else await liberar(sessao)
  }
  return (
    <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-4" noValidate>
      {erro ? <Alert tone="danger" title={erro} /> : null}
      <TextField
        label="Código do aplicativo"
        hint="Os 6 números do aplicativo autenticador, ou um código de recuperação."
        autoComplete="one-time-code"
        inputMode="text"
        mono
        value={codigo}
        onChange={(e) => setCodigo(e.target.value)}
      />
      <Button
        type="submit"
        variant="primary"
        loading={enviando}
        disabled={codigo.trim().length < 6}
        block
      >
        Confirmar
      </Button>
    </form>
  )
}

/** Ligar o 2FA: QR code, primeiro código e códigos de recuperação. `aoConcluir` roda depois de a pessoa guardar os códigos. */
export function AtivarSegundoFator({ aoConcluir }: { aoConcluir: () => void | Promise<void> }) {
  const servicos = useServicos()
  const [dados, setDados] = useState<{ segredo: string; uri: string } | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [codigo, setCodigo] = useState('')
  const [codigos, setCodigos] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    void servicos.segundoFator.iniciar().then((r) => {
      if (r.ok) setDados(r.dados)
      else setErro(r.erro.mensagem)
    })
  }, [servicos])
  useEffect(() => {
    if (!dados) return
    void toDataURL(dados.uri, { margin: 1, width: 180 }).then(setQr)
  }, [dados])

  const confirmar = async (e: FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setErro(null)
    const r = await servicos.segundoFator.confirmar(codigo.trim())
    setEnviando(false)
    if (!r.ok) setErro(r.erro.mensagem)
    else setCodigos(r.dados.codigosDeRecuperacao)
  }

  if (codigos) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Verificação em duas etapas ligada" />
        <p className="m-0 text-sm leading-5">
          Guarde estes códigos de recuperação num lugar seguro. Cada um vale uma vez e só aparece
          agora.
        </p>
        <ul
          aria-label="Códigos de recuperação"
          className="m-0 grid grid-cols-2 gap-2 rounded-sm bg-surface-sunken p-3 font-mono text-sm"
        >
          {codigos.map((c) => (
            <li key={c} className="list-none">
              {c}
            </li>
          ))}
        </ul>
        <Button variant="primary" onClick={() => void aoConcluir()} block>
          Guardei os códigos, continuar
        </Button>
      </div>
    )
  }
  return (
    <form onSubmit={(e) => void confirmar(e)} className="flex flex-col gap-4" noValidate>
      {erro ? <Alert tone="danger" title={erro} /> : null}
      {dados ? (
        <>
          <p className="m-0 text-sm leading-5">
            1. Leia o QR code com um aplicativo autenticador (Google Authenticator, Authy,
            1Password…).
          </p>
          {qr ? (
            <img src={qr} alt="QR code para o aplicativo autenticador" width={180} height={180} />
          ) : null}
          <p className="m-0 text-xs leading-4 text-ink-muted">
            Sem câmera? Digite este código no aplicativo:{' '}
            <span className="font-mono">{dados.segredo}</span>
          </p>
          <TextField
            label="2. Digite o código de 6 números"
            autoComplete="one-time-code"
            inputMode="numeric"
            mono
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            loading={enviando}
            disabled={codigo.trim().length < 6}
            block
          >
            Ligar verificação
          </Button>
        </>
      ) : erro ? null : (
        <p className="m-0 text-sm text-ink-muted">Preparando…</p>
      )}
    </form>
  )
}

/** Ligar o 2FA no primeiro acesso (a empresa o exige do Responsável): ao concluir, libera o portal. */
function AtivarAoEntrar({ sessao }: { sessao: SessaoDoPortal }) {
  const liberar = useLiberar()
  return <AtivarSegundoFator aoConcluir={() => liberar(sessao)} />
}

/** A tela do 2FA: conferir (quem já ligou) ou ligar (quando a empresa exige e ainda não foi ligado). */
export function TelaVerificacao({ sessao }: { sessao: SessaoDoPortal }) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const sair = async () => {
    await servicos.sessao.sair()
    queryClient.clear()
    await navegar({ to: '/entrar' })
  }
  return (
    <Centralizado
      titulo="Verificação em duas etapas"
      descricao={
        sessao.segundoFatorAtivo
          ? 'Confirme que é você: digite o código do aplicativo autenticador.'
          : 'A sua empresa exige a verificação em duas etapas de quem é Responsável. Vamos ligá-la agora.'
      }
    >
      {sessao.segundoFatorAtivo ? <Conferir sessao={sessao} /> : <AtivarAoEntrar sessao={sessao} />}
      <div className="mt-4 text-center">
        <Button variant="ghost" size="sm" onClick={() => void sair()}>
          Sair
        </Button>
      </div>
    </Centralizado>
  )
}

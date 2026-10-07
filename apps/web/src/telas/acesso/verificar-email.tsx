import { Link } from '@tanstack/react-router'
import { CircleCheck, MailWarning } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { Cabecalho, Selo } from '@/components/acesso/layout'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Alert } from '@/components/ui/feedback'

import { classeDoLinkSuave, EMAIL_VALIDO, focarCampo, useEnvio } from './comum'

/**
 * Destino do link de confirmação (`?confirmado=1` ou `?error=...`) e tela de reenvio. A resposta do
 * reenvio é a mesma exista ou não a conta.
 */
export function TelaVerificarEmail({
  confirmado,
  erroDoLink,
  email: emailInicial,
}: {
  confirmado?: boolean | undefined
  erroDoLink?: string | undefined
  email?: string | undefined
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [email, setEmail] = useState(emailInicial ?? '')
  const [erro, setErro] = useState<string | undefined>()
  const [enviado, setEnviado] = useState(false)

  if (confirmado && !erroDoLink) {
    return (
      <div className="flex flex-col gap-5">
        <Selo>
          <CircleCheck size={22} strokeWidth={1.75} aria-hidden="true" />
        </Selo>
        <Cabecalho titulo="E-mail confirmado" descricao="Pronto. Agora é só entrar." />
        <Link to="/login" search={{ redirect: undefined }} className="contents">
          <Button variant="primary" block size="lg">
            Entrar
          </Button>
        </Link>
      </div>
    )
  }

  const reenviar = (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL_VALIDO.test(email)) {
      setErro('Informe um e-mail válido.')
      return focarCampo('verificar-email-campo')
    }
    setErro(undefined)
    void executar(async () => {
      const r = await servicos.reenviarVerificacao(email.trim())
      if (r.ok) setEnviado(true)
      else setErro(r.erro.mensagem)
    })
  }

  return (
    <form onSubmit={reenviar} noValidate className="flex flex-col gap-5">
      <Selo>
        <MailWarning size={22} strokeWidth={1.75} aria-hidden="true" />
      </Selo>
      <Cabecalho
        titulo={erroDoLink ? 'Este link não vale mais' : 'Confirme seu e-mail'}
        descricao={
          erroDoLink
            ? 'O link de confirmação vale por 1 hora. Peça um novo abaixo.'
            : 'Enviamos um link de confirmação para o seu e-mail. Ele vale por 1 hora.'
        }
      />
      {enviado ? (
        <Alert tone="success">
          Se esse e-mail tiver uma conta ainda sem confirmação, o novo link chega em instantes.
        </Alert>
      ) : null}
      <TextField
        id="verificar-email-campo"
        label="E-mail"
        type="email"
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={erro}
      />
      <Button type="submit" variant="primary" block size="lg" loading={enviando}>
        Reenviar link
      </Button>
      <Link
        to="/login"
        search={{ redirect: undefined }}
        className={`text-center text-sm ${classeDoLinkSuave}`}
      >
        Voltar ao login
      </Link>
    </form>
  )
}

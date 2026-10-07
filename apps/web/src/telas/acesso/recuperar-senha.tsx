import { Link, useNavigate } from '@tanstack/react-router'
import { Mail } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { CampoDeSenha } from '@/components/acesso/campo-de-senha'
import { Cabecalho, Selo } from '@/components/acesso/layout'
import { RegrasDeSenha, senhaForte } from '@/components/acesso/regras-de-senha'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Alert } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'

import { classeDoLink, classeDoLinkSuave, EMAIL_VALIDO, focarCampo, useEnvio } from './comum'

/** Pede o link de nova senha. A resposta é a mesma exista ou não a conta: nada revela cadastro. */
export function TelaEsqueciSenha() {
  const servicos = useServicos()
  const navegar = useNavigate()
  const { enviando, executar } = useEnvio()
  const [email, setEmail] = useState('')
  const [tentou, setTentou] = useState(false)
  const [falha, setFalha] = useState<string | undefined>()
  const erro = tentou && !EMAIL_VALIDO.test(email) ? 'Informe um e-mail válido.' : undefined

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (!EMAIL_VALIDO.test(email)) return focarCampo('recuperar-email')
    setFalha(undefined)
    void executar(async () => {
      const r = await servicos.pedirNovaSenha(email.trim())
      if (!r.ok) {
        setFalha(r.erro.mensagem)
        return
      }
      await navegar({ to: '/confira-seu-email', search: { email: email.trim() } })
    })
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <Cabecalho titulo="Recuperar senha" descricao="Enviamos um link para criar uma senha nova." />
      <TextField
        id="recuperar-email"
        label="E-mail"
        type="email"
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={erro}
      />
      {falha ? (
        <Alert tone="danger" title="Não foi possível enviar o link">
          {falha}
        </Alert>
      ) : null}
      <Button type="submit" variant="primary" block size="lg" loading={enviando}>
        Enviar link
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

export function TelaConfiraSeuEmail({ email }: { email?: string | undefined }) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [falha, setFalha] = useState<string | undefined>()

  const reenviar = () => {
    if (!email) return
    setFalha(undefined)
    void executar(async () => {
      const r = await servicos.pedirNovaSenha(email)
      if (r.ok) toast.success('Link reenviado', { description: 'Confira a caixa de entrada.' })
      else setFalha(r.erro.mensagem)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <Selo>
        <Mail size={22} strokeWidth={1.75} aria-hidden="true" />
      </Selo>
      <Cabecalho
        titulo="Confira seu e-mail"
        descricao={
          <>
            Se {email ? <b className="font-semibold text-ink">{email}</b> : 'esse e-mail'} tiver
            conta, o link chega em instantes. Ele vale por 1 hora.
          </>
        }
      />
      {falha ? (
        <Alert tone="danger" title="Não foi possível reenviar">
          {falha}
        </Alert>
      ) : null}
      {email ? (
        <Button block size="lg" loading={enviando} onClick={reenviar}>
          Reenviar link
        </Button>
      ) : (
        <Link to="/esqueci-senha" className={`text-center text-sm ${classeDoLink}`}>
          Pedir um link
        </Link>
      )}
      <Link
        to="/login"
        search={{ redirect: undefined }}
        className={`text-center text-sm ${classeDoLinkSuave}`}
      >
        Voltar ao login
      </Link>
    </div>
  )
}

/** Destino do link do e-mail: `?token=` (válido) ou `?error=` (vencido ou usado). */
export function TelaRedefinirSenha({
  token,
  erroDoLink,
}: {
  token?: string | undefined
  erroDoLink?: string | undefined
}) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const { enviando, executar } = useEnvio()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | undefined>()

  if (!token || erroDoLink) {
    return (
      <div className="flex flex-col gap-5">
        <Cabecalho
          titulo="Este link não vale mais"
          descricao="O link de nova senha vale por 1 hora e só pode ser usado uma vez."
        />
        <Link to="/esqueci-senha" className="contents">
          <Button variant="primary" block size="lg">
            Pedir um novo link
          </Button>
        </Link>
        <Link
          to="/login"
          search={{ redirect: undefined }}
          className={`text-center text-sm ${classeDoLinkSuave}`}
        >
          Voltar ao login
        </Link>
      </div>
    )
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    if (!senhaForte(senha)) {
      setErro('A senha precisa cumprir as regras abaixo.')
      return focarCampo('nova-senha')
    }
    void executar(async () => {
      const r = await servicos.redefinirSenha(token, senha)
      if (!r.ok) {
        setErro(r.erro.mensagem)
        return
      }
      toast.success('Senha alterada', {
        description: 'As outras sessões foram encerradas. Entre com a nova senha.',
      })
      await navegar({ to: '/login', search: { redirect: undefined } })
    })
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <Cabecalho
        titulo="Criar senha nova"
        descricao="Escolha uma senha que você não usa em outro lugar."
      />
      <CampoDeSenha
        id="nova-senha"
        label="Senha nova"
        autoComplete="new-password"
        autoFocus
        value={senha}
        onChange={(e) => {
          setSenha(e.target.value)
          setErro(undefined)
        }}
        error={erro}
        aria-describedby="regras-senha"
      />
      <RegrasDeSenha senha={senha} id="regras-senha" />
      <Button type="submit" variant="primary" block size="lg" loading={enviando}>
        Salvar nova senha
      </Button>
    </form>
  )
}

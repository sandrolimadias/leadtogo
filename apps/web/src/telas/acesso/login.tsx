import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { Globe } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { chaveDoMe, destinoSeguro } from '@/auth/guardas'
import { useServicos } from '@/auth/contexto'
import type { ErroDeAcesso } from '@/auth/tipos'
import { CampoDeSenha } from '@/components/acesso/campo-de-senha'
import { Cabecalho, DivisorOu } from '@/components/acesso/layout'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Alert } from '@leadtogo/ui/feedback'

import { classeDoLink, EMAIL_VALIDO, focarCampo, useEnvio } from './comum'

export function TelaDeLogin({ redirect }: { redirect?: string | undefined }) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const opcoes = useQuery({ queryKey: ['opcoes-de-acesso'], queryFn: servicos.opcoes })
  const primeiroAcesso = useQuery({
    queryKey: ['primeiro-acesso-aberto'],
    queryFn: servicos.primeiroAcessoAberto,
  })
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [tentou, setTentou] = useState(false)
  const [falha, setFalha] = useState<ErroDeAcesso | null>(null)

  const erroDoEmail = tentou && !EMAIL_VALIDO.test(email) ? 'Informe um e-mail válido.' : undefined
  const erroDaSenha = tentou && !senha ? 'Digite a senha.' : undefined

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (!EMAIL_VALIDO.test(email)) return focarCampo('login-email')
    if (!senha) return focarCampo('login-senha')
    setFalha(null)
    void executar(async () => {
      const r = await servicos.entrar(email.trim(), senha)
      if (!r.ok) {
        setFalha(r.erro)
        return
      }
      await queryClient.invalidateQueries({ queryKey: chaveDoMe })
      if (r.dados.doisFatores) {
        await navegar({ to: '/verificacao', search: { redirect } })
      } else {
        await navegar({ to: destinoSeguro(redirect) })
      }
    })
  }

  const naoConfirmado = falha?.codigo === 'EMAIL_NOT_VERIFIED'
  const contaOuSenha =
    falha?.codigo === 'INVALID_EMAIL_OR_PASSWORD' || falha?.codigo === 'USER_NOT_FOUND'

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      <Cabecalho titulo="Entrar" descricao="Use o e-mail do trabalho." />
      {opcoes.data?.loginGoogle ? (
        <>
          <Button icon={Globe} block size="lg" onClick={() => void servicos.entrarComGoogle()}>
            Entrar com Google
          </Button>
          <DivisorOu />
        </>
      ) : null}
      <TextField
        id="login-email"
        label="E-mail"
        type="email"
        autoComplete="email"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={erroDoEmail}
      />
      <div className="flex flex-col gap-1.5">
        <CampoDeSenha
          id="login-senha"
          label="Senha"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value)
            setFalha(null)
          }}
          error={erroDaSenha}
        />
        <Link to="/esqueci-senha" className={`self-end text-[13px] ${classeDoLink}`}>
          Esqueci a senha
        </Link>
      </div>
      {falha ? (
        <Alert
          tone={naoConfirmado ? 'warning' : 'danger'}
          title={
            contaOuSenha
              ? 'E-mail ou senha não conferem'
              : naoConfirmado
                ? 'Confirme seu e-mail'
                : 'Não foi possível entrar'
          }
        >
          {contaOuSenha ? 'Confira e tente de novo.' : falha.mensagem}
        </Alert>
      ) : null}
      <Button type="submit" variant="primary" block size="lg" loading={enviando}>
        Entrar
      </Button>
      {primeiroAcesso.data ? (
        <span className="text-center text-sm text-ink-muted">
          Ainda não usa o Leadtogo?{' '}
          <Link to="/primeiro-acesso" className={classeDoLink}>
            Criar conta
          </Link>
        </span>
      ) : null}
    </form>
  )
}

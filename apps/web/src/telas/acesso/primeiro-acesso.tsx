import { cnpjValido } from '@leadtogo/shared'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleCheck, Lock } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { CampoDeSenha } from '@/components/acesso/campo-de-senha'
import { Cabecalho, Selo } from '@/components/acesso/layout'
import { RegrasDeSenha, senhaForte } from '@/components/acesso/regras-de-senha'
import { Button } from '@leadtogo/ui/button'
import { TextField } from '@leadtogo/ui/campos'
import { Checkbox } from '@leadtogo/ui/checkbox'
import { Alert, Skeleton } from '@leadtogo/ui/feedback'
import { Icon } from '@leadtogo/ui/icone'
import { cn } from '@leadtogo/ui/cn'

import { classeDoLink, EMAIL_VALIDO, focarCampo, useEnvio } from './comum'

const PASSOS = ['Conta', 'Empresa', 'Pronto'] as const

interface Conta {
  nome: string
  email: string
  senha: string
}
interface Empresa {
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
}

function Passos({ atual }: { atual: number }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-ink-muted">
        Passo {atual + 1} de 3 · {PASSOS[atual]}
      </span>
      <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
        {PASSOS.map((p, i) => (
          <div
            key={p}
            className={cn('h-1 rounded-full', i <= atual ? 'bg-brand' : 'bg-surface-sunken')}
          />
        ))}
      </div>
    </div>
  )
}

/** Primeiro acesso: conta → empresa → "Tudo pronto". Só existe com `GET /v1/primeiro-acesso/estado` aberto. */
export function TelaDePrimeiroAcesso() {
  const servicos = useServicos()
  const navegar = useNavigate()
  const { enviando, executar } = useEnvio()
  const estado = useQuery({
    queryKey: ['primeiro-acesso-aberto'],
    queryFn: servicos.primeiroAcessoAberto,
    staleTime: 0,
  })
  const [passo, setPasso] = useState(0)
  const [conta, setConta] = useState<Conta>({ nome: '', email: '', senha: '' })
  const [termos, setTermos] = useState(false)
  const [empresa, setEmpresa] = useState<Empresa>({ razaoSocial: '', nomeFantasia: '', cnpj: '' })
  const [tentou, setTentou] = useState(false)
  const [erroDoEmail, setErroDoEmail] = useState<string | undefined>()
  const [erroDoCnpj, setErroDoCnpj] = useState<string | undefined>()
  const [falha, setFalha] = useState<string | undefined>()
  const [verificacaoPendente, setVerificacaoPendente] = useState(false)

  if (estado.isPending) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Carregando">
        <Skeleton height={28} width="60%" />
        <Skeleton lines={3} />
      </div>
    )
  }

  if (!estado.data) {
    return (
      <div className="flex flex-col gap-5">
        <Selo>
          <Lock size={22} strokeWidth={1.75} aria-hidden="true" />
        </Selo>
        <Cabecalho
          titulo="O cadastro está fechado"
          descricao="Novas contas só entram por convite. Peça um convite ao administrador da sua empresa; se você já tem conta, entre por aqui."
        />
        <Link to="/login" search={{ redirect: undefined }} className="contents">
          <Button variant="primary" block size="lg">
            Ir para o login
          </Button>
        </Link>
      </div>
    )
  }

  const erroDoNome = tentou && conta.nome.trim().length < 2 ? 'Informe seu nome.' : undefined
  const erroDoEmailMostrado =
    erroDoEmail ??
    (tentou && !EMAIL_VALIDO.test(conta.email) ? 'Informe um e-mail válido.' : undefined)
  const erroDaSenha =
    tentou && !senhaForte(conta.senha) ? 'A senha precisa cumprir as regras abaixo.' : undefined

  const continuar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (conta.nome.trim().length < 2) return focarCampo('pa-nome')
    if (!EMAIL_VALIDO.test(conta.email)) return focarCampo('pa-email')
    if (!senhaForte(conta.senha)) return focarCampo('pa-senha')
    if (!termos) return focarCampo('pa-termos')
    setTentou(false)
    setPasso(1)
  }

  const criar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (empresa.razaoSocial.trim().length < 2) return focarCampo('pa-razao')
    if (empresa.cnpj.trim() && !cnpjValido(empresa.cnpj)) {
      setErroDoCnpj('CNPJ inválido. Confira os números.')
      return focarCampo('pa-cnpj')
    }
    setFalha(undefined)
    void executar(async () => {
      const r = await servicos.criarPrimeiroAcesso({
        nome: conta.nome.trim(),
        email: conta.email.trim(),
        senha: conta.senha,
        empresa: {
          razaoSocial: empresa.razaoSocial.trim(),
          ...(empresa.nomeFantasia.trim() ? { nomeFantasia: empresa.nomeFantasia.trim() } : {}),
          ...(empresa.cnpj.trim() ? { cnpj: empresa.cnpj.trim() } : {}),
        },
      })
      if (!r.ok) {
        if (r.erro.codigo === 'email_ja_cadastrado') {
          setErroDoEmail(r.erro.mensagem)
          setTentou(false)
          setPasso(0)
        } else setFalha(r.erro.mensagem)
        return
      }
      setVerificacaoPendente(r.dados.verificacaoEmailPendente)
      setTentou(false)
      setPasso(2)
    })
  }

  const entrar = () => {
    void executar(async () => {
      const r = await servicos.entrar(conta.email.trim(), conta.senha)
      setConta((c) => ({ ...c, senha: '' }))
      // A guarda do app leva o administrador para a ativação do 2FA
      if (r.ok) await navegar({ to: '/' })
      else await navegar({ to: '/login', search: { redirect: undefined } })
    })
  }

  if (passo === 0) {
    return (
      <form onSubmit={continuar} noValidate className="flex flex-col gap-5">
        <Passos atual={0} />
        <Cabecalho titulo="Criar sua conta" descricao="Você será o administrador." />
        <TextField
          id="pa-nome"
          label="Seu nome"
          autoComplete="name"
          autoFocus
          value={conta.nome}
          onChange={(e) => setConta({ ...conta, nome: e.target.value })}
          error={erroDoNome}
        />
        <TextField
          id="pa-email"
          label="E-mail do trabalho"
          type="email"
          autoComplete="email"
          value={conta.email}
          onChange={(e) => {
            setConta({ ...conta, email: e.target.value })
            setErroDoEmail(undefined)
          }}
          error={erroDoEmailMostrado}
        />
        <CampoDeSenha
          id="pa-senha"
          label="Senha"
          autoComplete="new-password"
          value={conta.senha}
          onChange={(e) => setConta({ ...conta, senha: e.target.value })}
          error={erroDaSenha}
          aria-describedby="pa-regras"
        />
        <RegrasDeSenha senha={conta.senha} id="pa-regras" />
        <Checkbox
          id="pa-termos"
          label="Li e aceito os termos de uso e a política de privacidade"
          checked={termos}
          onChange={(e) => setTermos(e.target.checked)}
        />
        {tentou && !termos ? (
          <span role="alert" className="-mt-3 text-xs font-medium text-danger">
            Aceite os termos para continuar.
          </span>
        ) : null}
        <Button type="submit" variant="primary" block size="lg">
          Continuar
        </Button>
        <span className="text-center text-sm text-ink-muted">
          Já tem conta?{' '}
          <Link to="/login" search={{ redirect: undefined }} className={classeDoLink}>
            Entrar
          </Link>
        </span>
      </form>
    )
  }

  if (passo === 1) {
    return (
      <form onSubmit={criar} noValidate className="flex flex-col gap-5">
        <Passos atual={1} />
        <Cabecalho
          titulo="Sua primeira empresa"
          descricao="A empresa que vende. Dá para criar outras depois."
        />
        <TextField
          id="pa-razao"
          label="Razão social"
          required
          autoComplete="organization"
          autoFocus
          value={empresa.razaoSocial}
          onChange={(e) => setEmpresa({ ...empresa, razaoSocial: e.target.value })}
          error={
            tentou && empresa.razaoSocial.trim().length < 2 ? 'Informe a razão social.' : undefined
          }
        />
        <TextField
          id="pa-fantasia"
          label="Nome de exibição"
          hint="Como a empresa aparece no seletor. Se vazio, usa a razão social."
          value={empresa.nomeFantasia}
          onChange={(e) => setEmpresa({ ...empresa, nomeFantasia: e.target.value })}
        />
        <TextField
          id="pa-cnpj"
          label="CNPJ"
          mono
          placeholder="00.000.000/0000-00"
          hint="Opcional. Aceita o CNPJ alfanumérico."
          value={empresa.cnpj}
          onChange={(e) => {
            setEmpresa({ ...empresa, cnpj: e.target.value })
            setErroDoCnpj(undefined)
          }}
          error={erroDoCnpj}
        />
        {falha ? (
          <Alert tone="danger" title="Não foi possível criar a conta">
            {falha}
          </Alert>
        ) : null}
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              setTentou(false)
              setPasso(0)
            }}
          >
            Voltar
          </Button>
          <div className="flex-1">
            <Button type="submit" variant="primary" block size="lg" loading={enviando}>
              Criar empresa
            </Button>
          </div>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <Passos atual={2} />
      <Selo>
        <CircleCheck size={22} strokeWidth={1.75} aria-hidden="true" />
      </Selo>
      <Cabecalho
        titulo="Tudo pronto"
        descricao="Sua conta e sua empresa foram criadas. Os cadastros padrão (tags, funil, tipos de atividade) chegam com as telas de configuração."
      />
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {[
          ['Conta', conta.email],
          ['Empresa', empresa.nomeFantasia.trim() || empresa.razaoSocial.trim()],
          ['Seu papel', 'Administrador'],
        ].map(([titulo, detalhe]) => (
          <li key={titulo} className="flex items-start gap-2">
            <span className="flex pt-0.5 text-success">
              <Icon icon={CircleCheck} size={14} />
            </span>
            <span>
              <b>{titulo}</b> <span className="text-ink-muted">{detalhe}</span>
            </span>
          </li>
        ))}
      </ul>
      {verificacaoPendente ? (
        <>
          <Alert tone="info" title="Confirme seu e-mail">
            Enviamos um link para {conta.email}. Confirme o e-mail para entrar.
          </Alert>
          <Link to="/login" search={{ redirect: undefined }} className="contents">
            <Button variant="primary" block size="lg">
              Ir para o login
            </Button>
          </Link>
        </>
      ) : (
        <>
          <Alert tone="info">
            Falta um passo: administradores protegem a conta com a verificação em duas etapas.
          </Alert>
          <Button variant="primary" block size="lg" loading={enviando} onClick={entrar}>
            Continuar
          </Button>
        </>
      )}
    </div>
  )
}

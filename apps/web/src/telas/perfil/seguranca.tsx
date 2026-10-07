import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Copy, ShieldCheck, ShieldOff } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import type { Me } from '@leadtogo/api-client'
import { useServicos } from '@/auth/contexto'
import { ROTULO_DO_PAPEL } from '@/casca/navegacao'
import { nomeDaEmpresa } from '@/casca/utilidades'
import { chaveDoMe } from '@/auth/guardas'
import { CampoDeCodigo } from '@/components/acesso/campo-de-codigo'
import { CampoDeSenha } from '@/components/acesso/campo-de-senha'
import { Badge } from '@/components/ui/exibicao'
import { Button } from '@/components/ui/button'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { FluxoDeAtivacao } from '@/telas/acesso/ativar-dois-fatores'
import { focarCampo, useEnvio } from '@/telas/acesso/comum'

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="m-0 text-[15px] leading-5 font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

/**
 * Meu perfil → Segurança: qualquer usuário (admin, gestor ou vendedor) ativa o 2FA com QR code,
 * gera novos códigos de recuperação e, se nenhuma regra o exigir dele, desativa (senha + código).
 * No E9c esta tela entra na folha de perfil; a rota /perfil/seguranca é o ponto de partida.
 */
export function TelaDeSeguranca() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: [...chaveDoMe, 'seguranca'], queryFn: servicos.me })
  const [ativando, setAtivando] = useState(false)
  const recarregar = () => queryClient.invalidateQueries({ queryKey: chaveDoMe })

  if (me.isPending) {
    return (
      <div role="status" aria-label="Carregando" className="flex flex-col gap-3">
        <Skeleton height={28} width="50%" />
        <Skeleton lines={3} />
      </div>
    )
  }
  const usuario = me.data?.usuario
  if (!usuario) return null

  const ativo = usuario.twoFactorEnabled
  const obrigatorio = me.data?.doisFatoresObrigatorio === true

  const topo = (
    <>
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-[13px] text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
        Voltar
      </Link>
      <h1 className="m-0 text-2xl leading-[30px] font-semibold">Segurança</h1>
    </>
  )

  if (ativando) {
    return (
      <div className="flex flex-col gap-5">
        {topo}
        <FluxoDeAtivacao
          aoCancelar={() => setAtivando(false)}
          aoConcluir={async () => {
            await recarregar()
            await me.refetch()
            setAtivando(false)
            toast.success('Verificação em duas etapas ativada')
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {topo}
      <Cartao titulo="Verificação em duas etapas">
        <div className="flex items-center gap-2">
          {ativo ? (
            <Badge tone="success" icon={ShieldCheck}>
              Ativa
            </Badge>
          ) : (
            <Badge icon={ShieldOff}>Desativada</Badge>
          )}
        </div>
        <p className="m-0 text-ink-muted">
          Além da senha, o login pede um código de 6 números do app autenticador no seu celular.
        </p>
        {!ativo ? (
          <Button
            variant="primary"
            icon={ShieldCheck}
            onClick={() => setAtivando(true)}
            className="self-start"
          >
            Ativar verificação em duas etapas
          </Button>
        ) : null}
      </Cartao>

      {ativo ? <NovosCodigos /> : null}
      {ativo ? (
        <Desativar
          obrigatorio={obrigatorio}
          motivo={motivoEmTexto(me.data)}
          aoDesativar={async () => {
            await recarregar()
            await me.refetch()
          }}
        />
      ) : null}
    </div>
  )
}

/** O motivo real da obrigatoriedade, dito pelo servidor: administrador da conta ou a política da empresa. */
function motivoEmTexto(me: Me | null | undefined): string {
  const m = me?.doisFatoresMotivo
  if (!m) return 'Uma regra de segurança exige a verificação em duas etapas de você.'
  if (m.origem === 'conta') {
    return 'Você é administrador(a) da conta, e administradores da conta sempre precisam da verificação em duas etapas.'
  }
  const empresa = me?.empresas.find((e) => e.id === m.empresaId)
  const nome = empresa ? nomeDaEmpresa(empresa) : 'da sua empresa'
  const papel = m.papel ? ROTULO_DO_PAPEL[m.papel].toLowerCase() : 'membro'
  return `A política de segurança da empresa ${nome} exige a verificação em duas etapas de quem tem o papel de ${papel} nela.`
}

function NovosCodigos() {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | undefined>()
  const [codigos, setCodigos] = useState<string[] | null>(null)

  const gerar = (e: FormEvent) => {
    e.preventDefault()
    if (!senha) {
      setErro('Digite a senha.')
      return focarCampo('codigos-senha')
    }
    void executar(async () => {
      const r = await servicos.gerarNovosCodigos(senha)
      if (!r.ok) {
        setErro(r.erro.codigo === 'INVALID_PASSWORD' ? 'Senha incorreta.' : r.erro.mensagem)
        return
      }
      setSenha('')
      setCodigos(r.dados)
    })
  }

  return (
    <Cartao titulo="Códigos de recuperação">
      <p className="m-0 text-ink-muted">
        Cada código entra uma vez no lugar do app, se você perder o celular. Gerar novos invalida os
        anteriores.
      </p>
      {codigos ? (
        <div className="flex flex-col gap-3">
          <Alert tone="warning">Guarde estes códigos agora: eles não aparecem de novo.</Alert>
          <ul
            aria-label="Novos códigos de recuperação"
            className="m-0 grid list-none grid-cols-2 gap-2 rounded-md border border-border bg-surface-sunken p-4 font-mono text-[13px]"
          >
            {codigos.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              icon={Copy}
              onClick={() =>
                void navigator.clipboard
                  .writeText(codigos.join('\n'))
                  .then(() => toast.success('Códigos copiados'))
                  .catch(() => toast.error('Não foi possível copiar'))
              }
            >
              Copiar os códigos
            </Button>
            <Button variant="ghost" onClick={() => setCodigos(null)}>
              Pronto, guardei
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={gerar} noValidate className="flex flex-col gap-3">
          <CampoDeSenha
            id="codigos-senha"
            label="Senha"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => {
              setSenha(e.target.value)
              setErro(undefined)
            }}
            error={erro}
          />
          <Button type="submit" loading={enviando} className="self-start">
            Gerar novos códigos
          </Button>
        </form>
      )}
    </Cartao>
  )
}

function Desativar({
  obrigatorio,
  motivo,
  aoDesativar,
}: {
  obrigatorio: boolean
  motivo: string
  aoDesativar: () => Promise<void>
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [erroDaSenha, setErroDaSenha] = useState<string | undefined>()
  const [erroDoCodigo, setErroDoCodigo] = useState<string | undefined>()

  if (obrigatorio) {
    return (
      <Cartao titulo="Desativar">
        <Alert tone="info" title="A verificação em duas etapas é obrigatória para você">
          {motivo} Por isso ela não pode ser desativada.
        </Alert>
      </Cartao>
    )
  }

  const desativar = (e: FormEvent) => {
    e.preventDefault()
    if (!senha) {
      setErroDaSenha('Digite a senha.')
      return focarCampo('desativar-senha')
    }
    if (codigo.length < 6) {
      setErroDoCodigo('Digite os 6 números do código.')
      return
    }
    void executar(async () => {
      const r = await servicos.desativarDoisFatores(senha, codigo)
      if (!r.ok) {
        if (r.erro.codigo === 'INVALID_PASSWORD') setErroDaSenha('Senha incorreta.')
        else setErroDoCodigo(r.erro.mensagem)
        return
      }
      toast.success('Verificação em duas etapas desativada')
      await aoDesativar()
    })
  }

  return (
    <Cartao titulo="Desativar">
      <p className="m-0 text-ink-muted">
        Para desativar, confirme a senha e digite um código atual do app.
      </p>
      <form onSubmit={desativar} noValidate className="flex flex-col gap-3">
        <CampoDeSenha
          id="desativar-senha"
          label="Senha"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => {
            setSenha(e.target.value)
            setErroDaSenha(undefined)
          }}
          error={erroDaSenha}
        />
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Código do app autenticador</span>
          <CampoDeCodigo
            autoFocus={false}
            valor={codigo}
            onChange={(c) => {
              setCodigo(c)
              setErroDoCodigo(undefined)
            }}
            erro={erroDoCodigo}
          />
        </div>
        <Button type="submit" variant="danger-ghost" loading={enviando} className="self-start">
          Desativar verificação
        </Button>
      </form>
    </Cartao>
  )
}

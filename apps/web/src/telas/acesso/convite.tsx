import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { MailX } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { CampoDeSenha } from '@/components/acesso/campo-de-senha'
import { Cabecalho, Selo } from '@/components/acesso/layout'
import { RegrasDeSenha, senhaForte } from '@/components/acesso/regras-de-senha'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/campos'
import { Checkbox } from '@/components/ui/checkbox'
import { iniciais } from '@/components/ui/cores'
import { Alert, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'

import { focarCampo, useEnvio } from './comum'

const PAPEL: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  vendedor: 'Vendedor',
}

/** Destino do link do convite (`?token=`). Consulta o convite e cria a conta ou aceita com a existente. */
export function TelaDeConvite({ token }: { token?: string | undefined }) {
  const servicos = useServicos()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()

  const consulta = useQuery({
    queryKey: ['convite', token],
    enabled: Boolean(token),
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const r = await servicos.consultarConvite(token ?? '')
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const sessao = useQuery({ queryKey: [...chaveDoMe, 'convite'], queryFn: servicos.me })

  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [termos, setTermos] = useState(false)
  const [tentou, setTentou] = useState(false)
  const [falha, setFalha] = useState<string | undefined>()

  if (!token || consulta.isError) {
    return (
      <div className="flex flex-col gap-5">
        <Selo>
          <MailX size={22} strokeWidth={1.75} aria-hidden="true" />
        </Selo>
        <Cabecalho
          titulo="Convite inválido"
          descricao="Este convite não existe, venceu ou já foi usado. Peça um novo ao administrador da empresa."
        />
        <Link to="/login" search={{ redirect: undefined }} className="contents">
          <Button block size="lg">
            Ir para o login
          </Button>
        </Link>
      </div>
    )
  }

  if (consulta.isPending || sessao.isPending) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Carregando o convite">
        <Skeleton height={64} />
        <Skeleton lines={3} />
      </div>
    )
  }

  const convite = consulta.data
  const empresa = convite.empresa.nomeFantasia ?? convite.empresa.razaoSocial
  const me = sessao.data
  // o perfil de acesso que a pessoa terá (o rótulo do papel, em convite antigo sem perfil)
  const perfil = convite.perfil ?? PAPEL[convite.papel] ?? convite.papel

  const aoAceitar = async () => {
    toast.success(`Bem-vindo(a) à ${empresa}`, {
      description: `Você entrou com o perfil ${perfil}.`,
    })
    await queryClient.invalidateQueries({ queryKey: chaveDoMe })
    await navegar({ to: '/' })
  }

  const cartao = (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3.5">
      <span
        aria-hidden="true"
        className="flex size-10 flex-none items-center justify-center rounded-lg bg-tag-teal-bg font-bold text-tag-teal-fg"
      >
        {iniciais(empresa)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{empresa}</span>
        <span className="text-[13px] text-ink-muted">
          Convite para entrar com o perfil {perfil}
        </span>
      </div>
    </div>
  )

  // Já existe conta com este e-mail: entra nela e aceita
  if (convite.contaExistente) {
    const daContaCerta = me?.usuario.email.toLowerCase() === convite.email.toLowerCase()
    return (
      <div className="flex flex-col gap-5">
        {cartao}
        <Cabecalho titulo="Aceitar convite" descricao={convite.email} />
        {falha ? (
          <Alert tone="danger" title="Não foi possível aceitar">
            {falha}
          </Alert>
        ) : null}
        {daContaCerta ? (
          <Button
            variant="primary"
            block
            size="lg"
            autoFocus
            loading={enviando}
            onClick={() =>
              void executar(async () => {
                const r = await servicos.aceitarConvite({ token })
                if (r.ok) await aoAceitar()
                else setFalha(r.erro.mensagem)
              })
            }
          >
            Aceitar convite
          </Button>
        ) : (
          <>
            {me ? (
              <Alert tone="warning">
                Você está logado como {me.usuario.email}, mas o convite é para {convite.email}.
              </Alert>
            ) : (
              <span className="text-ink-muted">
                Já existe uma conta com este e-mail. Entre com ela e a empresa aparece no seu
                seletor.
              </span>
            )}
            <Button
              variant="primary"
              block
              size="lg"
              autoFocus
              loading={enviando}
              onClick={() =>
                void executar(async () => {
                  if (me) {
                    await servicos.sair()
                    await queryClient.invalidateQueries({ queryKey: chaveDoMe })
                  }
                  await navegar({
                    to: '/login',
                    search: { redirect: `/convite?token=${encodeURIComponent(token)}` },
                  })
                })
              }
            >
              {me ? 'Sair e entrar com a conta convidada' : 'Entrar para aceitar'}
            </Button>
          </>
        )}
      </div>
    )
  }

  const erroDoNome = tentou && nome.trim().length < 2 ? 'Informe seu nome.' : undefined
  const erroDaSenha =
    tentou && !senhaForte(senha) ? 'A senha precisa cumprir as regras abaixo.' : undefined

  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (nome.trim().length < 2) return focarCampo('convite-nome')
    if (!senhaForte(senha)) return focarCampo('convite-senha')
    if (!termos) return focarCampo('convite-termos')
    setFalha(undefined)
    void executar(async () => {
      const r = await servicos.aceitarConvite({ token, nome: nome.trim(), senha })
      if (!r.ok) {
        setFalha(r.erro.mensagem)
        return
      }
      const entrada = await servicos.entrar(convite.email, senha)
      if (!entrada.ok) {
        // A conta foi criada: só o login automático falhou
        toast.info('Conta criada', {
          description: 'Entre com o e-mail e a senha que você acabou de criar.',
        })
        await navegar({ to: '/login', search: { redirect: undefined } })
        return
      }
      await aoAceitar()
    })
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      {cartao}
      <Cabecalho titulo="Aceitar convite" descricao={convite.email} />
      <TextField
        id="convite-nome"
        label="Seu nome"
        required
        autoComplete="name"
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        error={erroDoNome}
      />
      <CampoDeSenha
        id="convite-senha"
        label="Crie uma senha"
        autoComplete="new-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        error={erroDaSenha}
        aria-describedby="regras-convite"
      />
      <RegrasDeSenha senha={senha} id="regras-convite" />
      <Checkbox
        id="convite-termos"
        label="Li e aceito os termos de uso e a política de privacidade"
        checked={termos}
        onChange={(e) => setTermos(e.target.checked)}
      />
      {tentou && !termos ? (
        <span role="alert" className="-mt-3 text-xs font-medium text-danger">
          Aceite os termos para criar a conta.
        </span>
      ) : null}
      {falha ? (
        <Alert tone="danger" title="Não foi possível aceitar">
          {falha}
        </Alert>
      ) : null}
      <Button type="submit" variant="primary" block size="lg" loading={enviando}>
        Aceitar e entrar
      </Button>
    </form>
  )
}

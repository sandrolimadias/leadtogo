import type { ConviteResumo, MembroDaEquipe } from '@leadtogo/api-client'
import type { PapelMembro } from '@leadtogo/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CirclePause, Mail, MailX, UserPlus, Users } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { Button } from '@/components/ui/button'
import { Select, TextField } from '@/components/ui/campos'
import { Dialog } from '@/components/ui/dialog'
import { Avatar, Badge } from '@/components/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { toast } from '@/components/ui/toast'
import { ROTULO_DO_PAPEL } from '@/casca/navegacao'
import { EMAIL_VALIDO, focarCampo, useEnvio } from '@/telas/acesso/comum'

const chaveDaEquipe = ['equipe'] as const
const chaveDosConvites = ['convites'] as const

const OPCOES_DE_PAPEL = (Object.keys(ROTULO_DO_PAPEL) as PapelMembro[]).map((p) => ({
  value: p,
  label: ROTULO_DO_PAPEL[p],
}))

/** AAAA-MM-DD (já no fuso de São Paulo, vindo da API) → DD/MM/AAAA, sem passar por Date (sem fuso). */
const dataDoDia = (dia: string) => dia.split('-').reverse().join('/')
const dataDoInstante = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

type Confirmacao =
  | { tipo: 'desativar'; membro: MembroDaEquipe }
  | { tipo: 'rebaixar'; membro: MembroDaEquipe; papel: PapelMembro }
  | { tipo: 'cancelar'; convite: ConviteResumo }

/** Configurações → Usuários e equipe: membros, convites pendentes, papéis e desativação (só administrador). */
export function TelaDeUsuarios() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const me = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me })
  const equipe = useQuery({
    queryKey: chaveDaEquipe,
    retry: false,
    queryFn: async () => {
      const r = await servicos.equipe()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const convites = useQuery({
    queryKey: chaveDosConvites,
    retry: false,
    queryFn: async () => {
      const r = await servicos.convitesPendentes()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const [convidando, setConvidando] = useState(false)
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null)
  const [erroDaConfirmacao, setErroDaConfirmacao] = useState<string | undefined>()

  const meuEmail = me.data?.usuario.email.toLowerCase()
  const recarregar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: chaveDaEquipe }),
      queryClient.invalidateQueries({ queryKey: chaveDosConvites }),
    ])

  const alterar = (
    m: MembroDaEquipe,
    dados: { papel?: PapelMembro; ativo?: boolean },
    ok: string,
  ) =>
    executar(async () => {
      const r = await servicos.alterarMembro(m.id, dados)
      if (!r.ok) {
        setErroDaConfirmacao(r.erro.mensagem)
        toast.error('Não foi possível alterar', { description: r.erro.mensagem })
        await recarregar()
        return
      }
      setConfirmacao(null)
      setErroDaConfirmacao(undefined)
      toast.success(ok)
      await recarregar()
    })

  const reenviar = (c: ConviteResumo) =>
    executar(async () => {
      const r = await servicos.convidar({ email: c.email, papel: c.papel })
      if (!r.ok) {
        toast.error('Não foi possível reenviar', { description: r.erro.mensagem })
        return
      }
      toast.success(`Convite reenviado para ${c.email}`, {
        description: 'O anterior deixou de valer.',
      })
      await recarregar()
    })

  const cancelar = (c: ConviteResumo) =>
    executar(async () => {
      const r = await servicos.cancelarConvite(c.id)
      if (!r.ok) {
        setErroDaConfirmacao(r.erro.mensagem)
        await recarregar()
        return
      }
      setConfirmacao(null)
      setErroDaConfirmacao(undefined)
      toast.success('Convite cancelado')
      await recarregar()
    })

  const cabecalho = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="m-0 text-[17px] leading-6 font-semibold">Usuários e equipe</h2>
        <p className="m-0 text-sm text-ink-muted">
          Quem usa o Leadtogo nesta empresa e com qual papel.
        </p>
      </div>
      <Button variant="primary" icon={UserPlus} onClick={() => setConvidando(true)}>
        Convidar pessoa
      </Button>
    </div>
  )

  if (equipe.isPending || convites.isPending) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Carregando a equipe">
        {cabecalho}
        <Skeleton lines={4} />
      </div>
    )
  }
  if (equipe.isError || convites.isError) {
    const mensagem = equipe.error?.message ?? convites.error?.message ?? ''
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Alert
          tone="danger"
          title="Não foi possível carregar a equipe"
          actions={
            <Button
              size="sm"
              onClick={() => {
                void equipe.refetch()
                void convites.refetch()
              }}
            >
              Tentar de novo
            </Button>
          }
        >
          {mensagem}
        </Alert>
      </div>
    )
  }

  const membros = equipe.data
  const pendentes = convites.data
  const ativos = membros.filter((m) => m.ativo).length
  const soEu = membros.length <= 1 && pendentes.length === 0

  return (
    <div className="flex flex-col gap-4">
      {cabecalho}
      {soEu ? (
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState
            icon={Users}
            title="Você é a única pessoa por aqui"
            description="Convide a equipe por e-mail: cada pessoa entra com o papel que você escolher."
            actions={
              <Button variant="primary" icon={UserPlus} onClick={() => setConvidando(true)}>
                Convidar pessoa
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <p className="m-0 text-[13px] text-ink-muted" aria-live="polite">
            {ativos} {ativos === 1 ? 'ativo' : 'ativos'} · {pendentes.length}{' '}
            {pendentes.length === 1 ? 'convite pendente' : 'convites pendentes'}
          </p>
          <ul className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-border bg-surface p-0">
            {membros.map((m) => {
              const sou = m.email?.toLowerCase() === meuEmail
              return (
                <li
                  key={m.id}
                  aria-label={m.nome}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
                  style={m.ativo ? undefined : { background: 'var(--surface-sunken)' }}
                >
                  <div className="flex min-w-[200px] flex-1 items-center gap-3">
                    <Avatar name={m.nome} />
                    <div className="flex min-w-0 flex-col">
                      <span className={m.ativo ? 'font-semibold' : 'font-semibold text-ink-muted'}>
                        {m.nome}
                        {sou ? <span className="font-normal text-ink-muted"> (você)</span> : null}
                      </span>
                      <span className="text-xs break-words text-ink-muted">
                        {m.temLogin ? (m.email ?? '') : 'Sem login'}
                      </span>
                    </div>
                  </div>
                  <div className="w-[170px] max-md:w-full">
                    <Select
                      aria-label={`Papel de ${m.nome}`}
                      value={m.papel}
                      options={OPCOES_DE_PAPEL}
                      disabled={sou || enviando}
                      onChange={(e) => {
                        const novo = e.target.value as PapelMembro
                        if (m.papel === 'admin') {
                          setErroDaConfirmacao(undefined)
                          setConfirmacao({ tipo: 'rebaixar', membro: m, papel: novo })
                        } else {
                          void alterar(
                            m,
                            { papel: novo },
                            `${m.nome} agora é ${ROTULO_DO_PAPEL[novo].toLowerCase()}`,
                          )
                        }
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge
                      tone={m.ativo ? 'success' : 'neutral'}
                      icon={m.ativo ? CircleCheck : CirclePause}
                    >
                      {m.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Badge tone="outline">{m.temLogin ? 'Com acesso' : 'Sem acesso'}</Badge>
                  </div>
                  <span className="w-[130px] text-[13px] text-ink-muted max-md:w-auto">
                    {m.ultimoAcesso
                      ? `Acesso em ${dataDoDia(m.ultimoAcesso)}`
                      : m.temLogin
                        ? 'Nunca entrou'
                        : '—'}
                  </span>
                  <div className="w-[96px] text-right max-md:w-auto">
                    {sou ? null : m.ativo ? (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        disabled={enviando}
                        onClick={() => {
                          setErroDaConfirmacao(undefined)
                          setConfirmacao({ tipo: 'desativar', membro: m })
                        }}
                      >
                        Desativar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={enviando}
                        onClick={() => void alterar(m, { ativo: true }, `${m.nome} foi reativado`)}
                      >
                        Reativar
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
            {pendentes.map((c) => (
              <li
                key={c.id}
                aria-label={`Convite para ${c.email}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="flex min-w-[200px] flex-1 items-center gap-3">
                  <Avatar name={c.email} />
                  <div className="flex min-w-0 flex-col">
                    <span className="font-semibold break-words">{c.email}</span>
                    <span className="text-xs text-ink-muted">
                      {c.situacao === 'expirado'
                        ? `Venceu em ${dataDoInstante(c.expiraEm)}`
                        : `Expira em ${dataDoInstante(c.expiraEm)}`}
                    </span>
                  </div>
                </div>
                <span className="w-[170px] text-sm max-md:w-full">{ROTULO_DO_PAPEL[c.papel]}</span>
                <div className="flex flex-wrap gap-1.5">
                  {c.situacao === 'expirado' ? (
                    <Badge tone="warning" icon={MailX}>
                      Convite expirado
                    </Badge>
                  ) : (
                    <Badge tone="info" icon={Mail}>
                      Convidado
                    </Badge>
                  )}
                </div>
                <span className="w-[130px] max-md:hidden" />
                <div className="flex w-[96px] flex-col items-end gap-1 max-md:w-auto max-md:flex-row">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={enviando}
                    onClick={() => void reenviar(c)}
                  >
                    Reenviar
                  </Button>
                  <Button
                    variant="danger-ghost"
                    size="sm"
                    disabled={enviando}
                    onClick={() => {
                      setErroDaConfirmacao(undefined)
                      setConfirmacao({ tipo: 'cancelar', convite: c })
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[13px] text-ink-muted">
            “Sem acesso” é o vendedor cadastrado só para receber carteira, sem login. Desativar não
            apaga o histórico.
          </p>
        </>
      )}

      <DialogoDeConvite
        aberto={convidando}
        aoFechar={() => setConvidando(false)}
        aoConvidar={recarregar}
      />

      <Dialog
        open={confirmacao !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmacao(null)
        }}
        title={
          confirmacao?.tipo === 'desativar'
            ? `Desativar ${confirmacao.membro.nome}?`
            : confirmacao?.tipo === 'rebaixar'
              ? `Mudar o papel de ${confirmacao.membro.nome}?`
              : 'Cancelar este convite?'
        }
        description={
          confirmacao?.tipo === 'desativar'
            ? 'A pessoa perde o acesso a esta empresa na hora. O histórico é mantido e você pode reativá-la depois.'
            : confirmacao?.tipo === 'rebaixar'
              ? `Hoje é administrador; passará a ${ROTULO_DO_PAPEL[confirmacao.papel].toLowerCase()} e perde o acesso às configurações.`
              : 'O link enviado por e-mail deixa de valer.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmacao(null)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              loading={enviando}
              onClick={() => {
                if (!confirmacao) return
                if (confirmacao.tipo === 'desativar') {
                  void alterar(
                    confirmacao.membro,
                    { ativo: false },
                    `${confirmacao.membro.nome} foi desativado`,
                  )
                } else if (confirmacao.tipo === 'rebaixar') {
                  void alterar(
                    confirmacao.membro,
                    { papel: confirmacao.papel },
                    `${confirmacao.membro.nome} agora é ${ROTULO_DO_PAPEL[confirmacao.papel].toLowerCase()}`,
                  )
                } else {
                  void cancelar(confirmacao.convite)
                }
              }}
            >
              {confirmacao?.tipo === 'desativar'
                ? 'Desativar'
                : confirmacao?.tipo === 'rebaixar'
                  ? 'Mudar papel'
                  : 'Cancelar convite'}
            </Button>
          </>
        }
      >
        {erroDaConfirmacao ? (
          <Alert tone="danger" title="Não foi possível concluir">
            {erroDaConfirmacao}
          </Alert>
        ) : null}
      </Dialog>
    </div>
  )
}

/** Diálogo "Convidar pessoa": e-mail e papel; o convite vale por 7 dias. */
function DialogoDeConvite({
  aberto,
  aoFechar,
  aoConvidar,
}: {
  aberto: boolean
  aoFechar: () => void
  aoConvidar: () => Promise<unknown>
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [email, setEmail] = useState('')
  const [papel, setPapel] = useState<PapelMembro>('vendedor')
  const [tentou, setTentou] = useState(false)
  const [falha, setFalha] = useState<string | undefined>()
  const emailInvalido = tentou && !EMAIL_VALIDO.test(email.trim())

  const fechar = () => {
    setEmail('')
    setPapel('vendedor')
    setTentou(false)
    setFalha(undefined)
    aoFechar()
  }
  const enviar = (e: FormEvent) => {
    e.preventDefault()
    setTentou(true)
    if (!EMAIL_VALIDO.test(email.trim())) return focarCampo('convite-email')
    setFalha(undefined)
    void executar(async () => {
      const r = await servicos.convidar({ email: email.trim(), papel })
      if (!r.ok) {
        setFalha(
          r.erro.codigo === 'ja_e_membro' ? 'Este e-mail já faz parte da equipe.' : r.erro.mensagem,
        )
        return
      }
      if (r.dados.emailEnviado) {
        toast.success(`Convite enviado para ${r.dados.email}`, { description: 'Vale por 7 dias.' })
      } else {
        toast.warning('Convite criado, mas o e-mail não saiu', {
          description: 'O envio de e-mails não está configurado. Avise o suporte.',
        })
      }
      await aoConvidar()
      fechar()
    })
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) fechar()
      }}
      title="Convidar pessoa"
      description="O convite vale por 7 dias."
      footer={
        <>
          <Button variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-convite" loading={enviando}>
            Enviar convite
          </Button>
        </>
      }
    >
      <form id="form-convite" noValidate onSubmit={enviar} className="flex flex-col gap-4">
        <TextField
          id="convite-email"
          label="E-mail"
          type="email"
          required
          autoFocus
          autoComplete="off"
          placeholder="nome@empresa.com.br"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailInvalido ? 'Informe um e-mail válido.' : undefined}
        />
        <Select
          id="convite-papel"
          label="Papel"
          value={papel}
          options={OPCOES_DE_PAPEL}
          hint="Administrador configura tudo. Gestor vê a equipe. Vendedor vê a própria carteira."
          onChange={(e) => setPapel(e.target.value as PapelMembro)}
        />
        {falha ? (
          <Alert tone="danger" title="Não foi possível convidar">
            {falha}
          </Alert>
        ) : null}
      </form>
    </Dialog>
  )
}

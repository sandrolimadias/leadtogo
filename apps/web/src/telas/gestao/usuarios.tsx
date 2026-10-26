import type { ConviteResumo, MembroDaEquipe, PerfilDeAcesso } from '@leadtogo/api-client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CirclePause, Mail, MailX, UserPlus, Users } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { useServicos } from '@/auth/contexto'
import { chaveDoMe } from '@/auth/guardas'
import { usePermissoes } from '@/auth/permissoes'
import { Button } from '@leadtogo/ui/button'
import { Select, TextField } from '@leadtogo/ui/campos'
import { Dialog } from '@leadtogo/ui/dialog'
import { Avatar, Badge } from '@leadtogo/ui/exibicao'
import { Alert, EmptyState, Skeleton } from '@leadtogo/ui/feedback'
import { toast } from '@leadtogo/ui/toast'
import { ROTULO_DO_PAPEL } from '@/casca/navegacao'
import { EMAIL_VALIDO, focarCampo, useEnvio } from '@/telas/acesso/comum'
import { chaveDosPerfis } from '@/telas/perfis/chaves'

const chaveDaEquipe = ['equipe'] as const
const chaveDosConvites = ['convites'] as const

/** Nome do perfil do membro ou do convite (o rótulo do papel legado, se ainda não houver perfil). */
const nomeDoPerfil = (x: { perfil?: { nome: string } | null; papel: MembroDaEquipe['papel'] }) =>
  x.perfil?.nome ?? ROTULO_DO_PAPEL[x.papel]

const geraPerfis = (p: PerfilDeAcesso | undefined) => p?.permissoes['perfis.gerir'] !== undefined

/** AAAA-MM-DD (já no fuso de São Paulo, vindo da API) → DD/MM/AAAA, sem passar por Date (sem fuso). */
const dataDoDia = (dia: string) => dia.split('-').reverse().join('/')
const dataDoInstante = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

type Confirmacao =
  | { tipo: 'desativar'; membro: MembroDaEquipe }
  | { tipo: 'rebaixar'; membro: MembroDaEquipe; perfil: PerfilDeAcesso }
  | { tipo: 'cancelar'; convite: ConviteResumo }

/**
 * Configurações → Usuários e equipe: membros, convites pendentes, perfil de acesso e desativação.
 * Desativar e convites: `equipe.gerir`; trocar o perfil e convidar (convidar é atribuir um perfil):
 * também `perfis.gerir`. A API decide; a tela só esconde.
 */
export function TelaDeUsuarios() {
  const servicos = useServicos()
  const queryClient = useQueryClient()
  const { enviando, executar } = useEnvio()
  const { pode } = usePermissoes()
  const geraOsPerfis = pode('perfis.gerir')
  const geraAEquipe = pode('equipe.gerir')
  const me = useQuery({ queryKey: chaveDoMe, queryFn: servicos.me })
  const perfis = useQuery({
    queryKey: chaveDosPerfis,
    retry: false,
    enabled: geraOsPerfis,
    queryFn: async () => {
      const r = await servicos.perfis.listar()
      if (!r.ok) throw new Error(r.erro.mensagem)
      return r.dados
    },
  })
  const perfisAtivos = (perfis.data ?? []).filter((p) => p.ativo)
  const opcoesDePerfil = perfisAtivos.map((p) => ({ value: p.id, label: p.nome }))
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
      queryClient.invalidateQueries({ queryKey: chaveDosPerfis }),
    ])

  const alterar = (
    m: MembroDaEquipe,
    dados: { perfil?: PerfilDeAcesso; ativo?: boolean },
    ok: string,
  ) =>
    executar(async () => {
      const r = dados.perfil
        ? await servicos.atribuirPerfil(m.id, dados.perfil.id)
        : await servicos.alterarMembro(m.id, { ativo: dados.ativo ?? m.ativo })
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
      const r = await servicos.convidar(
        c.perfil ? { email: c.email, perfilId: c.perfil.id } : { email: c.email, papel: c.papel },
      )
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
          Quem usa o Leadtogo nesta empresa e com qual perfil de acesso.
        </p>
      </div>
      {geraOsPerfis && geraAEquipe ? (
        <Button variant="primary" icon={UserPlus} onClick={() => setConvidando(true)}>
          Convidar pessoa
        </Button>
      ) : null}
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
            description="Convide a equipe por e-mail: cada pessoa entra com o perfil de acesso que você escolher."
            actions={
              geraOsPerfis && geraAEquipe ? (
                <Button variant="primary" icon={UserPlus} onClick={() => setConvidando(true)}>
                  Convidar pessoa
                </Button>
              ) : undefined
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
                    {geraOsPerfis && opcoesDePerfil.length > 0 ? (
                      <Select
                        aria-label={`Perfil de ${m.nome}`}
                        value={m.perfil?.id ?? ''}
                        options={opcoesDePerfil}
                        disabled={sou || enviando}
                        onChange={(e) => {
                          const novo = perfisAtivos.find((p) => p.id === e.target.value)
                          if (!novo) return
                          const atual = perfisAtivos.find((p) => p.id === m.perfil?.id)
                          if (geraPerfis(atual) && !geraPerfis(novo)) {
                            setErroDaConfirmacao(undefined)
                            setConfirmacao({ tipo: 'rebaixar', membro: m, perfil: novo })
                          } else {
                            void alterar(
                              m,
                              { perfil: novo },
                              `${m.nome} agora tem o perfil ${novo.nome}`,
                            )
                          }
                        }}
                      />
                    ) : (
                      <span className="text-sm">{nomeDoPerfil(m)}</span>
                    )}
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
                    {sou || !geraAEquipe ? null : m.ativo ? (
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
                <span className="w-[170px] text-sm max-md:w-full">{nomeDoPerfil(c)}</span>
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
                  {geraOsPerfis ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={enviando}
                      onClick={() => void reenviar(c)}
                    >
                      Reenviar
                    </Button>
                  ) : null}
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
        perfis={perfisAtivos}
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
              ? `Mudar o perfil de ${confirmacao.membro.nome}?`
              : 'Cancelar este convite?'
        }
        description={
          confirmacao?.tipo === 'desativar'
            ? 'A pessoa perde o acesso a esta empresa na hora. O histórico é mantido e você pode reativá-la depois.'
            : confirmacao?.tipo === 'rebaixar'
              ? `Hoje gere os perfis de acesso; com o perfil ${confirmacao.perfil.nome}, perde essa gestão (e o que mais o perfil novo não tiver).`
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
                    { perfil: confirmacao.perfil },
                    `${confirmacao.membro.nome} agora tem o perfil ${confirmacao.perfil.nome}`,
                  )
                } else {
                  void cancelar(confirmacao.convite)
                }
              }}
            >
              {confirmacao?.tipo === 'desativar'
                ? 'Desativar'
                : confirmacao?.tipo === 'rebaixar'
                  ? 'Mudar perfil'
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

/** Diálogo "Convidar pessoa": e-mail e perfil de acesso (padrão: Vendedor); o convite vale por 7 dias. */
function DialogoDeConvite({
  aberto,
  perfis,
  aoFechar,
  aoConvidar,
}: {
  aberto: boolean
  perfis: PerfilDeAcesso[]
  aoFechar: () => void
  aoConvidar: () => Promise<unknown>
}) {
  const servicos = useServicos()
  const { enviando, executar } = useEnvio()
  const [email, setEmail] = useState('')
  const padrao = perfis.find((p) => p.chaveSistema === 'vendedor')?.id ?? perfis[0]?.id ?? ''
  const [escolhido, setPerfil] = useState<string>('')
  const perfilId = escolhido || padrao
  const [tentou, setTentou] = useState(false)
  const [falha, setFalha] = useState<string | undefined>()
  const emailInvalido = tentou && !EMAIL_VALIDO.test(email.trim())

  const fechar = () => {
    setEmail('')
    setPerfil('')
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
      const r = await servicos.convidar({ email: email.trim(), perfilId })
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
          id="convite-perfil"
          label="Perfil de acesso"
          value={perfilId}
          options={perfis.map((p) => ({ value: p.id, label: p.nome }))}
          hint="O que a pessoa pode fazer nesta empresa. Os perfis ficam em Configurações → Perfis de acesso."
          onChange={(e) => setPerfil(e.target.value)}
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
